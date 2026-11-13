/*
 * chatbot.js - "Mynelle Assistant"
 *
 * A local chat assistant for the admin pages. It answers questions about the
 * system's own data (products, stock, expiry, sales, orders, staff) by reading
 * the same browser storage the rest of the app uses. Nothing is sent online and
 * no AI service is needed: it understands questions with keyword + fuzzy
 * product matching and builds the answers from live data.
 *
 * Needs: settings-store.js (MynelleStore). Optional: orders-store.js (Orders),
 * time-store.js (TimeStore), auth-store.js (MynelleAuth).
 * Add to a page with:  <script src="../js/chatbot.js"></script>  (after ui-assist.js)
 */
(function () {
  "use strict";
  if (window.__mynelleChat) return;
  window.__mynelleChat = true;

  var script = document.currentScript;
  var BASE = script && script.src ? script.src.replace(/js\/chatbot\.js(\?.*)?$/, "") : "../";
  var DAY = 864e5;
  var HOUR = 36e5;
  var MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  var WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var S, O, T, AUTH;

  /* ------------------------------------------------------------------ */
  /* small helpers                                                       */
  /* ------------------------------------------------------------------ */
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function money(n) { return S.formatCurrency(Number(n) || 0); }
  function int(n) { return Math.round(Number(n) || 0).toLocaleString("en-US"); }
  function dec1(n) { return (Math.round((Number(n) || 0) * 10) / 10).toLocaleString("en-US"); }
  function plural(n, one, many) { n = Math.round(n); return int(n) + " " + (n === 1 ? one : many || one + "s"); }
  function sod(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function weekStart(d) { var x = sod(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
  function dShort(d) { return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }); }
  function dLong(d) { return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
  function ymd(s) { return s ? new Date(s + "T00:00:00") : null; }
  function pctChg(cur, prev) { return prev > 0 ? ((cur - prev) / prev) * 100 : null; }
  function chg(c) {
    if (c === null) return '<span class="mc-muted">no earlier data</span>';
    return '<span class="mc-' + (c >= 0 ? "up" : "down") + '">' + (c >= 0 ? "\u25B2 +" : "\u25BC \u2212") + Math.abs(c).toFixed(1) + "%</span>";
  }
  function p(h) { return "<p>" + h + "</p>"; }
  function b(t) { return "<b>" + esc(t) + "</b>"; }
  function a(href, label) { return '<a class="mc-link" href="' + esc(href) + '">' + esc(label) + "</a>"; }
  function pill(text, tone) { return '<span class="mc-pill mc-' + tone + '">' + esc(text) + "</span>"; }
  function ul(items) { return '<ul class="mc-list">' + items.map(function (i) { return "<li>" + i + "</li>"; }).join("") + "</ul>"; }
  function kpis(items) {
    return '<div class="mc-kpis">' + items.map(function (k) {
      return '<div class="mc-kpi' + (k.tone ? " mc-t-" + k.tone : "") + '"><span>' + esc(k.label) + "</span><strong>" + k.value + "</strong>" + (k.sub ? "<small>" + k.sub + "</small>" : "") + "</div>";
    }).join("") + "</div>";
  }
  function table(head, rows, num) {
    num = num || [];
    // drop columns that are empty in every row (e.g. an "on order" column nobody uses)
    var keep = head.map(function (h, i) { return rows.some(function (r) { return String(r[i] == null ? "" : r[i]) !== ""; }); });
    if (keep.indexOf(false) > -1) {
      var map = [];
      keep.forEach(function (k, i) { if (k) map.push(i); });
      num = num.map(function (n) { return map.indexOf(n); }).filter(function (n) { return n > -1; });
      head = map.map(function (i) { return head[i]; });
      rows = rows.map(function (r) { return map.map(function (i) { return r[i]; }); });
    }
    function cls(i) { return num.indexOf(i) > -1 ? ' class="n"' : ""; }
    return '<div class="mc-table"><table><thead><tr>' + head.map(function (h, i) { return "<th" + cls(i) + ">" + esc(h) + "</th>"; }).join("") +
      "</tr></thead><tbody>" + rows.map(function (r) {
        return "<tr>" + r.map(function (c, i) { return "<td" + cls(i) + ">" + c + "</td>"; }).join("") + "</tr>";
      }).join("") + "</tbody></table></div>";
  }
  function bars(items) {
    var max = Math.max.apply(null, items.map(function (i) { return i.value; }).concat([1]));
    return '<div class="mc-bars">' + items.map(function (i) {
      return '<div class="mc-bar"><div class="mc-bar-top"><span>' + i.label + "</span><em>" + i.text + '</em></div><div class="mc-bar-track"><i style="width:' +
        Math.max(2, Math.round((i.value / max) * 100)) + '%"></i></div></div>';
    }).join("") + "</div>";
  }
  function more(total, shown, href, label) {
    return total > shown ? '<p class="mc-small">+ ' + int(total - shown) + " more. " + (href ? a(href, label || "See the full list") : "") + "</p>" : "";
  }
  function reply(html, chips) { return { html: html, chips: chips || [] }; }
  function pLink(pr, period) {
    return a("product-detail.html?id=" + encodeURIComponent(pr.id) + (period ? "&period=" + encodeURIComponent(period) : ""), pr.name);
  }

  /* ------------------------------------------------------------------ */
  /* data helpers                                                        */
  /* ------------------------------------------------------------------ */
  function products() { return S.getProducts(); }
  function sales() { return S.getSales(); }
  function salesBetween(from, to) {
    var f = from.getTime(), t = to.getTime();
    return sales().filter(function (s) { var x = new Date(s.at).getTime(); return x >= f && x < t; });
  }
  function totals(list) {
    var r = 0, u = 0;
    list.forEach(function (s) { r += S.saleTotal(s); u += S.saleQty(s); });
    return { revenue: r, count: list.length, units: u, avg: list.length ? r / list.length : 0 };
  }
  function soldBy(list) {
    var m = {};
    list.forEach(function (s) {
      s.items.forEach(function (i) {
        var r = m[i.productId] || (m[i.productId] = { id: i.productId, name: i.name, units: 0, revenue: 0 });
        r.units += i.qty;
        r.revenue += i.qty * i.price;
      });
    });
    return m;
  }
  function velocity() {
    var from = Date.now() - 30 * DAY, u = {}, v = {};
    sales().forEach(function (s) {
      if (new Date(s.at).getTime() < from) return;
      s.items.forEach(function (i) { u[i.productId] = (u[i.productId] || 0) + i.qty; });
    });
    Object.keys(u).forEach(function (k) { v[k] = u[k] / 30; });
    return v;
  }
  function stockOf(pr) { return Number(pr.stock) || 0; }
  function isOut(pr) { return stockOf(pr) <= 0; }
  function isLow(pr) { return !isOut(pr) && S.isLowStock(pr); }
  function onOrder(id) { return O && O.incoming ? O.incoming(id) : 0; }
  function catOf(pr) { return pr.category || "Others"; }
  function statusPill(pr) { return isOut(pr) ? pill("Out of stock", "red") : isLow(pr) ? pill("Low stock", "orange") : pill("In stock", "green"); }
  function qtyText(pr, n) {
    var bd = pr.packaging && pr.packaging.length ? S.breakdown(n, pr) : "";
    return S.formatQty(n, pr.unit) + (bd ? " (" + bd + ")" : "");
  }
  function costOf(pr) {
    if (O && O.estCost) return O.estCost(pr);
    return { cost: Math.round(Number(pr.price) * 70) / 100, estimated: true };
  }
  function inCat(ctx) {
    return function (pr) { return !ctx.cat || catOf(pr) === ctx.cat; };
  }
  function catNote(ctx) { return ctx.cat ? " in " + b(ctx.cat) : ""; }

  /* ------------------------------------------------------------------ */
  /* understanding the question                                          */
  /* ------------------------------------------------------------------ */
  var NUMWORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, fourteen: 14, fifteen: 15, twenty: 20, thirty: 30, sixty: 60, ninety: 90 };
  var NUMRE = "(\\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|twelve|fourteen|fifteen|twenty|thirty|sixty|ninety)";
  var FIXES = [
    [/\bstok\b|\bstoks\b/g, "stock"], [/\bexpire?d?s?\b(?=\s*(soon|items))/g, "expiring"], [/\bexpiry\b/g, "expiry"],
    [/\bsells?\b/g, "sell"], [/\bwhats\b/g, "what is"], [/\bhow's\b/g, "how is"], [/\bwhat's\b/g, "what is"],
    [/\bprofits\b/g, "profit"], [/\binventorys\b/g, "inventory"], [/\bre-?order\b/g, "reorder"], [/\bre-?stock\b/g, "restock"],
  ];
  function norm(q) {
    var t = " " + String(q).toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"') + " ";
    t = t.replace(/(\d)\s*(mg|ml|mcg|g|l|%)(?![a-z])/g, "$1$2");
    FIXES.forEach(function (f) { t = t.replace(f[0], f[1]); });
    return t.replace(/\s+/g, " ").trim();
  }
  function numOf(w) { return /^\d+$/.test(w) ? parseInt(w, 10) : NUMWORDS[w] || 0; }

  function mkPeriod(label, from, to, pf, pt, pl) {
    return { label: label, from: from, to: to, prevFrom: pf, prevTo: pt, prevLabel: pl };
  }
  function sameSpan(prevFrom, curFrom, now, limit) {
    return new Date(Math.min(prevFrom.getTime() + (now - curFrom), limit.getTime()));
  }
  function periodByName(name) { return parsePeriod(name); }

  function parsePeriod(t) {
    var now = new Date(), today = sod(now), m, i;
    if (/\btoday\b/.test(t) || /\bso far today\b/.test(t)) {
      var y = addDays(today, -1);
      return mkPeriod("Today", today, now, y, sameSpan(y, today, now, today), "yesterday");
    }
    if (/\byesterday\b/.test(t)) return mkPeriod("Yesterday", addDays(today, -1), today, addDays(today, -2), addDays(today, -1), "the day before");
    if (/\b(this|current) week\b/.test(t)) {
      var w = weekStart(today), pw = addDays(w, -7);
      return mkPeriod("This week", w, now, pw, sameSpan(pw, w, now, w), "last week");
    }
    if (/\b(this|current) month\b/.test(t)) {
      var ms = new Date(today.getFullYear(), today.getMonth(), 1), pm = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      return mkPeriod("This month", ms, now, pm, sameSpan(pm, ms, now, ms), "last month");
    }
    if (/\b(this|current) year\b|\bytd\b|\byear to date\b/.test(t)) {
      var ys = new Date(today.getFullYear(), 0, 1), py = new Date(today.getFullYear() - 1, 0, 1);
      return mkPeriod("This year", ys, now, py, sameSpan(py, ys, now, ys), "last year");
    }
    if (/\b(last|previous) week\b/.test(t)) {
      var lw = addDays(weekStart(today), -7);
      return mkPeriod("Last week", lw, addDays(lw, 7), addDays(lw, -7), lw, "the week before");
    }
    if (/\b(last|previous) month\b/.test(t)) {
      var lm = new Date(today.getFullYear(), today.getMonth() - 1, 1), cm = new Date(today.getFullYear(), today.getMonth(), 1);
      return mkPeriod("Last month", lm, cm, new Date(today.getFullYear(), today.getMonth() - 2, 1), lm, "the month before");
    }
    if (/\b(last|previous) year\b/.test(t)) {
      var ly = new Date(today.getFullYear() - 1, 0, 1), cy = new Date(today.getFullYear(), 0, 1);
      return mkPeriod("Last year", ly, cy, new Date(today.getFullYear() - 2, 0, 1), ly, "the year before");
    }
    m = t.match(new RegExp("\\b(?:last|past|previous)\\s+" + NUMRE + "\\s+(hour|day|week|month)s?\\b"));
    if (m) {
      var n = numOf(m[1]) || 1, unit = m[2] === "hour" ? HOUR : m[2] === "day" ? DAY : m[2] === "week" ? 7 * DAY : 30 * DAY;
      var from = new Date(now - n * unit), len = now - from;
      return mkPeriod("Last " + n + " " + m[2] + (n === 1 ? "" : "s"), from, now, new Date(from - len), from, "the " + n + " " + m[2] + (n === 1 ? "" : "s") + " before");
    }
    m = t.match(/\b(?:past|last)\s+(week|month)\b/);
    if (m) {
      var d = m[1] === "week" ? 7 : 30, f2 = new Date(now - d * DAY);
      return mkPeriod("Last " + d + " days", f2, now, new Date(f2 - d * DAY), f2, "the " + d + " days before");
    }
    if (/\b(all time|overall|ever|lifetime|to date|since the (start|beginning)|in total|all sales)\b/.test(t)) {
      return mkPeriod("All time", new Date(0), now, null, null, "");
    }
    for (i = 0; i < 12; i++) {
      var full = MONTHS[i], abbr = full.slice(0, 3);
      var re = new RegExp("\\b(?:(?:in|for|during|of|last)\\s+)(?:" + full + "|" + abbr + ")\\b|\\b" + (full === "may" ? "(?!)" : full) + "\\b");
      if (re.test(t)) {
        var ym = t.match(/\b(20\d\d)\b/);
        var yr = ym ? parseInt(ym[1], 10) : i <= today.getMonth() ? today.getFullYear() : today.getFullYear() - 1;
        var mf = new Date(yr, i, 1), mt = new Date(yr, i + 1, 1);
        return mkPeriod(full.charAt(0).toUpperCase() + full.slice(1) + " " + yr, mf, mt > now ? now : mt, new Date(yr, i - 1, 1), mf, MONTHS[(i + 11) % 12]);
      }
    }
    return null;
  }
  function parseAhead(t) {
    var m = t.match(new RegExp("\\b(?:next|coming|within|in the next|in|over the next)\\s+" + NUMRE + "\\s+(day|week|month)s?\\b"));
    if (m) return (numOf(m[1]) || 1) * (m[2] === "day" ? 1 : m[2] === "week" ? 7 : 30);
    if (/\bnext week\b/.test(t)) return 7;
    if (/\bnext month\b/.test(t)) return 30;
    return null;
  }
  function parseN(t) {
    var m = t.match(new RegExp("\\b(?:top|best|worst|first|bottom)\\s+" + NUMRE + "\\b")) || t.match(new RegExp("\\b" + NUMRE + "\\s+(?:best|top|worst|slowest|fastest|products|items|medicines)\\b"));
    var n = m ? numOf(m[1]) : 0;
    return n > 0 ? Math.min(n, 20) : 0;
  }
  function defaultPeriod(ctx, name) { return ctx.period || periodByName(name); }

  /* ---- products ---- */
  var STOP = {};
  ("a an the of for in on at to from by with and or is are was were be been do does did have has had can could would should will what which who whom whose how many much any some all me my our we us you your i it its this that these those there here show tell give list please pls get find see check about around than then also just only into out up down over under again still yet more most less least very really now currently current latest recent recently " +
    "stock stocks stocked left available availability remaining remain price prices cost costs sold sell selling sales sale revenue unit units quantity qty level levels expire expires expiry expiring expired batch batches lot lots reorder restock order orders run runs running last lasts days day week weeks month months year years today yesterday tomorrow tonight value worth total totals number count info information detail details data report summary " +
    "best top worst slow slowest fastest fast moving popular low high critical soon near zero none no not product products item items medicine medicines drug drugs category categories payment payments cash gcash cashier cashiers forecast predict compare versus vs trend profit margin busiest peak hour hours staff account accounts transaction transactions supplier purchase suggest suggestions recommend why where when alert alerts inventory system pharmacy store shop business analytics analysis insight insights need needs needed should want make made earn sold much per average avg daily weekly monthly yearly time during between vs next coming within before after ahead soon may might get got happen happening doing tell open overdue pending incoming status healthy health seller sellers estimated expected expect").split(" ").forEach(function (w) { STOP[w] = 1; });
  var GENERIC = {};
  "tablet tablets capsule capsules syrup cream ointment solution inhaler piece pieces powder sachet drops drop gel lotion suspension injection mg ml mcg g oral".split(" ").forEach(function (w) { GENERIC[w] = 1; });

  function tokens(s) {
    return String(s || "").toLowerCase().replace(/(\d)\s*(mg|ml|mcg|g|l|%)(?![a-z])/g, "$1$2").split(/[^a-z0-9%]+/).filter(function (x) { return x.length > 1; });
  }
  function lev(x, y, max) {
    if (Math.abs(x.length - y.length) > max) return max + 1;
    var prev = [], cur, i, j;
    for (j = 0; j <= y.length; j++) prev[j] = j;
    for (i = 1; i <= x.length; i++) {
      cur = [i];
      var rowMin = i;
      for (j = 1; j <= y.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
        if (cur[j] < rowMin) rowMin = cur[j];
      }
      if (rowMin > max) return max + 1;
      prev = cur;
    }
    return prev[y.length];
  }
  function tokenMatch(q, u) {
    if (q === u) return true;
    if (q.length >= 4 && u.length >= q.length && u.indexOf(q) === 0) return true;
    if (q.length >= 5 && u.length >= 5 && !/\d/.test(q)) return lev(q, u, q.length >= 8 ? 2 : 1) <= (q.length >= 8 ? 2 : 1);
    return false;
  }

  function matchProducts(t) {
    var list = products();
    if (!list.length) return [];
    var info = list.map(function (pr) {
      var set = {};
      tokens([pr.name, pr.brand, pr.genericName, pr.id].join(" ")).forEach(function (x) { set[x] = 1; });
      return { p: pr, toks: Object.keys(set) };
    });
    var N = list.length, df = {};
    info.forEach(function (r) { r.toks.forEach(function (x) { df[x] = (df[x] || 0) + 1; }); });
    function idf(x) { return Math.log(1 + N / (1 + (df[x] || 0))); }

    var q = tokens(t).filter(function (x) { return !STOP[x]; });
    var distinct = q.filter(function (x) { return !GENERIC[x]; });
    if (distinct.length) q = distinct;
    if (!q.length) return [];

    var out = [];
    info.forEach(function (r) {
      var matched = 0, unmatched = 0, best = 0, hits = 0;
      q.forEach(function (x) {
        var hit = null;
        for (var i = 0; i < r.toks.length; i++) if (tokenMatch(x, r.toks[i])) { hit = r.toks[i]; break; }
        if (hit) { var w = idf(hit); matched += w; hits++; if (!/^\d/.test(hit) && w > best) best = w; }
        else unmatched += 0.5 * Math.log(1 + N);
      });
      if (!hits || best < 1) return;
      var score = matched / (matched + unmatched) - 0.004 * Math.max(0, r.toks.length - hits);
      if (score >= 0.5) out.push({ p: r.p, score: score });
    });
    out.sort(function (x, y) { return y.score - x.score; });
    if (!out.length) return [];
    var top = out[0].score;
    return out.filter(function (x) { return top - x.score <= 0.1; }).slice(0, 6).map(function (x) { return x.p; });
  }

  var CAT_ALIASES = [
    [/\banalgesic|antipyretic|pain ?kill|pain relie|fever|headache/, "Analgesics & Antipyretics"],
    [/\bantibiotic|anti-?infective|antimicrobial/, "Antibiotics & Anti-infectives"],
    [/\bantihistamine|\bcough|\bcold\b|\ballerg|\bflu\b/, "Antihistamines, Cough & Cold"],
    [/\bcardio|hypertension|blood pressure|\bheart|cholesterol/, "Cardiovascular & Hypertension"],
    [/\bdiabet|endocrine|blood sugar|insulin/, "Diabetes & Endocrine"],
    [/\bgastro|stomach|\bgi\b|digest|antacid|diarrh/, "Gastrointestinal"],
    [/\brespirat|asthma|\blung/, "Respiratory & Asthma"],
    [/\bdermat|\bskin\b|topical/, "Dermatologicals (Topical)"],
    [/\bophthalm|\botic\b|\beye\b|\bears?\b/, "Ophthalmic & Otic"],
    [/\bvitamin|supplement|multivit/, "Vitamins & Supplements"],
    [/\bwomen|contracept|female|maternal/, "Women's Health & Contraceptives"],
    [/\bfirst ?aid|wound|antiseptic/, "First Aid & Wound Care"],
    [/\bpersonal care|toiletr|hygiene/, "Personal Care & Toiletries"],
    [/\bbaby|babies|infant/, "Baby & Infant Care"],
  ];
  function matchCategory(t) {
    var names = {};
    S.CATEGORIES.forEach(function (c) { names[c] = 1; });
    products().forEach(function (pr) { if (pr.category) names[pr.category] = 1; });
    var all = Object.keys(names), i;
    for (i = 0; i < all.length; i++) if (t.indexOf(all[i].toLowerCase()) > -1) return all[i];
    for (i = 0; i < CAT_ALIASES.length; i++) {
      if (CAT_ALIASES[i][0].test(t) && names[CAT_ALIASES[i][1]]) return CAT_ALIASES[i][1];
    }
    for (i = 0; i < all.length; i++) {
      var words = all[i].toLowerCase().split(/[^a-z]+/).filter(function (w) { return w.length >= 6; });
      if (words.some(function (w) { return t.indexOf(w) > -1; })) return all[i];
    }
    return null;
  }

  /* ------------------------------------------------------------------ */
  /* answers                                                             */
  /* ------------------------------------------------------------------ */
  var H = {};
  var PAGES = [
    { re: /add (a |new )?(product|medicine|item|drug)|new product|create (a )?product/, t: "Add a product", href: "inventory.html", d: "Open Inventory and use the Add product button. Fill in the generic name, strength, category, unit, price and the first batch (lot and expiry date)." },
    { re: /receive|restock|add stock|new (stock|batch|delivery)|deliver/, t: "Receive stock", href: "orders.html", d: "Place a purchase order on Orders and mark it received when the delivery arrives. That adds a new batch to the product and logs the movement. You can also adjust a product's batches directly on Inventory." },
    { re: /purchase order|create (an )?order|place (an )?order|supplier/, t: "Purchase orders", href: "orders.html", d: "Orders lists suggestions based on low stock and sales speed. Create an order, place it, then receive it when it arrives." },
    { re: /archive|restore|remove (a )?product|delete (a )?product/, t: "Archive a product", href: "inventory.html", d: "Archiving on Inventory hides a product from the POS, alerts and reports without losing its history. Archived products can be restored." },
    { re: /export|backup|back up|import|restore data/, t: "Back up or restore data", href: "settings.html", d: "Settings has Export data (backup) and Import (restore). Data lives only in this browser, so export regularly." },
    { re: /theme|dark mode|light mode|density|compact/, t: "Theme and density", href: "settings.html", d: "Settings > General lets you switch between light and dark themes and comfortable or compact density." },
    { re: /admin (account|accounts)|add (an )?admin|new admin/, t: "Admin accounts", href: "admins.html", d: "Admin accounts is where an admin creates and manages other admin accounts." },
    { re: /account|staff|cashier (pin|account)|employee|password|pin\b/, t: "Manage accounts", href: "accounts.html", d: "Manage accounts is where admins add cashiers and pharmacists, set PINs and see attendance. Change your own password under My account." },
    { re: /print|pdf/, t: "Printing", href: "reports.html", d: "Most record pages have a Print button. Reports gives printable summaries." },
    { re: /alert|notification/, t: "Alerts", href: "alerts.html", d: "Alerts lists out-of-stock, low-stock and expiring items. Notifications keeps the history." },
    { re: /image|photo|picture/, t: "Product images", href: "product-images.html", d: "Product images lets you upload a picture per product (it shows in the POS)." },
    { re: /report/, t: "Reports", href: "reports.html", d: "Reports has printable summaries of sales and stock." },
    { re: /analytic|insight|trend/, t: "Analytics", href: "analytics.html", d: "Analytics shows highlights, forecasts, run-out and expiry risks, and recommended actions." },
    { re: /transaction|receipt/, t: "All transactions", href: "sales-all.html", d: "All transactions lists every sale. Open one to see its items, payment and cashier." },
    { re: /reset|clear (all )?data|wipe|sample data/, t: "Reset data", href: "../../clear-data.html", d: "The Clear data utility wipes this browser's saved data. Export a backup first." },
  ];

  H.help = function () {
    var g = function (title, qs) {
      return '<div class="mc-group">' + esc(title) + '</div><div class="mc-chips">' + qs.map(function (q) {
        return '<button type="button" class="mc-chip" data-q="' + esc(q) + '">' + esc(q) + "</button>";
      }).join("") + "</div>";
    };
    var nS = sales().length, nP = products().length;
    var first = sales().reduce(function (m, s) { var x = new Date(s.at); return !m || x < m ? x : m; }, null);
    return reply(
      p("I answer questions from this system's own data: <b>" + int(nP) + "</b> products and <b>" + int(nS) + "</b> transactions" + (first ? " (since " + dShort(first) + ")" : "") + ". Everything stays in your browser. Try:") +
      g("Sales", ["How much did we sell today?", "Compare this month vs last month", "Top 5 best sellers this month", "What are the busiest hours?"]) +
      g("Stock and expiry", ["What is low on stock?", "What is out of stock?", "What is expiring in 30 days?", "Stock of Paracetamol"]) +
      g("Planning", ["What should I reorder?", "Forecast the next 7 days", "Which products will run out soon?", "Open purchase orders"]) +
      g("Money", ["Inventory value", "Estimated profit this month", "Sales by payment method", "Revenue by category"]) +
      g("Team and system", ["Cashier performance", "How many staff accounts?", "How do I add a product?", "Give me an overview"])
    );
  };

  H.smalltalk = function (ctx) {
    if (/^(thanks|thank you|ty|salamat|great|nice|ok(ay)?|cool)\b/.test(ctx.t)) return reply(p("You're welcome! Ask me anything else about your stock or sales."), ["Give me an overview", "What should I reorder?"]);
    if (/^(bye|goodbye|see you)\b/.test(ctx.t)) return reply(p("Goodbye! I'll be here whenever you need numbers."));
    if (/who are you|what are you|your name/.test(ctx.t)) return reply(p("I'm the Mynelle Assistant, a local helper built into this system. I read your saved pharmacy data to answer questions about sales, stock, expiry and orders. I don't use the internet."), ["What can you do?"]);
    var name = "";
    try { var se = AUTH && AUTH.getSession(); name = se && se.account && se.account.fullName ? se.account.fullName.split(" ")[0] : ""; } catch (e) { /* none */ }
    return reply(p("Hi" + (name ? " " + esc(name) : "") + "! What would you like to know about the pharmacy?"), ["Give me an overview", "What is low on stock?", "How much did we sell today?"]);
  };

  /* ---- overview ---- */
  function forecastData() {
    var today = sod(new Date()), hist = [], i, withSales = 0;
    for (i = 28; i >= 1; i--) {
      var d = addDays(today, -i);
      var v = totals(salesBetween(d, addDays(d, 1))).revenue;
      if (v > 0) withSales++;
      hist.push({ date: d, value: v });
    }
    if (withSales < 7) return null;
    var byDow = {};
    hist.forEach(function (h) { (byDow[h.date.getDay()] = byDow[h.date.getDay()] || []).push(h.value); });
    var avgAll = hist.reduce(function (s, h) { return s + h.value; }, 0) / hist.length;
    var l7 = hist.slice(21).reduce(function (s, h) { return s + h.value; }, 0);
    var p7 = hist.slice(14, 21).reduce(function (s, h) { return s + h.value; }, 0);
    var trend = p7 > 0 ? Math.max(0.5, Math.min(1.5, l7 / p7)) : 1;
    var days = [];
    for (i = 0; i < 7; i++) {
      var dd = addDays(today, i), arr = byDow[dd.getDay()] || [];
      var base = arr.length ? arr.reduce(function (s, x) { return s + x; }, 0) / arr.length : avgAll;
      days.push({ date: dd, value: base * trend });
    }
    return { days: days, trend: trend, last7: l7, total: days.reduce(function (s, x) { return s + x.value; }, 0) };
  }

  H.overview = function () {
    var now = new Date(), P = products();
    var td = parsePeriod("today"), mo = parsePeriod("this month");
    var tT = totals(salesBetween(td.from, td.to)), tP = totals(salesBetween(td.prevFrom, td.prevTo));
    var mT = totals(salesBetween(mo.from, mo.to)), mP = totals(salesBetween(mo.prevFrom, mo.prevTo));
    var out = P.filter(isOut), low = P.filter(isLow), exp = P.filter(S.isExpiringSoon);
    var expired = P.filter(function (x) { return S.expiredStock(x) > 0; });
    var value = P.reduce(function (s, x) { return s + stockOf(x) * Number(x.price); }, 0);
    var h = p("Here's where things stand " + esc(now.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })) + ":");
    h += kpis([
      { label: "Sales today", value: money(tT.revenue), sub: plural(tT.count, "transaction") + " \u00B7 " + chg(pctChg(tT.revenue, tP.revenue)) + " vs yesterday so far" },
      { label: "Sales this month", value: money(mT.revenue), sub: plural(mT.count, "transaction") + " \u00B7 " + chg(pctChg(mT.revenue, mP.revenue)) + " vs last month" },
      { label: "Stock value", value: money(value), sub: plural(P.length, "product") },
      { label: "Needs attention", value: int(out.length + low.length + exp.length), sub: out.length + " out \u00B7 " + low.length + " low \u00B7 " + exp.length + " expiring", tone: out.length ? "red" : low.length || exp.length ? "orange" : "green" },
    ]);
    var lines = [];
    var moSold = soldBy(salesBetween(mo.from, mo.to));
    var top = Object.keys(moSold).map(function (k) { return moSold[k]; }).sort(function (x, y) { return y.revenue - x.revenue; })[0];
    if (top) lines.push("Top seller this month: " + b(top.name) + " (" + money(top.revenue) + ").");
    if (out.length) lines.push(b(plural(out.length, "product")) + " out of stock, e.g. " + out.slice(0, 3).map(function (x) { return esc(x.name); }).join(", ") + ".");
    if (expired.length) lines.push(b(plural(expired.length, "product")) + (expired.length === 1 ? " has" : " have") + " expired batches that can no longer be sold.");
    if (O && O.getOrders) {
      var open = O.getOrders().filter(function (o) { return o.status === "ordered"; });
      var late = open.filter(O.isOverdue);
      if (open.length) lines.push(b(plural(open.length, "purchase order")) + " on the way" + (late.length ? ", " + late.length + " overdue" : "") + ".");
    }
    var f = forecastData();
    if (f) lines.push("Expected sales for the next 7 days: " + b(money(f.total)) + " (" + chg(pctChg(f.total, f.last7)) + " vs the last 7 days).");
    if (lines.length) h += ul(lines);
    return reply(h, ["What should I reorder?", "What is expiring soon?", "Compare this month vs last month", "Forecast the next 7 days"]);
  };

  /* ---- sales ---- */
  H.sales = function (ctx) {
    if (!sales().length) return reply(p("There are no sales recorded yet. Sales appear here once the cashier completes transactions in the POS."));
    var per = ctx.period;
    if (!per) {
      var names = ["Today", "This week", "This month", "This year", "All time"];
      var rows = names.map(function (nm) {
        var pr = periodByName(nm.toLowerCase()), tt = totals(salesBetween(pr.from, pr.to));
        var c = pr.prevFrom ? chg(pctChg(tt.revenue, totals(salesBetween(pr.prevFrom, pr.prevTo)).revenue)) : "";
        return [esc(nm), money(tt.revenue) + (c ? "<small>" + c + "</small>" : ""), int(tt.count), int(tt.units), money(tt.avg)];
      });
      return reply(p("Here are your sales by period:") + table(["Period", "Sales", "Txns", "Units", "Avg sale"], rows, [1, 2, 3, 4]) + p(a("sales-analysis.html", "Open Sales analysis")), ["Compare this month vs last month", "Top 5 best sellers this month", "What are the busiest hours?"]);
    }
    var list = salesBetween(per.from, per.to), tt = totals(list);
    if (!list.length) return reply(p("No sales were recorded for " + b(per.label.toLowerCase()) + "."), ["How much did we sell this month?", "How much did we sell all time?"]);
    var pt = per.prevFrom ? totals(salesBetween(per.prevFrom, per.prevTo)) : null;
    var h = p("Sales for " + b(per.label.toLowerCase()) + ":");
    h += kpis([
      { label: "Revenue", value: money(tt.revenue), sub: pt ? chg(pctChg(tt.revenue, pt.revenue)) + " vs " + esc(per.prevLabel) : "" },
      { label: "Transactions", value: int(tt.count), sub: pt ? chg(pctChg(tt.count, pt.count)) : "" },
      { label: "Units sold", value: int(tt.units) },
      { label: "Average sale", value: money(tt.avg), sub: pt ? chg(pctChg(tt.avg, pt.avg)) : "" },
    ]);
    var sb = soldBy(list), top = Object.keys(sb).map(function (k) { return sb[k]; }).sort(function (x, y) { return y.revenue - x.revenue; }).slice(0, 3);
    if (top.length) h += p("Best earners: " + top.map(function (x) { return esc(x.name) + " (" + money(x.revenue) + ")"; }).join(", ") + ".");
    var pay = {};
    list.forEach(function (s) { pay[s.payment || "Cash"] = (pay[s.payment || "Cash"] || 0) + S.saleTotal(s); });
    var pk = Object.keys(pay).sort(function (x, y) { return pay[y] - pay[x]; });
    if (pk.length > 1 && tt.revenue) h += p("Paid by: " + pk.map(function (k) { return esc(k) + " " + Math.round((pay[k] / tt.revenue) * 100) + "%"; }).join(" \u00B7 ") + ".");
    return reply(h, ["Top 5 best sellers " + per.label.toLowerCase(), "Sales by payment method " + per.label.toLowerCase(), "Compare " + per.label.toLowerCase()]);
  };

  H.compare = function (ctx) {
    var per = defaultPeriod(ctx, "this month");
    if (!per.prevFrom) return reply(p("There's no earlier period to compare " + b(per.label.toLowerCase()) + " with. Try \u201Cthis month vs last month\u201D."));
    var cur = salesBetween(per.from, per.to), prev = salesBetween(per.prevFrom, per.prevTo);
    var c = totals(cur), pv = totals(prev);
    if (!c.count && !pv.count) return reply(p("There are no sales in either period to compare."));
    var row = function (label, x, y, fmt) { return [esc(label), fmt(x), fmt(y), chg(pctChg(x, y))]; };
    var h = p("<b>" + esc(per.label) + "</b> compared with " + esc(per.prevLabel) + ":");
    h += table(["", per.label, per.prevLabel, "Change"], [
      row("Revenue", c.revenue, pv.revenue, money), row("Transactions", c.count, pv.count, int),
      row("Units sold", c.units, pv.units, int), row("Average sale", c.avg, pv.avg, money),
    ], [1, 2, 3]);
    var sc = soldBy(cur), sp = soldBy(prev), deltas = [];
    Object.keys(sc).concat(Object.keys(sp)).forEach(function (k, i, arr) {
      if (arr.indexOf(k) !== i) return;
      var d = ((sc[k] && sc[k].revenue) || 0) - ((sp[k] && sp[k].revenue) || 0);
      deltas.push({ name: (sc[k] || sp[k]).name, d: d });
    });
    deltas.sort(function (x, y) { return y.d - x.d; });
    var up = deltas.filter(function (x) { return x.d > 0; }).slice(0, 3), down = deltas.filter(function (x) { return x.d < 0; }).slice(-3).reverse();
    if (up.length) h += p("Growing: " + up.map(function (x) { return esc(x.name) + " (+" + money(x.d) + ")"; }).join(", ") + ".");
    if (down.length) h += p("Slipping: " + down.map(function (x) { return esc(x.name) + " (\u2212" + money(Math.abs(x.d)) + ")"; }).join(", ") + ".");
    return reply(h, ["Top 5 best sellers " + per.label.toLowerCase(), "Which products sell slowly?", "Forecast the next 7 days"]);
  };

  H.top = function (ctx) {
    var per = ctx.period, note = "";
    var byRev = /revenue|income|earn|money|peso|value|profit/.test(ctx.t);
    var n = ctx.n || 5;
    function build(pr) {
      var list = salesBetween(pr.from, pr.to), pm = {};
      products().forEach(function (x) { pm[x.id] = x; });
      var sb = soldBy(list);
      var rows = Object.keys(sb).map(function (k) { return sb[k]; }).filter(function (r) { return !ctx.cat || (pm[r.id] && catOf(pm[r.id]) === ctx.cat); });
      rows.sort(function (x, y) { return byRev ? y.revenue - x.revenue : y.units - x.units; });
      return rows;
    }
    per = per || periodByName("this month");
    var rows = build(per);
    if (!rows.length && !ctx.period) { per = periodByName("all time"); rows = build(per); note = " (nothing sold this month, so this is all time)"; }
    if (!rows.length) return reply(p("No sales found" + catNote(ctx) + " for " + b(per.label.toLowerCase()) + "."));
    var totalRev = rows.reduce(function (s, r) { return s + r.revenue; }, 0), shown = rows.slice(0, n);
    var h = p("Top " + shown.length + " products by " + b(byRev ? "revenue" : "units sold") + catNote(ctx) + ", " + esc(per.label.toLowerCase()) + esc(note) + ":");
    h += table(["#", "Product", "Units", "Revenue", "Share"], shown.map(function (r, i) {
      return [i + 1, a("product-detail.html?id=" + encodeURIComponent(r.id), r.name), int(r.units), money(r.revenue), totalRev ? Math.round((r.revenue / totalRev) * 100) + "%" : "-"];
    }), [0, 2, 3, 4]);
    var share = shown.reduce(function (s, r) { return s + r.revenue; }, 0);
    if (rows.length > shown.length && totalRev) h += p("These " + shown.length + " make up " + b(Math.round((share / totalRev) * 100) + "%") + " of revenue" + catNote(ctx) + ".");
    return reply(h, [byRev ? "Top " + n + " by units" : "Top " + n + " by revenue", "Which products sell slowly?", "Revenue by category"]);
  };

  H.slow = function (ctx) {
    var per = defaultPeriod(ctx, "last 30 days"), n = ctx.n || 8;
    var sb = soldBy(salesBetween(per.from, per.to));
    var rows = products().filter(inCat(ctx)).filter(function (x) { return stockOf(x) > 0; }).map(function (x) {
      return { p: x, sold: sb[x.id] ? sb[x.id].units : 0, val: stockOf(x) * Number(x.price) };
    }).sort(function (x, y) { return x.sold - y.sold || y.val - x.val; });
    if (!rows.length) return reply(p("There are no in-stock products" + catNote(ctx) + " to analyse."));
    var zero = rows.filter(function (r) { return r.sold === 0; }), tied = zero.reduce(function (s, r) { return s + r.val; }, 0);
    var h = p("Slowest movers" + catNote(ctx) + ", " + esc(per.label.toLowerCase()) + ":");
    h += table(["Product", "Sold", "In stock", "Stock value"], rows.slice(0, n).map(function (r) {
      return [pLink(r.p), int(r.sold), esc(qtyText(r.p, stockOf(r.p))), money(r.val)];
    }), [1, 3]);
    h += p(zero.length ? b(plural(zero.length, "product")) + " had <b>no sales</b>, with " + b(money(tied)) + " of stock sitting on the shelf. Consider promotions, smaller reorders, or checking their expiry dates." : "Every in-stock product had at least one sale in this period.");
    return reply(h, ["Which batches may expire before they sell?", "Inventory value", "Top 5 best sellers"]);
  };

  H.categories = function (ctx) {
    var per = ctx.period || periodByName("this month");
    var pm = {}, P = products();
    P.forEach(function (x) { pm[x.id] = x; });
    function byCat(list) {
      var m = {};
      list.forEach(function (s) { s.items.forEach(function (i) { var c = pm[i.productId] ? catOf(pm[i.productId]) : "Others"; m[c] = m[c] || { rev: 0, units: 0 }; m[c].rev += i.qty * i.price; m[c].units += i.qty; }); });
      return m;
    }
    var m = byCat(salesBetween(per.from, per.to)), note = "";
    if (!Object.keys(m).length && !ctx.period) { per = periodByName("all time"); m = byCat(salesBetween(per.from, per.to)); note = " (nothing sold this month, so all time)"; }

    if (ctx.cat) {
      var items = P.filter(inCat(ctx)), r = m[ctx.cat] || { rev: 0, units: 0 };
      var h = p(b(ctx.cat) + ": " + plural(items.length, "product") + ".");
      h += kpis([
        { label: "Revenue (" + per.label.toLowerCase() + ")", value: money(r.rev), sub: plural(r.units, "unit") + " sold" },
        { label: "Stock value", value: money(items.reduce(function (s, x) { return s + stockOf(x) * Number(x.price); }, 0)) },
        { label: "Out / low", value: items.filter(isOut).length + " / " + items.filter(isLow).length, tone: items.filter(isOut).length ? "red" : items.filter(isLow).length ? "orange" : "green" },
        { label: "Expiring soon", value: int(items.filter(S.isExpiringSoon).length) },
      ]);
      var sb = soldBy(salesBetween(per.from, per.to)), top = items.map(function (x) { return { p: x, r: sb[x.id] ? sb[x.id].revenue : 0 }; }).sort(function (x, y) { return y.r - x.r; }).slice(0, 3).filter(function (x) { return x.r > 0; });
      if (top.length) h += p("Best sellers: " + top.map(function (x) { return esc(x.p.name) + " (" + money(x.r) + ")"; }).join(", ") + ".");
      return reply(h + p(a("category-detail.html?c=" + encodeURIComponent(ctx.cat), "Open category page")), ["What is low on stock" + " in " + ctx.cat + "?", "Revenue by category"]);
    }
    var cats = Object.keys(m).sort(function (x, y) { return m[y].rev - m[x].rev; });
    if (!cats.length) return reply(p("No sales found to group by category yet."));
    var total = cats.reduce(function (s, c) { return s + m[c].rev; }, 0);
    return reply(p("Revenue by category, " + esc(per.label.toLowerCase()) + esc(note) + ":") + bars(cats.slice(0, 10).map(function (c) {
      return { label: a("category-detail.html?c=" + encodeURIComponent(c), c), value: m[c].rev, text: money(m[c].rev) + " \u00B7 " + Math.round((m[c].rev / total) * 100) + "%" };
    })) + p(a("category-analysis.html", "Open Category analysis")), ["Inventory value", "Top 5 best sellers"]);
  };

  H.payments = function (ctx) {
    var per = ctx.period || periodByName("this month"), list = salesBetween(per.from, per.to), note = "";
    if (!list.length && !ctx.period) { per = periodByName("all time"); list = salesBetween(per.from, per.to); note = " (nothing sold this month, so all time)"; }
    if (!list.length) return reply(p("No sales found to split by payment method."));
    var m = {}, total = 0;
    list.forEach(function (s) { var k = s.payment || "Cash", v = S.saleTotal(s); m[k] = m[k] || { rev: 0, n: 0 }; m[k].rev += v; m[k].n++; total += v; });
    var keys = Object.keys(m).sort(function (x, y) { return m[y].rev - m[x].rev; });
    return reply(p("Payment methods, " + esc(per.label.toLowerCase()) + esc(note) + ":") + bars(keys.map(function (k) {
      return { label: a("payment-detail.html?m=" + encodeURIComponent(k), k), value: m[k].rev, text: money(m[k].rev) + " \u00B7 " + plural(m[k].n, "sale") + " \u00B7 " + (total ? Math.round((m[k].rev / total) * 100) : 0) + "%" };
    })) + p(a("payment-analysis.html", "Open Payment analysis")), ["Revenue by category", "Cashier performance"]);
  };

  H.timing = function (ctx) {
    var per = defaultPeriod(ctx, "last 30 days"), list = salesBetween(per.from, per.to);
    if (!list.length) return reply(p("No sales in " + b(per.label.toLowerCase()) + " to analyse."));
    var hr = {}, dw = {};
    list.forEach(function (s) {
      var d = new Date(s.at), v = S.saleTotal(s);
      hr[d.getHours()] = hr[d.getHours()] || { n: 0, rev: 0 }; hr[d.getHours()].n++; hr[d.getHours()].rev += v;
      dw[d.getDay()] = dw[d.getDay()] || { n: 0, rev: 0 }; dw[d.getDay()].n++; dw[d.getDay()].rev += v;
    });
    function hl(h) { return (h % 12 || 12) + (h >= 12 ? " PM" : " AM"); }
    var hrs = Object.keys(hr).map(Number).sort(function (x, y) { return hr[y].n - hr[x].n; });
    var days = Object.keys(dw).map(Number).sort(function (x, y) { return dw[y].rev - dw[x].rev; });
    var h = p("Busiest times, " + esc(per.label.toLowerCase()) + ":");
    h += p("Peak hour is " + b(hl(hrs[0]) + " to " + hl((hrs[0] + 1) % 24)) + " with " + plural(hr[hrs[0]].n, "sale") + ". Quietest hour with sales is " + b(hl(hrs[hrs.length - 1])) + ".");
    h += '<div class="mc-group">Top hours</div>' + bars(hrs.slice(0, 5).map(function (x) { return { label: hl(x), value: hr[x].n, text: plural(hr[x].n, "sale") + " \u00B7 " + money(hr[x].rev) }; }));
    h += '<div class="mc-group">By weekday</div>' + bars(days.map(function (x) { return { label: WEEKDAYS[x], value: dw[x].rev, text: money(dw[x].rev) + " \u00B7 " + plural(dw[x].n, "sale") }; }));
    return reply(h + p("Best day: " + b(WEEKDAYS[days[0]]) + ". Slowest: " + b(WEEKDAYS[days[days.length - 1]]) + "."), ["Cashier performance", "Forecast the next 7 days"]);
  };

  H.cashiers = function (ctx) {
    var per = ctx.period || periodByName("this month"), list = salesBetween(per.from, per.to);
    var m = {};
    list.forEach(function (s) { var k = s.cashier || "Not recorded"; m[k] = m[k] || { n: 0, rev: 0 }; m[k].n++; m[k].rev += S.saleTotal(s); });
    var keys = Object.keys(m).sort(function (x, y) { return m[y].rev - m[x].rev; });
    var h = "";
    if (keys.length) {
      h += p("Sales by cashier, " + esc(per.label.toLowerCase()) + ":") + table(["Cashier", "Sales", "Revenue", "Avg sale"], keys.map(function (k) {
        return [esc(k), int(m[k].n), money(m[k].rev), money(m[k].rev / m[k].n)];
      }), [1, 2, 3]);
    } else h += p("No sales were recorded for " + b(per.label.toLowerCase()) + ".");
    if (T && T.getLogs) {
      var hours = {}, f = per.from.getTime(), t = per.to.getTime();
      T.getLogs().forEach(function (l) {
        var i = new Date(l.in).getTime(), o = l.out ? new Date(l.out).getTime() : Date.now();
        if (isNaN(i) || i < f || i >= t) return;
        hours[l.name || l.empId] = (hours[l.name || l.empId] || 0) + (o - i) / HOUR;
      });
      var hk = Object.keys(hours).sort(function (x, y) { return hours[y] - hours[x]; });
      if (hk.length) h += p("Hours worked: " + hk.map(function (k) { return esc(k) + " " + dec1(hours[k]) + " h"; }).join(", ") + ".");
      var open = T.getLogs().filter(function (l) { return !l.out; });
      if (open.length) h += p("Checked in now: " + open.map(function (l) { return esc(l.name || l.empId); }).join(", ") + ".");
    }
    return reply(h + p(a("accounts.html", "Open Manage accounts")), ["How many staff accounts?", "What are the busiest hours?"]);
  };

  H.staff = function () {
    if (!AUTH || !AUTH.listStaff) return reply(p("I can't read the account list on this page."));
    return AUTH.listStaff().then(function (list) {
      if (!list.length) return reply(p("No staff accounts were found."));
      var roles = {}, active = 0;
      list.forEach(function (x) { roles[x.role] = (roles[x.role] || 0) + 1; if (String(x.status).toLowerCase() === "active") active++; });
      return reply(p("There are " + b(plural(list.length, "account")) + " (" + active + " active): " + Object.keys(roles).map(function (r) { return roles[r] + " " + esc(r) + (roles[r] === 1 ? "" : "s"); }).join(", ") + ".") + p(a("accounts.html", "Open Manage accounts")), ["Cashier performance"]);
    });
  };

  /* ---- stock ---- */
  function stockRows(list, withCover) {
    var v = velocity();
    return list.map(function (x) {
      var per = v[x.id] || 0, cover = per > 0 ? stockOf(x) / per : null, inc = onOrder(x.id);
      return [pLink(x) + "<small>" + esc(catOf(x)) + "</small>", esc(S.formatQty(stockOf(x), x.unit)), int(S.criticalLevelFor(x)), withCover ? (cover === null ? "-" : cover < 1 ? "&lt; 1 day" : plural(Math.floor(cover), "day")) : "", inc ? pill(int(inc) + " on order", "blue") : ""];
    });
  }
  H.low = function (ctx) {
    var list = products().filter(inCat(ctx)).filter(isLow).sort(function (x, y) { return stockOf(x) / S.criticalLevelFor(x) - stockOf(y) / S.criticalLevelFor(y); });
    if (!list.length) return reply(p("Nothing" + catNote(ctx) + " is below its critical level right now."), ["What is out of stock?", "What should I reorder?"]);
    var h = p(b(plural(list.length, "product")) + catNote(ctx) + " " + (list.length === 1 ? "is" : "are") + " low on stock (at or below the critical level):");
    h += table(["Product", "Stock", "Critical", "Cover", ""], stockRows(list.slice(0, 8), true), [1, 2]);
    return reply(h + more(list.length, 8, "low-stock.html", "See all low-stock items"), ["What should I reorder?", "What is out of stock?", "Which products will run out soon?"]);
  };
  H.out = function (ctx) {
    var list = products().filter(inCat(ctx)).filter(isOut);
    if (!list.length) return reply(p("Nothing" + catNote(ctx) + " is out of stock. "), ["What is low on stock?"]);
    var v = velocity();
    list.sort(function (x, y) { return (v[y.id] || 0) - (v[x.id] || 0); });
    var h = p(b(plural(list.length, "product")) + catNote(ctx) + " " + (list.length === 1 ? "is" : "are") + " out of stock, fastest sellers first:");
    h += table(["Product", "Sells / day", ""], list.slice(0, 8).map(function (x) {
      var inc = onOrder(x.id);
      return [pLink(x) + "<small>" + esc(catOf(x)) + "</small>", v[x.id] ? dec1(v[x.id]) : "-", inc ? pill(int(inc) + " on order", "blue") : ""];
    }), [1]);
    return reply(h + more(list.length, 8, "out-of-stock.html", "See all out-of-stock items"), ["What should I reorder?", "What is low on stock?"]);
  };

  function batchRows(ctx, expiredOnly) {
    var rows = [], win = ctx.ahead;
    products().filter(inCat(ctx)).forEach(function (x) {
      var w = win || S.expiryWindowFor(x);
      x.batches.forEach(function (bt) {
        var d = S.daysUntil(bt.expiry);
        if (d === null) return;
        if (expiredOnly ? d < 0 : d >= 0 && d <= w) rows.push({ p: x, b: bt, d: d, val: bt.qty * Number(x.price) });
      });
    });
    rows.sort(function (x, y) { return x.d - y.d; });
    return rows;
  }
  H.expiring = function (ctx) {
    var rows = batchRows(ctx, false), exp = batchRows(ctx, true);
    var h = "";
    if (!rows.length) h += p("No batches" + catNote(ctx) + " expire " + (ctx.ahead ? "within " + plural(ctx.ahead, "day") : "inside their warning windows") + ".");
    else {
      var val = rows.reduce(function (s, r) { return s + r.val; }, 0);
      h += p(b(plural(rows.length, "batch", "batches")) + catNote(ctx) + " expire " + (ctx.ahead ? "within " + plural(ctx.ahead, "day") : "inside their warning windows") + ", worth " + b(money(val)) + " at selling price. Soonest first:");
      h += table(["Product", "Lot", "Qty", "Expires", "Value"], rows.slice(0, 8).map(function (r) {
        return [pLink(r.p), esc(r.b.lot || "-"), int(r.b.qty), esc(dLong(ymd(r.b.expiry))) + "<small>in " + plural(r.d, "day") + "</small>", money(r.val)];
      }), [2, 4]) + more(rows.length, 8, "expiring-soon.html", "See all expiring items");
    }
    if (exp.length) h += p(pill("Expired", "red") + " " + b(plural(exp.length, "batch", "batches")) + " (" + money(exp.reduce(function (s, r) { return s + r.val; }, 0)) + ") " + (exp.length === 1 ? "is" : "are") + " already past expiry and can't be sold. Ask \u201Cwhat has expired?\u201D for the list.");
    return reply(h, ["What has expired?", "Which batches may expire before they sell?", "What should I reorder?"]);
  };
  H.expired = function (ctx) {
    var rows = batchRows(ctx, true);
    if (!rows.length) return reply(p("No batches" + catNote(ctx) + " are past their expiry date."), ["What is expiring soon?"]);
    var val = rows.reduce(function (s, r) { return s + r.val; }, 0);
    return reply(p(b(plural(rows.length, "expired batch", "expired batches")) + catNote(ctx) + ", " + b(money(val)) + " at selling price. The POS blocks these from being sold, so they should be removed or returned:") +
      table(["Product", "Lot", "Qty", "Expired", "Value"], rows.slice(0, 8).map(function (r) {
        return [pLink(r.p), esc(r.b.lot || "-"), int(r.b.qty), esc(dLong(ymd(r.b.expiry))) + "<small>" + plural(Math.abs(r.d), "day") + " ago</small>", money(r.val)];
      }), [2, 4]) + more(rows.length, 8, "expiring-soon.html", "Open Expiring soon"), ["What is expiring soon?", "Inventory value"]);
  };

  function expiryRisk(x, perDay) {
    var out = [], cum = 0;
    x.batches.slice().sort(function (m, n) { return (m.expiry || "9999").localeCompare(n.expiry || "9999"); }).forEach(function (bt) {
      var d = S.daysUntil(bt.expiry);
      if (d === null || d < 0) { return; }
      var sold = Math.max(0, Math.min(bt.qty, perDay * d - cum));
      cum += bt.qty;
      var left = bt.qty - sold;
      if (d <= 180 && left >= 1 && left / bt.qty > 0.2) out.push({ lot: bt.lot, d: d, left: Math.round(left), val: left * Number(x.price) });
    });
    return out;
  }
  H.expiryRisk = function (ctx) {
    var v = velocity(), rows = [];
    products().filter(inCat(ctx)).forEach(function (x) { expiryRisk(x, v[x.id] || 0).forEach(function (r) { rows.push({ p: x, r: r }); }); });
    rows.sort(function (x, y) { return y.r.val - x.r.val; });
    if (!rows.length) return reply(p("At the current selling pace, everything" + catNote(ctx) + " should sell before it expires. "), ["What is expiring soon?"]);
    var tot = rows.reduce(function (s, x) { return s + x.r.val; }, 0);
    return reply(p("<b>" + int(rows.length) + "</b> batches" + catNote(ctx) + " may not sell before they expire, about " + b(money(tot)) + " at selling price (based on the last 30 days of sales, soonest-expiry batches sold first):") +
      table(["Product", "Lot", "Likely unsold", "Expires in", "Value"], rows.slice(0, 8).map(function (x) {
        return [pLink(x.p), esc(x.r.lot || "-"), int(x.r.left), plural(x.r.d, "day"), money(x.r.val)];
      }), [2, 3, 4]) + more(rows.length, 8, "analytics.html", "See more in Analytics") + p("Ideas: discount or bundle these, move them to the front, return them to the supplier, and order less next time."), ["Which products sell slowly?", "What should I reorder?"]);
  };

  H.runout = function (ctx) {
    var v = velocity(), rows = [];
    products().filter(inCat(ctx)).forEach(function (x) {
      var per = v[x.id] || 0, st = stockOf(x);
      if (per > 0 && st > 0 && st / per <= (ctx.ahead || 14)) rows.push({ p: x, cover: st / per, per: per });
    });
    rows.sort(function (x, y) { return x.cover - y.cover; });
    if (!rows.length) return reply(p("Nothing" + catNote(ctx) + " is expected to run out within " + plural(ctx.ahead || 14, "day") + " at the current pace."), ["What is low on stock?"]);
    return reply(p(b(plural(rows.length, "product")) + catNote(ctx) + " may run out within " + plural(ctx.ahead || 14, "day") + " (based on the last 30 days of sales):") +
      table(["Product", "Stock", "Sells / day", "Runs out in", ""], rows.slice(0, 8).map(function (x) {
        var inc = onOrder(x.p.id);
        return [pLink(x.p), int(stockOf(x.p)), dec1(x.per), x.cover < 1 ? "&lt; 1 day" : plural(Math.floor(x.cover), "day"), inc ? pill(int(inc) + " on order", "blue") : ""];
      }), [1, 2, 3]) + more(rows.length, 8, "analytics.html", "See more in Analytics"), ["What should I reorder?", "Open purchase orders"]);
  };

  H.reorder = function (ctx) {
    var sug;
    if (O && O.suggestions) sug = O.suggestions().filter(function (x) { return inCat(ctx)(x.product); });
    else return reply(p("Reorder suggestions need the Orders module, which isn't loaded on this page. Open " + a("orders.html", "Orders") + "."));
    if (!sug.length) return reply(p("Nothing" + catNote(ctx) + " needs reordering right now. Stock covers upcoming sales, including open orders."), ["Open purchase orders", "Inventory value"]);
    var total = sug.reduce(function (s, x) { return s + x.qty * x.unitCost; }, 0), urgent = sug.filter(function (x) { return x.priority === 1; });
    var h = p(b(plural(sug.length, "product")) + catNote(ctx) + " should be reordered (" + urgent.length + " urgent), about " + b(money(total)) + " in total. Suggested quantities cover roughly 3 weeks of sales:");
    h += table(["Product", "Stock", "Order", "Est. cost"], sug.slice(0, 8).map(function (x) {
      return [pLink(x.product) + "<small>" + (x.priority === 1 ? pill("Urgent", "red") : pill("Soon", "orange")) + " " + esc(x.reason) + (x.perDay ? " \u00B7 sells " + dec1(x.perDay) + "/day" : "") + "</small>", int(x.stock), int(x.qty), money(x.qty * x.unitCost)];
    }), [1, 2, 3]);
    h += more(sug.length, 8, "orders.html", "See all suggestions in Orders");
    if (sug.some(function (x) { return x.costEstimated; })) h += '<p class="mc-small">Where no earlier purchase cost exists, cost is estimated at 70% of the selling price.</p>';
    return reply(h, ["Open purchase orders", "Which products will run out soon?"]);
  };

  H.po = function () {
    if (!O || !O.getOrders) return reply(p("Purchase orders aren't available on this page. Open " + a("orders.html", "Orders") + "."));
    var all = O.getOrders();
    if (!all.length) return reply(p("There are no purchase orders yet. " + a("orders.html", "Open Orders") + " to create one from the suggestions."), ["What should I reorder?"]);
    var by = {};
    all.forEach(function (o) { by[o.status] = (by[o.status] || 0) + 1; });
    var open = all.filter(function (o) { return o.status === "ordered"; }), drafts = all.filter(function (o) { return o.status === "draft"; });
    var h = p("Purchase orders: " + O.STATUSES.filter(function (s) { return by[s]; }).map(function (s) { return by[s] + " " + s; }).join(", ") + ".");
    function rowsOf(list) {
      return list.slice(0, 6).map(function (o) {
        return [a("orders.html?order=" + encodeURIComponent(o.id), o.id), esc(o.supplier || "No supplier"), plural(o.lines.length, "line"), money(O.total(o)), o.expected ? esc(dLong(ymd(o.expected))) + (O.isOverdue(o) ? "<small>" + pill("Overdue", "red") + "</small>" : "") : "-"];
      });
    }
    if (open.length) h += '<div class="mc-group">On order (' + open.length + ")</div>" + table(["Order", "Supplier", "Lines", "Cost", "Expected"], rowsOf(open), [2, 3]);
    if (drafts.length) h += '<div class="mc-group">Drafts (' + drafts.length + ")</div>" + table(["Order", "Supplier", "Lines", "Cost", "Expected"], rowsOf(drafts), [2, 3]);
    return reply(h, ["What should I reorder?", "Which products will run out soon?"]);
  };

  H.value = function (ctx) {
    var P = products().filter(inCat(ctx));
    if (!P.length) return reply(p("There are no products to value."));
    var retail = 0, cost = 0, units = 0, est = false, cats = {}, expiredVal = 0;
    P.forEach(function (x) {
      var st = stockOf(x), c = costOf(x);
      retail += st * Number(x.price); cost += st * c.cost; units += st; if (c.estimated) est = true;
      cats[catOf(x)] = (cats[catOf(x)] || 0) + st * Number(x.price);
      expiredVal += S.expiredStock(x) * Number(x.price);
    });
    var h = p("Inventory value" + catNote(ctx) + ":") + kpis([
      { label: "At selling price", value: money(retail), sub: plural(P.length, "product") },
      { label: "At cost" + (est ? " (est.)" : ""), value: money(cost), sub: "potential margin " + money(retail - cost) },
      { label: "Units on hand", value: int(units) },
      { label: "Expired stock", value: money(expiredVal), tone: expiredVal ? "red" : "green" },
    ]);
    var ck = Object.keys(cats).sort(function (x, y) { return cats[y] - cats[x]; }).slice(0, 6);
    if (!ctx.cat && ck.length > 1) h += '<div class="mc-group">Largest categories</div>' + bars(ck.map(function (c) { return { label: esc(c), value: cats[c], text: money(cats[c]) + " \u00B7 " + Math.round((cats[c] / retail) * 100) + "%" }; }));
    if (est) h += '<p class="mc-small">Cost is the last purchase-order price where known, otherwise 70% of the selling price.</p>';
    return reply(h + p(a("inventory-valuation.html", "Open Inventory valuation")), ["Which products sell slowly?", "What has expired?"]);
  };

  H.profit = function (ctx) {
    var per = ctx.period || periodByName("this month"), list = salesBetween(per.from, per.to);
    if (!list.length) return reply(p("No sales in " + b(per.label.toLowerCase()) + " to estimate profit from."));
    var pm = {}, rev = 0, cogs = 0, est = false, rows = {};
    products().forEach(function (x) { pm[x.id] = x; });
    list.forEach(function (s) {
      rev += S.saleTotal(s);
      s.items.forEach(function (i) {
        var pr = pm[i.productId], c = pr ? costOf(pr) : { cost: i.price * 0.7, estimated: true };
        if (c.estimated) est = true;
        cogs += c.cost * i.qty;
        var r = rows[i.productId] || (rows[i.productId] = { name: i.name, id: i.productId, profit: 0 });
        r.profit += (i.price - c.cost) * i.qty;
      });
    });
    var profit = rev - cogs, top = Object.keys(rows).map(function (k) { return rows[k]; }).sort(function (x, y) { return y.profit - x.profit; }).slice(0, 3);
    var h = p("Estimated profit, " + esc(per.label.toLowerCase()) + ":") + kpis([
      { label: "Revenue", value: money(rev) }, { label: "Est. cost of goods", value: money(cogs) },
      { label: "Est. gross profit", value: money(profit), tone: profit >= 0 ? "green" : "red" }, { label: "Margin", value: rev ? ((profit / rev) * 100).toFixed(1) + "%" : "-" },
    ]);
    if (top.length) h += p("Most profitable: " + top.map(function (x) { return esc(x.name) + " (" + money(x.profit) + ")"; }).join(", ") + ".");
    if (est) h += '<p class="mc-small">This is an estimate: the system doesn\'t store purchase cost on products, so I use the latest purchase-order price, or 70% of the selling price when there isn\'t one. Discounts and VAT are not deducted.</p>';
    return reply(h, ["Revenue by category", "Compare this month vs last month"]);
  };

  H.forecast = function () {
    var f = forecastData();
    if (!f) return reply(p("There isn't enough history for a forecast yet. I need at least 7 days with sales in the last 4 weeks."));
    var h = p("Expected sales for the next 7 days: " + b(money(f.total)) + ", " + chg(pctChg(f.total, f.last7)) + " vs the last 7 days.");
    h += table(["Day", "Expected sales"], f.days.map(function (d) { return [esc(WEEKDAYS[d.date.getDay()] + ", " + dShort(d.date)), money(d.value)]; }), [1]);
    var v = velocity(), short = [];
    products().forEach(function (x) { var need = (v[x.id] || 0) * 7 * f.trend; if (need > 0 && stockOf(x) + onOrder(x.id) < need) short.push({ p: x, need: Math.ceil(need) }); });
    short.sort(function (x, y) { return y.need - x.need; });
    if (short.length) h += p("Likely to run short this week: " + short.slice(0, 4).map(function (x) { return esc(x.p.name) + " (needs about " + int(x.need) + ", has " + int(stockOf(x.p)) + ")"; }).join("; ") + ".");
    h += '<p class="mc-small">Method: each weekday\'s usual sales over the last 4 weeks, adjusted for the recent trend (' + (f.trend >= 1 ? "+" : "") + ((f.trend - 1) * 100).toFixed(0) + "%).</p>";
    return reply(h, ["What should I reorder?", "Which products will run out soon?"]);
  };

  H.catalog = function (ctx) {
    var all = S.getAllProducts(), P = products(), cats = {};
    P.forEach(function (x) { cats[catOf(x)] = (cats[catOf(x)] || 0) + 1; });
    var ck = Object.keys(cats).sort(function (x, y) { return cats[y] - cats[x]; });
    return reply(p("You have " + b(plural(P.length, "active product")) + " across " + b(plural(ck.length, "category", "categories")) + (all.length > P.length ? " (" + (all.length - P.length) + " archived)" : "") + ". " + P.filter(isOut).length + " out of stock, " + P.filter(isLow).length + " low, " + P.filter(S.isExpiringSoon).length + " expiring soon.") +
      bars(ck.slice(0, 8).map(function (c) { return { label: a("category-detail.html?c=" + encodeURIComponent(c), c), value: cats[c], text: plural(cats[c], "product") }; })) + p(a("products-overview.html", "Open All products")), ["Inventory value", "What is low on stock?"]);
  };

  H.settings = function () {
    var s = S.getSettings();
    return reply(p("Current system settings:") + ul([
      "Currency: " + b(s.pricing.currency) + ", " + s.pricing.decimals + " decimals", "VAT: " + b(s.pricing.vat + "%") + " (prices are VAT-inclusive)",
      "Default critical (low-stock) level: " + b(s.inventory.criticalLevelUnits + " units") + " unless a product sets its own",
      "Expiry warning window: " + b(S.windowLabel(s.inventory.expiryWindowDays)) + " by default", "Theme: " + b(s.general.theme) + ", density: " + b(s.general.density),
    ]) + p(a("settings.html", "Open Settings")));
  };

  H.how = function (ctx) {
    var hits = PAGES.filter(function (x) { return x.re.test(ctx.t); });
    if (!hits.length) return null;
    return reply(hits.slice(0, 2).map(function (x) { return p(b(x.t) + ": " + esc(x.d) + " " + a(x.href, "Open")); }).join(""), ["What can you do?"]);
  };

  /* ---- lookups ---- */
  H.txn = function (ctx) {
    var m = ctx.t.match(/txn-?\s*0*(\d+)|transaction\s*#?\s*0*(\d+)|receipt\s*#?\s*0*(\d+)/);
    var num = parseInt(m[1] || m[2] || m[3], 10), s = sales().filter(function (x) { return parseInt(String(x.id).replace(/\D/g, ""), 10) === num; })[0];
    if (!s) return reply(p("I couldn't find transaction " + b("TXN-" + String(num).padStart(6, "0")) + ". " + a("sales-all.html", "Browse all transactions")));
    return reply(p(b(s.id) + ", " + esc(S.formatDateTime(s.at)) + ", paid by " + esc(s.payment || "Cash") + (s.cashier ? ", cashier " + esc(s.cashier) : "") + ".") +
      table(["Item", "Qty", "Price", "Amount"], s.items.map(function (i) { return [esc(i.name), int(i.qty), money(i.price), money(i.qty * i.price)]; }), [1, 2, 3]) +
      p((s.discount ? "Discount " + money(s.discount) + ". " : "") + "Total: " + b(money(S.saleTotal(s))) + ". " + a("transaction.html?id=" + encodeURIComponent(s.id), "Open transaction")));
  };
  H.poLookup = function (ctx) {
    var m = ctx.t.match(/po-?\s*0*(\d+)/), id = "PO-" + String(parseInt(m[1], 10)).padStart(4, "0");
    var o = O && O.getOrder ? O.getOrder(id) : null;
    if (!o) return reply(p("I couldn't find order " + b(id) + ". " + a("orders.html", "Open Orders")));
    return reply(p(b(o.id) + " (" + pill(o.status, o.status === "received" ? "green" : o.status === "cancelled" ? "grey" : "blue") + ") from " + esc(o.supplier || "no supplier") + (o.expected ? ", expected " + esc(dLong(ymd(o.expected))) : "") + ".") +
      table(["Product", "Ordered", "Received", "Cost"], o.lines.map(function (l) { return [esc(l.name), int(l.qty), int(l.receivedQty), money(l.qty * l.unitCost)]; }), [1, 2, 3]) + p("Total " + b(money(O.total(o))) + ". " + a("orders.html?order=" + encodeURIComponent(o.id), "Open order")));
  };

  /* ---- a product ---- */
  H.product = function (ctx) {
    var list = ctx.prods;
    if (list.length > 1) {
      var v0 = velocity();
      return reply(p("I found " + b(list.length + " matching products") + ":") + table(["Product", "Stock", "Price", "Status"], list.map(function (x) {
        return [pLink(x), esc(S.formatQty(stockOf(x), x.unit)), money(x.price), statusPill(x)];
      }), [1, 2]) + p("Ask about one by its full name for details."), list.slice(0, 3).map(function (x) { return "Tell me about " + x.name; }));
    }
    var x = list[0], t = ctx.t, v = velocity(), st = stockOf(x), per = v[x.id] || 0;
    var focus = /\bprice|how much (is|does)|cost|selling price|srp\b/.test(t) ? "price" : /expir|batch|\blot\b|shelf/.test(t) ? "expiry" : /\bsold\b|\bsales?\b|selling|revenue|demand|popular|perform/.test(t) ? "sales" : /run out|cover|last\b|how long|days/.test(t) ? "cover" : /order|restock|reorder/.test(t) ? "reorder" : /stock|left|available|on hand|how many|have/.test(t) ? "stock" : "all";
    var lead;
    if (focus === "price") lead = b(x.name) + " sells for " + b(money(x.price)) + " per " + esc(x.unit) + ".";
    else if (focus === "stock" || focus === "cover" || focus === "all") lead = b(x.name) + ": " + b(qtyText(x, st)) + " in stock. " + statusPill(x);
    else lead = b(x.name) + " (" + esc(x.id) + ")";
    var h = p(lead);
    var sold30 = soldBy(salesBetween(new Date(Date.now() - 30 * DAY), new Date()))[x.id];
    var per2 = ctx.period && focus === "sales" ? ctx.period : null;
    if (per2) { var sx = soldBy(salesBetween(per2.from, per2.to))[x.id] || { units: 0, revenue: 0 }; h += p(esc(per2.label) + " it sold " + b(plural(sx.units, esc(x.unit))) + " for " + b(money(sx.revenue)) + "."); }
    if (focus === "all" || focus === "stock") {
      h += kpis([
        { label: "In stock", value: esc(S.formatQty(st, x.unit)), sub: "critical level " + int(S.criticalLevelFor(x)), tone: isOut(x) ? "red" : isLow(x) ? "orange" : "green" },
        { label: "Price", value: money(x.price), sub: "per " + esc(x.unit) },
        { label: "Sold (30 days)", value: int(sold30 ? sold30.units : 0), sub: sold30 ? money(sold30.revenue) : "no sales" },
        { label: "Category", value: esc(catOf(x)), sub: x.brand ? esc(x.brand) : "" },
      ]);
    }
    if (focus === "cover" || focus === "all" || focus === "stock") {
      if (per > 0 && st > 0) h += p("Selling about " + b(dec1(per) + " " + S.pluralizeUnit(x.unit, per) + "/day") + ", current stock lasts roughly " + b(plural(Math.floor(st / per), "day")) + (onOrder(x.id) ? "; " + int(onOrder(x.id)) + " more on order" : "") + ".");
      else if (st > 0) h += p("No sales in the last 30 days, so I can't estimate cover.");
      else h += p("Out of stock" + (per > 0 ? ", and it normally sells about " + b(dec1(per) + "/day") : "") + (onOrder(x.id) ? "; " + int(onOrder(x.id)) + " on order" : "") + ".");
    }
    if ((focus === "expiry" || focus === "all") && x.batches.length) {
      h += table(["Lot", "Qty", "Expires", ""], x.batches.map(function (bt) {
        var d = S.daysUntil(bt.expiry);
        return [esc(bt.lot || "-"), int(bt.qty), bt.expiry ? esc(dLong(ymd(bt.expiry))) : "No expiry", d === null ? "" : d < 0 ? pill("Expired", "red") : d <= S.expiryWindowFor(x) ? pill("In " + plural(d, "day"), "orange") : pill("OK", "green")];
      }), [1]);
    } else if (focus === "expiry") h += p("It has no stock batches, so no expiry dates to show.");
    if (focus === "sales") {
      var pr = soldBy(sales())[x.id], all = Object.keys(soldBy(salesBetween(new Date(Date.now() - 30 * DAY), new Date()))).map(function (k) { return soldBy(salesBetween(new Date(Date.now() - 30 * DAY), new Date()))[k]; }).sort(function (m, n) { return n.units - m.units; });
      var rank = all.map(function (r) { return r.id; }).indexOf(x.id) + 1;
      h += p("Last 30 days: " + b(plural(sold30 ? sold30.units : 0, esc(x.unit))) + " sold for " + b(money(sold30 ? sold30.revenue : 0)) + (rank ? ", rank " + b("#" + rank) + " of " + all.length + " selling products" : "") + ". All time: " + plural(pr ? pr.units : 0, esc(x.unit)) + ".");
    }
    if (focus === "reorder" && O && O.suggestions) {
      var sg = O.suggestions().filter(function (s) { return s.product.id === x.id; })[0];
      h += p(sg ? "Yes, reorder about " + b(int(sg.qty) + " " + x.unit) + " (" + esc(sg.reason.toLowerCase()) + "), roughly " + money(sg.qty * sg.unitCost) + "." : "It doesn't need reordering right now" + (onOrder(x.id) ? ", and " + int(onOrder(x.id)) + " are already on order" : "") + ".");
    }
    return reply(h + p(a("product-detail.html?id=" + encodeURIComponent(x.id), "Open product page")), focus === "all" ? ["Sales of " + x.name + " this month", "Should I reorder " + x.name + "?"] : ["Tell me about " + x.name]);
  };

  H.fallback = function (ctx) {
    var h = p("I couldn't match that to something in your pharmacy data. I can help with sales, stock, expiry, orders, forecasts and staff, or look up a product by name.");
    return reply(h, ["What can you do?", "Give me an overview", "What is low on stock?", "How much did we sell today?"]);
  };

  /* ------------------------------------------------------------------ */
  /* routing                                                             */
  /* ------------------------------------------------------------------ */
  var INTENTS = [
    { id: "help", re: /\b(help|what can you (do|answer)|commands|capabilit|how (do|can) i use you|what do you know|examples?)\b/, run: H.help },
    { id: "forecast", re: /forecast|predict|projection|expected sales|will we sell|next (7 days|week)\b.*\b(sales?|revenue)|sales?.*next (7 days|week)/, run: H.forecast },
    { id: "reorder", re: /reorder|restock|replenish|what (should|do) (i|we) (order|buy)|need to (order|buy)|suggested order|order suggestion|what to (order|buy)/, run: H.reorder },
    { id: "po", re: /purchase order|open orders?|pending orders?|incoming|on order|overdue order|\bsuppliers?\b|orders? (status|list)|my orders/, run: H.po },
    { id: "expiryRisk", re: /expiry (loss|risk)|before (they|it|these) (sell|expire)|may expire before|wast(e|age)|write ?off|expire before/, run: H.expiryRisk },
    { id: "expired", re: /\bexpired\b|already expired|past (their )?expiry|beyond expiry/, run: H.expired },
    { id: "expiring", re: /expir|shelf life|near expiry|best before|going bad/, run: H.expiring },
    { id: "out", re: /out of stock|no stock|zero stock|sold out|stock ?out|unavailable|ran out|run out of/, run: H.out },
    { id: "runout", re: /run(ning)? out|days? of (cover|stock)|how long will|will (last|run)|short(age)?|stock ?out soon|cover/, run: H.runout },
    { id: "low", re: /low (on )?stock|running low|below (the )?(critical|threshold|minimum)|critical level|almost out|nearly out|need(s)? restock|low items/, run: H.low },
    { id: "value", re: /inventory value|stock value|value of (my |our |the )?(stock|inventory)|worth of|valuation|how much (is|are) (my|our) (stock|inventory)/, run: H.value },
    { id: "profit", re: /profit|margin|gross|markup|net income/, run: H.profit },
    { id: "compare", re: /compar|\bvs\.?\b|versus|growth|grew|trend|up or down|increase|decrease|improv|how (are|is) (we|sales|business|the (pharmacy|business)) doing|change/, run: H.compare },
    { id: "slow", re: /slow|worst|least|lowest|dead stock|not selling|never sold|no sales|unsold|stagnant|poor(ly)? sell|overstock|excess/, run: H.slow },
    { id: "top", re: /best|top|most (sold|popular|selling)|fast|popular|hot ?item|leading|bestsell|highest (selling|revenue)/, run: H.top },
    { id: "payments", re: /payment|gcash|e-?wallet|cash vs|paid (by|with)|card/, run: H.payments },
    { id: "timing", re: /busiest|peak|rush|busy|slowest (hour|day)|best (hour|day)|what time|which (day|hour)|weekday|hours? of the day/, run: H.timing },
    { id: "staff", re: /how many (staff|accounts?|users?|cashiers?|admins?|pharmacists?|employees?)|list (of )?(staff|accounts)|who (are|is) (the )?(staff|admin)/, run: H.staff },
    { id: "cashiers", re: /cashier|employee|performance|attendance|checked in|who (sold|served|worked)|shift|hours worked/, run: H.cashiers },
    { id: "categories", re: /categor|by type|by class/, run: H.categories },
    { id: "catalog", re: /how many (products?|items?|medicines?|drugs?|skus?)|number of (products?|items?)|total products?|catalog|product count/, run: H.catalog },
    { id: "settings", re: /\bvat\b|\btax\b|currency|threshold|settings?\b|critical level|expiry window/, run: H.settings },
    { id: "sales", re: /sales?|revenue|sold|sell|income|turnover|takings|transactions?|earned|made|how much did/, run: H.sales },
    { id: "overview", re: /overview|summary|snapshot|status|highlights?|insights?|brief|dashboard|what is (going on|happening|new)|how is (the )?(pharmacy|business|store|shop)|report/, run: H.overview },
    { id: "how", re: /^(where|how (do|can|to)|how to|can i|open|go to|take me)|where (is|do|can)|(add|create|receive|archive|export|import|change|print|reset)\b/, run: H.how },
  ];
  var memory = { intent: null, ctx: null };
  window.MynelleAssistant = { ask: function (q) { return Promise.resolve(answer(q)); } }; // handy for testing in the console

  function makeCtx(q) {
    var t = norm(q);
    var both = /\btoday\b/.test(t) && /\byesterday\b/.test(t);
    var ctx = { q: q, t: both ? t.replace(/\byesterday\b/g, "") : t, prods: [], cat: null };
    ctx.period = parsePeriod(ctx.t);
    ctx.ahead = parseAhead(t);
    ctx.n = parseN(t);
    ctx.cat = matchCategory(t);
    return ctx;
  }

  function answer(q) {
    var ctx = makeCtx(q), t = ctx.t, i;
    if (/^(hi|hello|hey|yo|good (morning|afternoon|evening)|thanks|thank you|ty|salamat|ok(ay)?|cool|great|nice|bye|goodbye|who are you|what are you)\b/.test(t) && t.split(" ").length <= 4) return H.smalltalk(ctx);
    if (/^(help|what can you do)/.test(t) || /\b(what can you (do|answer)|how (do|can) i use you)\b/.test(t)) return H.help(ctx);
    if (!products().length && !sales().length) {
      return reply(p("There's no data in this browser yet: no products or sales. Add products on " + a("inventory.html", "Inventory") + ", or restore a backup from " + a("settings.html", "Settings") + "."));
    }
    if (/txn-?\s*\d+|transaction\s*#?\s*\d+|receipt\s*#?\s*\d+/.test(t)) return H.txn(ctx);
    if (/\bpo-?\s*\d+\b/.test(t)) return H.poLookup(ctx);

    // Follow-up pronouns: "what about it", "and its price"
    var pron = /\b(it|its|that one|this one|that product|the same)\b/.test(t) && memory.ctx && memory.ctx.prods.length === 1;

    var found = matchProducts(t);
    ctx.prods = pron && !found.length ? memory.ctx.prods : found;
    var aggregate = INTENTS.slice(0, 22).some(function (it) { return it.re.test(t) && /\b(products|items|medicines|everything|all)\b/.test(t); });
    if (ctx.prods.length && !aggregate) { memory = { intent: H.product, ctx: ctx }; return H.product(ctx); }

    for (i = 0; i < INTENTS.length; i++) {
      if (INTENTS[i].re.test(t)) {
        var r = INTENTS[i].run(ctx);
        if (r) { memory = { intent: INTENTS[i].run, ctx: ctx }; return r; }
      }
    }
    // Follow-up with only a period / category: "what about last month?"
    if (memory.intent && (ctx.period || ctx.cat || ctx.n || ctx.ahead)) {
      var merged = Object.assign({}, memory.ctx, { t: memory.ctx.t, period: ctx.period || memory.ctx.period, cat: ctx.cat || memory.ctx.cat, n: ctx.n || memory.ctx.n, ahead: ctx.ahead || memory.ctx.ahead });
      memory = { intent: memory.intent, ctx: merged };
      return memory.intent(merged);
    }
    if (ctx.cat) return H.categories(ctx);
    return H.fallback(ctx);
  }

  /* ------------------------------------------------------------------ */
  /* interface                                                           */
  /* ------------------------------------------------------------------ */
  var STORE = "mynelle_chat_session";
  var ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.4A8 8 0 1 1 21 12z"/><path d="M9 11h6M9 14h4"/></svg>';
  var ui = { root: null, body: null, input: null, msgs: [], open: false, wide: false, past: [], pastIx: -1, busy: false };

  function save() {
    try {
      sessionStorage.setItem(STORE, JSON.stringify({ msgs: ui.msgs.slice(-40), open: ui.open, wide: ui.wide }));
    } catch (e) { /* storage unavailable */ }
  }
  function load() {
    try {
      var d = JSON.parse(sessionStorage.getItem(STORE) || "null");
      if (d) { ui.msgs = d.msgs || []; ui.open = !!d.open; ui.wide = !!d.wide; }
    } catch (e) { /* ignore */ }
  }

  var SVG = function (d) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + "</svg>"; };
  var ACT_ICONS = {
    copy: SVG('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>'),
    print: SVG('<path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2"/><rect x="6" y="14" width="12" height="7"/>'),
    export: SVG('<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>')
  };
  function actsHtml(html) {
    var plain = String(html).replace(/<[^>]*>/g, "").trim();
    var hasTable = html.indexOf("mc-table") > -1;
    if (!hasTable && plain.length < 140) return "";
    return '<div class="mc-acts">' +
      '<button type="button" class="mc-act" data-mc-act="copy" aria-label="Copy this answer" title="Copy">' + ACT_ICONS.copy + "</button>" +
      '<button type="button" class="mc-act" data-mc-act="print" aria-label="Print this answer" title="Print">' + ACT_ICONS.print + "</button>" +
      '<button type="button" class="mc-act" data-mc-act="export" aria-label="' + (hasTable ? "Export tables as CSV" : "Export as text file") + '" title="' + (hasTable ? "Export (CSV)" : "Export (text)") + '">' + ACT_ICONS.export + "</button>" +
      "</div>";
  }
  // a clean copy of a bubble without the follow-up chips and the action row
  function cleanBubble(bubble) {
    var c = bubble.cloneNode(true);
    Array.prototype.forEach.call(c.querySelectorAll(".mc-chips, .mc-acts"), function (n) { n.parentNode.removeChild(n); });
    return c;
  }
  function tableRows(tbl) {
    return Array.prototype.map.call(tbl.querySelectorAll("tr"), function (tr) {
      return Array.prototype.map.call(tr.children, function (c) { return c.textContent.replace(/\s+/g, " ").trim(); });
    });
  }
  function bubbleText(bubble) {
    var c = cleanBubble(bubble), out = [];
    Array.prototype.forEach.call(c.children, function (n) {
      if (n.classList.contains("mc-table")) {
        out.push(tableRows(n.querySelector("table")).map(function (r) { return r.join("\t"); }).join("\n"));
      } else {
        var t = n.textContent.replace(/[ \t]+/g, " ").trim();
        if (t) out.push(t);
      }
    });
    return out.join("\n\n");
  }
  function csvOf(bubble) {
    var tabs = cleanBubble(bubble).querySelectorAll(".mc-table table");
    return Array.prototype.map.call(tabs, function (t) {
      return tableRows(t).map(function (r) {
        return r.map(function (v) { return '"' + v.replace(/"/g, '""') + '"'; }).join(",");
      }).join("\r\n");
    }).join("\r\n\r\n");
  }
  function stamp() {
    var d = new Date(), z = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate());
  }
  function download(name, mime, text) {
    var blob = new Blob([text], { type: mime });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); if (a.parentNode) a.parentNode.removeChild(a); }, 500);
  }
  function printBubble(bubble) {
    var c = cleanBubble(bubble);
    Array.prototype.forEach.call(c.querySelectorAll("a"), function (a) { a.removeAttribute("href"); });
    var doc = "<!doctype html><html><head><meta charset=\"utf-8\"><title>Mynelle Assistant</title><style>" +
      "body{font:13px/1.5 Arial,sans-serif;color:#0d0d0d;margin:24px}h1{font-size:16px;margin:0 0 2px;color:#0442bf}" +
      ".sub{color:#6b7280;font-size:11px;margin:0 0 16px}p{margin:0 0 8px}" +
      "table{border-collapse:collapse;width:100%;margin:6px 0 10px}th,td{border:1px solid #cfd6e4;padding:5px 8px;text-align:left}" +
      "th{background:#eef2fb}th.n,td.n{text-align:right}</style></head><body>" +
      "<h1>Mynelle\u2019s Pharmacy \u2014 Assistant</h1><div class=\"sub\">Printed " + new Date().toLocaleString() + "</div>" +
      c.innerHTML + "</body></html>";
    var f = document.createElement("iframe");
    f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    document.body.appendChild(f);
    f.contentDocument.open(); f.contentDocument.write(doc); f.contentDocument.close();
    setTimeout(function () {
      try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { /* ignore */ }
      setTimeout(function () { if (f.parentNode) f.parentNode.removeChild(f); }, 1500);
    }, 150);
  }
  function copyText(text, done) {
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text; ta.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch (e) { /* ignore */ }
      document.body.removeChild(ta); done();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  }
  function onAction(btn) {
    var act = btn.getAttribute("data-mc-act");
    var bubble = btn.closest(".mc-bubble");
    if (!bubble) return;
    if (act === "copy") {
      copyText(bubbleText(bubble), function () {
        var old = btn.title; btn.title = "Copied"; btn.classList.add("mc-done");
        setTimeout(function () { btn.title = old; btn.classList.remove("mc-done"); }, 1400);
      });
    } else if (act === "print") {
      printBubble(bubble);
    } else if (act === "export") {
      var csv = csvOf(bubble);
      if (csv) download("mynelle-assistant-" + stamp() + ".csv", "text/csv;charset=utf-8", "\uFEFF" + csv);
      else download("mynelle-assistant-" + stamp() + ".txt", "text/plain;charset=utf-8", bubbleText(bubble));
    }
  }

  function chipsHtml(chips) {
    return chips && chips.length ? '<div class="mc-chips">' + chips.map(function (c) { return '<button type="button" class="mc-chip" data-q="' + esc(c) + '">' + esc(c) + "</button>"; }).join("") + "</div>" : "";
  }
  function addMsg(role, html, chips, silent) {
    var row = document.createElement("div");
    row.className = "mc-msg " + (role === "u" ? "mc-user" : "mc-bot");
    row.innerHTML = '<div class="mc-bubble">' + (role === "u" ? esc(html) : html + actsHtml(html) + chipsHtml(chips)) + "</div>";
    ui.body.appendChild(row);
    if (!silent) {
      ui.msgs.push({ r: role, h: html, c: chips || [] });
      save();
      if (role === "u") ui.body.scrollTop = ui.body.scrollHeight;
      else ui.body.scrollTop = Math.max(0, row.offsetTop - 10);
    }
    return row;
  }
  function render() {
    ui.body.innerHTML = "";
    ui.msgs.forEach(function (m) { addMsg(m.r, m.h, m.c, true); });
    ui.body.scrollTop = ui.body.scrollHeight;
  }
  function setOpen(open) {
    ui.open = open;
    ui.root.classList.toggle("mc-open", open);
    ui.root.querySelector(".mc-panel").hidden = !open;
    if (open) {
      if (!ui.msgs.length) {
        var w = H.smalltalk({ t: "hello" });
        addMsg("b", w.html + p("I read your live pharmacy data and answer in plain language. Pick a question or type your own."), ["Give me an overview", "What is low on stock?", "How much did we sell today?", "What should I reorder?", "What can you do?"]);
      } else render();
      setTimeout(function () { ui.input.focus(); }, 30);
    }
    save();
  }
  function ask(q) {
    q = String(q || "").replace(/\s+/g, " ").trim();
    if (!q || ui.busy) return;
    ui.busy = true;
    ui.past.push(q); ui.pastIx = -1;
    addMsg("u", q);
    var typing = document.createElement("div");
    typing.className = "mc-msg mc-bot";
    typing.innerHTML = '<div class="mc-bubble"><span class="mc-typing" aria-label="Thinking"><i></i><i></i><i></i></span></div>';
    ui.body.appendChild(typing);
    ui.body.scrollTop = ui.body.scrollHeight;
    var result;
    try { result = Promise.resolve(answer(q)); } catch (e) { result = Promise.reject(e); }
    setTimeout(function () {
      result.then(function (r) { return r; }, function (err) {
        if (window.console) console.error("Assistant error:", err);
        return reply(p("Sorry, I hit a problem working that out. Try rephrasing it, or ask something like \u201CWhat is low on stock?\u201D"), ["What can you do?"]);
      }).then(function (r) {
        if (typing.parentNode) typing.parentNode.removeChild(typing);
        addMsg("b", r.html, r.chips);
        ui.busy = false;
      });
    }, 280);
  }
  function clearChat() {
    ui.msgs = []; memory = { intent: null, ctx: null };
    ui.body.innerHTML = "";
    var w = H.smalltalk({ t: "hello" });
    addMsg("b", w.html + p("Chat cleared. What would you like to know?"), ["Give me an overview", "What can you do?"]);
  }

  function build() {
    var link = document.createElement("link");
    link.rel = "stylesheet"; link.href = BASE + "css/chatbot.css";
    document.head.appendChild(link);

    var root = document.createElement("div");
    root.id = "mc-root";
    root.innerHTML =
      '<button class="mc-fab" type="button" aria-label="Open Mynelle Assistant" title="Ask the assistant about your pharmacy data (Ctrl+/)">' + ICON + '<span class="mc-fab-label">Ask</span></button>' +
      '<section class="mc-panel" role="dialog" aria-label="Mynelle Assistant" hidden>' +
      '<header class="mc-head"><div class="mc-avatar">' + ICON + '</div><div class="mc-title"><b>Mynelle Assistant</b><small>Local \u00B7 works offline in your browser</small></div>' +
      '<div class="mc-actions">' +
      '<button type="button" class="mc-btn" data-act="wide" aria-label="Make the chat wider" title="Wider / narrower"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg></button>' +
      '<button type="button" class="mc-btn" data-act="clear" aria-label="Clear the conversation" title="Clear chat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg></button>' +
      '<button type="button" class="mc-btn" data-act="close" aria-label="Close the assistant" title="Close (Esc)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg></button>' +
      "</div></header>" +
      '<div class="mc-body" aria-live="polite"></div>' +
      '<form class="mc-form" autocomplete="off"><textarea rows="1" maxlength="300" data-allow="notes" placeholder="Ask about sales, stock, expiry\u2026" aria-label="Message the assistant" title="Type a question and press Enter"></textarea>' +
      '<button type="submit" class="mc-send" aria-label="Send" title="Send"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/></svg></button></form>' +
      '<div class="mc-foot">Answers come only from this browser\'s saved data. Nothing is sent online.</div></section>';
    document.body.appendChild(root);
    ui.root = root;
    ui.body = root.querySelector(".mc-body");
    ui.input = root.querySelector("textarea");
    root.classList.toggle("mc-wide", ui.wide);

    root.querySelector(".mc-fab").addEventListener("click", function () { setOpen(true); });
    root.querySelector(".mc-actions").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-act]");
      if (!btn) return;
      var act = btn.getAttribute("data-act");
      if (act === "close") setOpen(false);
      else if (act === "clear") clearChat();
      else if (act === "wide") { ui.wide = !ui.wide; root.classList.toggle("mc-wide", ui.wide); save(); }
    });
    ui.body.addEventListener("click", function (e) {
      var actBtn = e.target.closest("[data-mc-act]");
      if (actBtn) { onAction(actBtn); return; }
      var chip = e.target.closest("[data-q]");
      if (chip) ask(chip.getAttribute("data-q"));
    });
    root.querySelector(".mc-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var v = ui.input.value;
      ui.input.value = ""; ui.input.style.height = "auto";
      ask(v);
    });
    ui.input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); root.querySelector(".mc-form").requestSubmit(); }
      else if (e.key === "ArrowUp" && !ui.input.value && ui.past.length) {
        ui.pastIx = ui.pastIx < 0 ? ui.past.length - 1 : Math.max(0, ui.pastIx - 1);
        ui.input.value = ui.past[ui.pastIx]; e.preventDefault();
      }
    });
    ui.input.addEventListener("input", function () {
      ui.input.style.height = "auto";
      ui.input.style.height = Math.min(110, ui.input.scrollHeight) + "px";
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && ui.open) setOpen(false);
      else if ((e.ctrlKey || e.metaKey) && e.key === "/") { e.preventDefault(); setOpen(!ui.open); }
    });
    if (ui.open) { ui.open = false; setOpen(true); } else root.querySelector(".mc-panel").hidden = true;
  }

  /* ------------------------------------------------------------------ */
  /* start-up                                                            */
  /* ------------------------------------------------------------------ */
  function loadScript(file, done) {
    var s = document.createElement("script");
    s.src = BASE + "js/" + file; s.onload = done; s.onerror = done;
    document.head.appendChild(s);
  }
  function start() {
    try {
      var se = typeof MynelleAuth !== "undefined" ? MynelleAuth.getSession() : null;
      if (se && se.account && se.account.role === "cashier") return; // cashiers only use the POS
    } catch (e) { /* ignore */ }
    S = MynelleStore;
    O = typeof Orders !== "undefined" ? Orders : null;
    T = typeof TimeStore !== "undefined" ? TimeStore : null;
    AUTH = typeof MynelleAuth !== "undefined" ? MynelleAuth : null;
    load();
    build();
  }
  function init() {
    var need = [];
    if (typeof MynelleStore === "undefined") need.push("settings-store.js");
    if (typeof Orders === "undefined") need.push("orders-store.js");
    (function next() {
      var f = need.shift();
      if (!f) { if (typeof MynelleStore !== "undefined") start(); return; }
      loadScript(f, next);
    })();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
