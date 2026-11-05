// Shared helpers for the analysis pages: periods, totals, stat cards,
// charts (line, columns, bars, donut) and tables. Requires settings-store.js.
var Analytics = (function () {
  var S = MynelleStore;
  var DAY = 24 * 60 * 60 * 1000;
  var PERIODS = ["Today", "This week", "This month", "This year", "All time"];

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function money(n) {
    return S.formatCurrency(n);
  }
  function shortMoney(n) {
    var sym = S.getSettings().pricing.currency;
    if (n >= 1000000) return sym + (n / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
    if (n >= 1000) return sym + (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
    return sym + Math.round(n);
  }
  function int(n) {
    return Math.round(n).toLocaleString("en-US");
  }
  function pct(part, whole, digits) {
    if (!whole) return "0%";
    return ((part / whole) * 100).toFixed(digits || 0) + "%";
  }
  function niceMax(v) {
    if (v <= 0) return 1;
    var pow = Math.pow(10, Math.floor(Math.log10(v)));
    var n = v / pow;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
  }

  // ---- periods -------------------------------------------------------
  function range(label) {
    return { from: S.periodStart(label), to: new Date() };
  }
  // The period immediately before, covering the same elapsed length.
  function previousRange(label) {
    if (label === "All time") return null;
    var start = S.periodStart(label);
    var len = new Date() - start;
    var prevStart;
    if (label === "Today") prevStart = new Date(start.getTime() - DAY);
    else if (label === "This week") prevStart = new Date(start.getTime() - 7 * DAY);
    else if (label === "This month")
      prevStart = new Date(start.getFullYear(), start.getMonth() - 1, 1);
    else prevStart = new Date(start.getFullYear() - 1, 0, 1);
    var prevEnd = new Date(Math.min(prevStart.getTime() + len, start.getTime()));
    return { from: prevStart, to: prevEnd };
  }
  function salesBetween(from, to) {
    var a = from.getTime();
    var b = to.getTime();
    return S.getSales().filter(function (s) {
      var t = new Date(s.at).getTime();
      return t >= a && t < b;
    });
  }
  function totals(sales) {
    var revenue = 0;
    var units = 0;
    sales.forEach(function (s) {
      revenue += S.saleTotal(s);
      units += S.saleQty(s);
    });
    return {
      revenue: revenue,
      count: sales.length,
      units: units,
      avg: sales.length ? revenue / sales.length : 0,
    };
  }
  function change(current, previous) {
    if (!previous) return null;
    var d = ((current - previous) / previous) * 100;
    return { value: d, text: (d >= 0 ? "+" : "") + d.toFixed(1) + "%" };
  }
  function changeText(current, previous, label) {
    var c = change(current, previous);
    return c ? c.text + " vs " + label : "No earlier data to compare";
  }
  function previousLabel(label) {
    return {
      Today: "yesterday",
      "This week": "last week",
      "This month": "last month",
      "This year": "last year",
    }[label];
  }

  // ---- products ------------------------------------------------------
  function productsById() {
    var map = {};
    S.getProducts().forEach(function (p) {
      map[p.id] = p;
    });
    return map;
  }
  function soldByProduct(sales) {
    var out = {};
    sales.forEach(function (s) {
      s.items.forEach(function (i) {
        var r = out[i.productId] || (out[i.productId] = { units: 0, revenue: 0, lines: 0 });
        r.units += i.qty;
        r.revenue += i.qty * i.price;
        r.lines += 1;
      });
    });
    return out;
  }
  function stockValue(p) {
    return Number(p.stock) * Number(p.price);
  }
  function daysUntil(dateStr) {
    if (!dateStr) return null;
    var d = new Date(dateStr);
    if (isNaN(d)) return null;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((d - today) / DAY);
  }
  function criticalLevel(p) {
    var inv = S.getSettings().inventory;
    return p.criticalLevel || inv.criticalLevelUnits || inv.lowStockThresholdPcs;
  }

  // ---- links to the detail pages ---------------------------------------
  function url(page, params) {
    var q = Object.keys(params || {})
      .filter(function (k) { return params[k] !== undefined && params[k] !== null && params[k] !== ""; })
      .map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(params[k]); })
      .join("&");
    return page + (q ? "?" + q : "");
  }
  function param(name) {
    try {
      return new URLSearchParams(window.location.search).get(name) || "";
    } catch (e) {
      return "";
    }
  }
  var links = {
    transaction: function (id) { return url("transaction.html", { id: id }); },
    product: function (id, period) { return url("product-detail.html", { id: id, period: period }); },
    category: function (c, period) { return url("category-detail.html", { c: c, period: period }); },
    payment: function (m, period) { return url("payment-detail.html", { m: m, period: period }); },
    time: function (kind, key, period) { return url("time-detail.html", { kind: kind, key: key, period: period }); },
    stock: function (view, bucket) { return url("stock-detail.html", { view: view, bucket: bucket }); },
  };
  // Which finer-grained page a chart bucket opens: hour -> day -> month.
  function bucketRef(period, b) {
    if (period === "Today") {
      var n = new Date();
      return { kind: "hour", key: n.getFullYear() + "-" + n.getMonth() + "-" + n.getDate() + "-" + b.key };
    }
    if (period === "This week" || period === "This month") return { kind: "day", key: b.key };
    return { kind: "month", key: b.key };
  }
  function bucketHref(period, b) {
    var r = bucketRef(period, b);
    return links.time(r.kind, r.key, period);
  }
  // Back link: returns to wherever the person came from (inside this app).
  function wireBack() {
    var a = document.querySelector(".detail-back");
    if (!a) return;
    var same = false;
    try {
      same = document.referrer && new URL(document.referrer).origin === window.location.origin;
    } catch (e) {}
    if (same && window.history.length > 1) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        window.history.back();
      });
    }
  }
  // Keeps the chosen period on every link that carries data-period-link.
  function syncPeriodLinks(period) {
    document.querySelectorAll("a[data-period-link]").forEach(function (a) {
      var base = a.getAttribute("data-period-link");
      var extra = a.getAttribute("data-extra") || "";
      a.setAttribute("href", base + "?period=" + encodeURIComponent(period) + (extra ? "&" + extra : ""));
    });
  }

  // ---- UI blocks -----------------------------------------------------
  function stats(el, items, four) {
    el.className = "detail-summary" + (four ? " cols-4" : "");
    el.innerHTML = items
      .map(function (i) {
        return (
          "<" + (i.href ? 'a href="' + esc(i.href) + '"' : "div") +
          ' class="detail-stat tone-' + (i.tone || "blue") + (i.href ? " an-link-card" : "") + '">' +
          '<div class="stat-top"><span class="stat-label">' + esc(i.label) + "</span></div>" +
          "<div>" +
          '<div class="stat-value">' + esc(i.value) + "</div>" +
          (i.sub ? '<div class="stat-sub">' + esc(i.sub) + "</div>" : "") +
          "</div></" + (i.href ? "a" : "div") + ">"
        );
      })
      .join("");
  }

  function tabs(el, current, onChange, options) {
    var list = options || PERIODS;
    el.className = "period-tabs";
    el.setAttribute("role", "tablist");
    el.innerHTML = list
      .map(function (p) {
        return (
          '<button type="button" role="tab" data-period="' + esc(p) + '"' +
          (p === current ? ' class="active" aria-selected="true"' : ' aria-selected="false"') +
          ">" + esc(p) + "</button>"
        );
      })
      .join("");
    el.addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      el.querySelectorAll("button").forEach(function (x) {
        x.classList.toggle("active", x === b);
        x.setAttribute("aria-selected", x === b ? "true" : "false");
      });
      onChange(b.dataset.period);
    });
  }

  function empty(el, text) {
    el.innerHTML = '<div class="an-empty">' + esc(text) + "</div>";
  }

  // Line chart. points: [{label, value, title}]
  function line(el, points, opts) {
    opts = opts || {};
    if (!points.length) return empty(el, opts.empty || "No data for this period");
    var W = el.clientWidth || 640;
    var H = opts.height || 240;
    var m = { l: 52, r: 14, t: 14, b: 30 };
    var iw = W - m.l - m.r;
    var ih = H - m.t - m.b;
    var fmt = opts.format || shortMoney;
    var max = niceMax(Math.max.apply(null, points.map(function (p) { return p.value; })));
    function x(i) {
      return points.length === 1 ? m.l + iw / 2 : m.l + (i / (points.length - 1)) * iw;
    }
    function y(v) {
      return m.t + ih - (v / max) * ih;
    }
    var svg = '<svg class="an-svg" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(opts.label || "Chart") + '">';
    for (var t = 0; t <= 4; t++) {
      var v = (max / 4) * t;
      svg +=
        '<line class="an-grid-line" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + y(v) + '" y2="' + y(v) + '"/>' +
        '<text class="an-axis" x="' + (m.l - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + esc(fmt(v)) + "</text>";
    }
    var every = Math.ceil(points.length / Math.max(2, Math.floor(iw / 46)));
    points.forEach(function (p, i) {
      if (i % every !== 0 && i !== points.length - 1) return;
      svg += '<text class="an-axis" x="' + x(i) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(p.label) + "</text>";
    });
    var pts = points.map(function (p, i) { return x(i) + "," + y(p.value); });
    if (points.length > 1) {
      svg +=
        '<polygon class="an-area" points="' + x(0) + "," + y(0) + " " + pts.join(" ") + " " + x(points.length - 1) + "," + y(0) + '"/>' +
        '<polyline class="an-line" points="' + pts.join(" ") + '"/>';
    }
    points.forEach(function (p, i) {
      var dot =
        '<circle class="an-dot" cx="' + x(i) + '" cy="' + y(p.value) + '" r="' + (points.length > 45 ? 2 : 3.5) + '">' +
        "<title>" + esc((p.title || p.label) + ": " + (opts.tip ? opts.tip(p.value) : money(p.value)) + (p.href ? " (click for details)" : "")) + "</title></circle>";
      svg += p.href
        ? '<a class="an-link" href="' + esc(p.href) + '"><circle class="an-hit" cx="' + x(i) + '" cy="' + y(p.value) + '" r="11"/>' + dot + "</a>"
        : dot;
    });
    el.innerHTML = svg + "</svg>";
  }

  // Vertical columns. points: [{label, value, title, tone}]
  function columns(el, points, opts) {
    opts = opts || {};
    var total = points.reduce(function (a, p) { return a + p.value; }, 0);
    if (!points.length || total === 0) return empty(el, opts.empty || "No data for this period");
    var W = el.clientWidth || 640;
    var H = opts.height || 230;
    var m = { l: 52, r: 10, t: 12, b: 34 };
    var iw = W - m.l - m.r;
    var ih = H - m.t - m.b;
    var fmt = opts.format || shortMoney;
    var max = niceMax(Math.max.apply(null, points.map(function (p) { return p.value; })));
    var slot = iw / points.length;
    var bw = Math.max(4, Math.min(44, slot * 0.62));
    function y(v) {
      return m.t + ih - (v / max) * ih;
    }
    var svg = '<svg class="an-svg" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(opts.label || "Chart") + '">';
    for (var t = 0; t <= 4; t++) {
      var v = (max / 4) * t;
      svg +=
        '<line class="an-grid-line" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + y(v) + '" y2="' + y(v) + '"/>' +
        '<text class="an-axis" x="' + (m.l - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + esc(fmt(v)) + "</text>";
    }
    var every = Math.ceil(points.length / Math.max(2, Math.floor(iw / 40)));
    points.forEach(function (p, i) {
      var cx = m.l + slot * i + slot / 2;
      var h = Math.max(0, (p.value / max) * ih);
      var col =
        '<rect class="an-col ' + (p.tone || "") + '" x="' + (cx - bw / 2) + '" y="' + (m.t + ih - h) + '" width="' + bw + '" height="' + h + '" rx="3">' +
        "<title>" + esc((p.title || p.label) + ": " + (opts.tip ? opts.tip(p.value) : money(p.value)) + (p.href ? " (click for details)" : "")) + "</title></rect>";
      svg += p.href
        ? '<a class="an-link" href="' + esc(p.href) + '"><rect class="an-hit" x="' + (cx - slot / 2) + '" y="' + m.t + '" width="' + slot + '" height="' + ih + '"/>' + col + "</a>"
        : col;
      if (i % every === 0) {
        svg += '<text class="an-axis" x="' + cx + '" y="' + (H - 12) + '" text-anchor="middle">' + esc(p.label) + "</text>";
      }
    });
    el.innerHTML = svg + "</svg>";
  }

  // Horizontal bars. rows: [{name, sub, value, display, tone}]
  function bars(el, rows, opts) {
    opts = opts || {};
    if (!rows.length) return empty(el, opts.empty || "No data for this period");
    var top = Math.max.apply(null, rows.map(function (r) { return r.value; })) || 1;
    el.innerHTML =
      '<div class="an-bars">' +
      rows
        .map(function (r) {
          var tag = r.href ? "a" : "div";
          return (
            "<" + tag + ' class="an-bar-row' + (r.href ? " an-link-row" : "") + '"' + (r.href ? ' href="' + esc(r.href) + '"' : "") + ">" +
            '<div class="an-bar-name"><span class="name" title="' + esc(r.name) + '">' + esc(r.name) + "</span>" +
            (r.sub ? '<span class="sub">' + esc(r.sub) + "</span>" : "") + "</div>" +
            '<div class="an-bar-track"><span class="an-bar-fill ' + (r.tone || "") + '" style="width:' + Math.max(0, (r.value / top) * 100).toFixed(1) + '%"></span></div>' +
            '<div class="an-bar-value">' + esc(r.display != null ? r.display : money(r.value)) + "</div></" + tag + ">"
          );
        })
        .join("") +
      "</div>";
  }

  // Donut. slices: [{label, value, display}]
  function donut(el, slices, opts) {
    opts = opts || {};
    var live = slices.filter(function (s) { return s.value > 0; });
    var total = live.reduce(function (a, s) { return a + s.value; }, 0);
    if (!total) return empty(el, opts.empty || "No data for this period");
    var r = 60;
    var C = 2 * Math.PI * r;
    var offset = 0;
    var arcs = live
      .map(function (s, i) {
        var len = (s.value / total) * C;
        var arc =
          '<circle class="an-slice c' + ((i % 6) + 1) + '" cx="84" cy="84" r="' + r + '" fill="none" stroke-width="22" ' +
          'stroke-dasharray="' + len + " " + (C - len) + '" stroke-dashoffset="' + -offset + '" transform="rotate(-90 84 84)">' +
          "<title>" + esc(s.label + ": " + (s.display != null ? s.display : money(s.value)) + (s.href ? " (click for details)" : "")) + "</title></circle>";
        if (s.href) arc = '<a class="an-link" href="' + esc(s.href) + '">' + arc + "</a>";
        offset += len;
        return arc;
      })
      .join("");
    el.innerHTML =
      '<div class="an-donut">' +
      '<svg viewBox="0 0 168 168" role="img" aria-label="' + esc(opts.label || "Breakdown") + '">' + arcs +
      '<text class="center-value" x="84" y="84" text-anchor="middle">' + esc(opts.center || "") + "</text>" +
      '<text class="center-label" x="84" y="100" text-anchor="middle">' + esc(opts.centerLabel || "") + "</text></svg>" +
      '<div class="an-legend">' +
      live
        .map(function (s, i) {
          var tag = s.href ? "a" : "div";
          return (
            "<" + tag + ' class="an-legend-row' + (s.href ? " an-link-row" : "") + '"' + (s.href ? ' href="' + esc(s.href) + '"' : "") + '><span class="an-swatch c' + ((i % 6) + 1) + '"></span>' +
            "<span>" + esc(s.label) + "</span>" +
            '<span class="pct">' + pct(s.value, total, 1) + "</span>" +
            '<span class="val">' + esc(s.display != null ? s.display : money(s.value)) + "</span></" + tag + ">"
          );
        })
        .join("") +
      "</div></div>";
  }

  // Table. cols: [{label, render(row) -> text, html:true, cls:"num"|"muted"}]
  function table(el, cols, rows, opts) {
    opts = opts || {};
    if (!rows.length) return empty(el, opts.empty || "Nothing to show");
    var page = opts.pageSize || 10;
    var shown = page;
    if (el._anRowClick) el.removeEventListener("click", el._anRowClick);
    el._anRowClick = null;
    if (opts.rowHref) {
      el._anRowClick = function (e) {
        if (e.target.closest("a, button")) return;
        var tr = e.target.closest("tr[data-href]");
        if (tr) window.location.href = tr.getAttribute("data-href");
      };
      el.addEventListener("click", el._anRowClick);
    }
    function draw() {
      var head =
        "<tr>" + cols.map(function (c) { return '<th class="' + (c.cls === "num" ? "num" : "") + '">' + esc(c.label) + "</th>"; }).join("") + "</tr>";
      var body = rows
        .slice(0, shown)
        .map(function (row) {
          var href = opts.rowHref ? opts.rowHref(row) : "";
          return (
            "<tr" + (href ? ' class="an-clickable" data-href="' + esc(href) + '"' : "") + ">" +
            cols
              .map(function (c, ci) {
                var v = c.render(row);
                var inner = c.html ? v : esc(v);
                if (href && ci === 0) inner = '<a class="an-rowlink" href="' + esc(href) + '">' + inner + "</a>";
                return '<td class="' + (c.cls || "") + '">' + inner + "</td>";
              })
              .join("") +
            "</tr>"
          );
        })
        .join("");
      el.innerHTML =
        '<div class="an-table-wrap"><table class="an-table"><thead>' + head + "</thead><tbody>" + body + "</tbody></table></div>" +
        (rows.length > shown
          ? '<button type="button" class="an-more">Show more (' + (rows.length - shown) + " remaining)</button>"
          : "");
      var more = el.querySelector(".an-more");
      if (more) {
        more.addEventListener("click", function () {
          shown += page;
          draw();
        });
      }
    }
    draw();
  }

  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  function hourLabel(h) {
    return (h % 12 || 12) + (h >= 12 ? "p" : "a");
  }

  // Revenue and transaction count per hour (Today), day (week / month) or
  // month (year / all time). Returns [{ label, title, revenue, count }].
  function buckets(period, sales) {
    var start = S.periodStart(period);
    var now = new Date();
    var list = [];
    var keyOf;
    var i;
    if (period === "Today") {
      for (i = 0; i <= now.getHours(); i++) {
        list.push({ key: i, label: hourLabel(i), title: hourLabel(i) + " hour" });
      }
      keyOf = function (d) { return d.getHours(); };
    } else if (period === "This week" || period === "This month") {
      var d = new Date(start);
      while (d <= now) {
        list.push({
          key: d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate(),
          label: period === "This week" ? WEEKDAYS[d.getDay()] : String(d.getDate()),
          title: WEEKDAYS[d.getDay()] + ", " + MONTHS[d.getMonth()] + " " + d.getDate(),
        });
        d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
      }
      keyOf = function (t) { return t.getFullYear() + "-" + t.getMonth() + "-" + t.getDate(); };
    } else {
      var first = period === "This year" || !sales.length
        ? start
        : new Date(Math.min.apply(null, sales.map(function (x) { return new Date(x.at); })));
      var m = new Date(first.getFullYear(), first.getMonth(), 1);
      while (m <= now) {
        list.push({
          key: m.getFullYear() + "-" + m.getMonth(),
          label: MONTHS[m.getMonth()] + (period === "All time" ? " " + String(m.getFullYear()).slice(2) : ""),
          title: MONTHS[m.getMonth()] + " " + m.getFullYear(),
        });
        m = new Date(m.getFullYear(), m.getMonth() + 1, 1);
      }
      keyOf = function (t) { return t.getFullYear() + "-" + t.getMonth(); };
    }
    var map = {};
    list.forEach(function (b) {
      b.revenue = 0;
      b.count = 0;
      map[b.key] = b;
    });
    sales.forEach(function (sale) {
      var b = map[keyOf(new Date(sale.at))];
      if (b) {
        b.revenue += S.saleTotal(sale);
        b.count += 1;
      }
    });
    return list;
  }

  // Small trend line for stat cards. values: [number]
  function sparkline(el, values) {
    if (!values.length || values.every(function (v) { return v === 0; })) {
      el.innerHTML = "";
      return;
    }
    var W = 120;
    var H = 36;
    var max = Math.max.apply(null, values) || 1;
    var step = values.length > 1 ? W / (values.length - 1) : 0;
    var pts = values.map(function (v, i) {
      return (values.length === 1 ? W / 2 : i * step).toFixed(1) + "," + (H - 3 - (v / max) * (H - 8)).toFixed(1);
    });
    el.innerHTML =
      '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" aria-hidden="true">' +
      '<polygon class="spark-area" points="0,' + H + " " + pts.join(" ") + " " + W + "," + H + '"/>' +
      '<polyline class="spark-line" points="' + pts.join(" ") + '"/></svg>';
  }

  // ---- detail page helpers ---------------------------------------------
  function head(title, sub) {
    var t = document.getElementById("pageTitle");
    var u = document.getElementById("pageSub");
    if (t) t.textContent = title;
    if (u) u.textContent = sub || "";
    document.title = title + " \u2014 Mynelle's Pharmacy";
  }
  function missing(title, message, href, label) {
    head(title, "");
    var body = document.getElementById("pageBody");
    if (body) body.hidden = true;
    var box = document.getElementById("notFound");
    if (box) {
      box.innerHTML =
        '<div class="panel"><div class="an-empty">' + esc(message) + "</div>" +
        '<div style="text-align:center;padding-bottom:18px"><a class="panel-link" href="' + esc(href || "analytics.html") + '">' + esc(label || "Back to analytics") + "</a></div></div>";
    }
  }
  // Standard transaction list; every row opens that transaction's own page.
  // amount(sale) overrides the Total column (e.g. one product's share).
  function txnTable(el, sales, opts) {
    opts = opts || {};
    table(el, [
      { label: "Transaction", render: function (s) { return s.id; } },
      { label: "Items", render: function (s) { return s.items.length + (s.items.length === 1 ? " product" : " products"); }, cls: "muted" },
      { label: "Payment", render: function (s) { return s.payment || "Cash"; }, cls: "muted" },
      { label: "Date and time", render: function (s) { return S.formatDateTime(s.at); }, cls: "muted" },
      { label: opts.amountLabel || "Total", render: function (s) { return money(opts.amount ? opts.amount(s) : S.saleTotal(s)); }, cls: "num" },
    ], sales, {
      empty: opts.empty || "No transactions in this period",
      pageSize: opts.pageSize || 10,
      rowHref: function (s) { return links.transaction(s.id); },
    });
  }
  function newest(sales) {
    return sales.slice().sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
  }
  // Pseudo-sales holding only the lines that match, so totals()/buckets()
  // report that product's or category's own revenue.
  function narrow(sales, keep) {
    var out = [];
    sales.forEach(function (s) {
      var items = s.items.filter(keep);
      if (items.length) out.push({ id: s.id, at: s.at, payment: s.payment, items: items });
    });
    return out;
  }
  function tabsFor(el, period, onChange) {
    tabs(el, period, onChange);
  }

  function initialPeriod(fallback) {
    var m = /[?&]period=([^&]*)/.exec(window.location.search);
    if (m) {
      var p = decodeURIComponent(m[1].replace(/\+/g, " "));
      if (PERIODS.indexOf(p) !== -1) return p;
    }
    return fallback;
  }

  function onResize(fn) {
    var timer = null;
    window.addEventListener("resize", function () {
      window.clearTimeout(timer);
      timer = window.setTimeout(fn, 150);
    });
  }

  return {
    PERIODS: PERIODS,
    esc: esc,
    money: money,
    shortMoney: shortMoney,
    int: int,
    pct: pct,
    range: range,
    previousRange: previousRange,
    previousLabel: previousLabel,
    salesBetween: salesBetween,
    totals: totals,
    change: change,
    changeText: changeText,
    productsById: productsById,
    soldByProduct: soldByProduct,
    stockValue: stockValue,
    daysUntil: daysUntil,
    criticalLevel: criticalLevel,
    stats: stats,
    tabs: tabs,
    empty: empty,
    line: line,
    columns: columns,
    bars: bars,
    donut: donut,
    table: table,
    initialPeriod: initialPeriod,
    head: head,
    missing: missing,
    txnTable: txnTable,
    newest: newest,
    narrow: narrow,
    url: url,
    param: param,
    links: links,
    bucketRef: bucketRef,
    bucketHref: bucketHref,
    wireBack: wireBack,
    syncPeriodLinks: syncPeriodLinks,
    MONTHS: MONTHS,
    buckets: buckets,
    sparkline: sparkline,
    hourLabel: hourLabel,
    WEEKDAYS: WEEKDAYS,
    onResize: onResize,
  };
})();
