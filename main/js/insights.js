// Insight blocks worked out from the pharmacy's own sales and stock. Shared by the Dashboard and Analytics pages:
//   highlights - what stood out          why     - what changed since the last period
//   forecast   - expected next 7 days    risks   - what may run out or expire
//   actions    - what to do next
// Needs analytics-lib.js (Analytics) and settings-store.js (MynelleStore). Orders (orders-store.js) is optional.
var Insights = (function () {
  var A = Analytics;
  var S = MynelleStore;
  var DAY = 24 * 60 * 60 * 1000;

  function esc(v) { return A.esc ? A.esc(v) : String(v == null ? "" : v).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function plural(n, w) { return A.int(n) + " " + w + (Math.round(n) === 1 ? "" : "s"); }
  function startOfDay(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function slot(el, name) { return el.querySelector('[data-slot="' + name + '"]'); }

  // ---- shared numbers ------------------------------------------------
  function dailyRevenue(days) {
    var today = startOfDay(new Date());
    var out = [];
    for (var i = days - 1; i >= 0; i--) out.push({ date: new Date(today.getTime() - i * DAY), value: 0 });
    var from = out[0].date.getTime();
    S.getSales().forEach(function (s) {
      var t = new Date(s.at).getTime();
      if (t < from) return;
      var idx = Math.floor((startOfDay(new Date(s.at)).getTime() - from) / DAY);
      if (out[idx]) out[idx].value += S.saleTotal(s);
    });
    return out;
  }
  // units sold per day for each product over the last 30 days
  function velocity() {
    var from = new Date(Date.now() - 30 * DAY);
    var sold = A.soldByProduct(A.salesBetween(from, new Date()));
    var v = {};
    Object.keys(sold).forEach(function (id) { v[id] = sold[id].units / 30; });
    return v;
  }
  function inDateBatches(p) {
    return (p.batches || [])
      .filter(function (b) { return Number(b.qty) > 0 && b.expiry && A.daysUntil(b.expiry) >= 0; })
      .sort(function (a, b) { return new Date(a.expiry) - new Date(b.expiry); });
  }
  // Oldest-first selling: how many units of each batch are not expected to sell before it expires.
  function expiryRisk(p, perDay) {
    var sold = 0, out = [];
    inDateBatches(p).forEach(function (b) {
      var days = A.daysUntil(b.expiry);
      var canSell = Math.max(0, perDay * days - sold);
      var take = Math.min(Number(b.qty), canSell);
      sold += take;
      var left = Number(b.qty) - take;
      if (left >= 1) out.push({ lot: b.lot, days: days, left: Math.floor(left), value: Math.floor(left) * Number(p.price) });
    });
    return out;
  }

  // ---- highlights ----------------------------------------------------
  function highlights(el, per) {
    var sales = S.salesIn(per);
    if (!sales.length) { A.empty(el, "No sales in this period"); return; }
    var t = A.totals(sales);
    var byId = A.productsById();
    var sold = A.soldByProduct(sales);
    var ids = Object.keys(sold).sort(function (a, b) { return sold[b].revenue - sold[a].revenue; });
    var cats = {}, hours = {}, days = {}, pay = {};
    sales.forEach(function (s) {
      var d = new Date(s.at), tot = S.saleTotal(s);
      hours[d.getHours()] = (hours[d.getHours()] || 0) + tot;
      days[d.getDay()] = (days[d.getDay()] || 0) + tot;
      pay[s.payment || "Cash"] = (pay[s.payment || "Cash"] || 0) + tot;
    });
    ids.forEach(function (id) { var c = (byId[id] && byId[id].category) || "Others"; cats[c] = (cats[c] || 0) + sold[id].revenue; });
    function top(map) { return Object.keys(map).sort(function (a, b) { return map[b] - map[a]; })[0]; }
    var topP = ids[0], topC = top(cats), topH = top(hours), topD = top(days), topPay = top(pay);
    el.innerHTML = '<ul class="ty-list ty-highlights">' +
      "<li>Best seller: <b>" + esc(byId[topP] ? byId[topP].name : topP) + "</b> with " + A.money(sold[topP].revenue) + " (" + plural(sold[topP].units, "unit") + ").</li>" +
      "<li>Strongest category: <b>" + esc(topC) + "</b>, " + A.pct(cats[topC], t.revenue) + " of revenue.</li>" +
      "<li>Busiest hour: <b>" + A.hourLabel(Number(topH)) + "</b>. Busiest day: <b>" + A.WEEKDAYS[Number(topD)] + "</b>.</li>" +
      "<li>Most used payment: <b>" + esc(topPay) + "</b> (" + A.pct(pay[topPay], t.revenue) + " of revenue).</li></ul>";
  }

  // ---- why revenue changed -------------------------------------------
  function why(el, per) {
    var pr = A.previousRange(per);
    if (!pr) return A.empty(el, 'Pick a period other than "All time" so there is an earlier period to compare against.');
    var cur = A.salesBetween(A.range(per).from, new Date());
    var prev = A.salesBetween(pr.from, pr.to);
    var c = A.totals(cur), p = A.totals(prev);
    if (!p.count) return A.empty(el, "There are no sales in " + A.previousLabel(per) + " to compare with.");
    var delta = c.revenue - p.revenue;
    var volume = (c.count - p.count) * p.avg;   // more or fewer customers
    var basket = (c.avg - p.avg) * c.count;     // bigger or smaller baskets
    var label = A.previousLabel(per);
    var byId = A.productsById();
    var sc = A.soldByProduct(cur), sp = A.soldByProduct(prev);
    var rows = {};
    Object.keys(sc).concat(Object.keys(sp)).forEach(function (id) {
      var a = sc[id] || { units: 0, revenue: 0 }, b = sp[id] || { units: 0, revenue: 0 };
      rows[id] = { id: id, d: a.revenue - b.revenue, du: a.units - b.units, a: a, b: b };
    });
    var list = Object.keys(rows).map(function (k) { return rows[k]; }).sort(function (x, y) { return y.d - x.d; });
    var up = list.filter(function (r) { return r.d > 0; }).slice(0, 4);
    var down = list.filter(function (r) { return r.d < 0; }).reverse().slice(0, 4);

    function reason(r) {
      var pd = byId[r.id];
      if (r.d < 0) {
        if (pd && Number(pd.stock) <= 0) return "Out of stock now, which likely cost sales";
        if (pd && S.isLowStock && S.isLowStock(pd)) return "Running low, so sales may be limited";
        if (!r.a.units) return "No sales this period";
        var pa = r.a.revenue / r.a.units, pb = r.b.units ? r.b.revenue / r.b.units : pa;
        if (pa < pb * 0.95) return "Sold at a lower price";
        return plural(Math.abs(r.du), "fewer unit") + " sold (demand fell)";
      }
      if (!r.b.units) return "New this period, no sales before";
      var qa = r.a.revenue / r.a.units, qb = r.b.revenue / r.b.units;
      if (qa > qb * 1.05) return "Higher price and " + plural(Math.abs(r.du), "more unit") + " sold";
      return plural(Math.abs(r.du), "more unit") + " sold (demand grew)";
    }
    function block(title, tone, arr) {
      if (!arr.length) return "";
      return '<div class="ty-block"><h3>' + title + "</h3>" + arr.map(function (r) {
        var name = byId[r.id] ? byId[r.id].name : r.id;
        return '<a class="ty-row" href="' + esc(A.links.product(r.id, per)) + '"><span class="ty-name">' + esc(name) +
          '<small>' + esc(reason(r)) + '</small></span><span class="ty-delta ' + tone + '">' + (r.d >= 0 ? "+" : "") + A.money(r.d) + "</span></a>";
      }).join("") + "</div>";
    }
    var sign = delta >= 0 ? "up" : "down";
    var main = Math.abs(volume) >= Math.abs(basket) ? "the number of customers" : "how much each customer spent";
    el.innerHTML = '<div data-slot="stats"></div>' +
      '<p class="ty-lead">Revenue is <b class="' + sign + '">' + (delta >= 0 ? "up " : "down ") + A.money(Math.abs(delta)) + "</b> compared with " + label +
      ", mostly because of <b>" + main + "</b>.</p>" +
      '<div class="ty-cols">' + block("What pushed revenue up", "up", up) + block("What pulled it down", "down", down) + "</div>" +
      '<h3 class="ty-h3 ty-gap">Change in revenue by category</h3><div data-slot="cats"></div>';
    var cc = {};
    Object.keys(rows).forEach(function (id) { var cat = (byId[id] && byId[id].category) || "Others"; cc[cat] = (cc[cat] || 0) + rows[id].d; });
    A.bars(slot(el, "cats"), Object.keys(cc).filter(function (k) { return Math.round(cc[k]) !== 0; })
      .sort(function (a, b) { return cc[b] - cc[a]; }).map(function (k) {
        return { name: k, value: Math.abs(cc[k]), display: (cc[k] >= 0 ? "+" : "-") + A.money(Math.abs(cc[k])), tone: cc[k] >= 0 ? "" : "bad", href: A.links.category(k, per) };
      }), { empty: "No category changes" });
    A.stats(slot(el, "stats"), [
      { label: "Revenue change", value: (delta >= 0 ? "+" : "") + A.money(delta), sub: A.changeText(c.revenue, p.revenue, label), tone: delta >= 0 ? "green" : "red" },
      { label: "From customer volume", value: (volume >= 0 ? "+" : "") + A.money(volume), sub: A.int(c.count) + " vs " + A.int(p.count) + " transactions", tone: "blue" },
      { label: "From basket size", value: (basket >= 0 ? "+" : "") + A.money(basket), sub: A.money(c.avg) + " vs " + A.money(p.avg) + " average sale", tone: "teal" },
    ], false);
  }

  // ---- forecast ------------------------------------------------------
  function forecastData() {
    var hist = dailyRevenue(28);
    var active = hist.filter(function (d) { return d.value > 0; }).length;
    if (active < 7) return null;
    var recent = hist.slice(14).reduce(function (a, d) { return a + d.value; }, 0);
    var before = hist.slice(0, 14).reduce(function (a, d) { return a + d.value; }, 0);
    var trend = before > 0 ? Math.max(0.8, Math.min(1.2, recent / before)) : 1;
    var byDow = {};
    hist.forEach(function (d) { var k = d.date.getDay(); (byDow[k] = byDow[k] || []).push(d.value); });
    var avgAll = hist.reduce(function (a, d) { return a + d.value; }, 0) / hist.length;
    var out = [];
    for (var i = 1; i <= 7; i++) {
      var d = new Date(startOfDay(new Date()).getTime() + i * DAY);
      var arr = byDow[d.getDay()] || [];
      var base = arr.length ? arr.reduce(function (a, b) { return a + b; }, 0) / arr.length : avgAll;
      out.push({ date: d, value: base * trend });
    }
    return { days: out, trend: trend, last7: hist.slice(21).reduce(function (a, d) { return a + d.value; }, 0) };
  }
  function forecast(el) {
    var f = forecastData();
    if (!f) return A.empty(el, "Not enough sales history yet. Forecasts start once there are at least 7 days with sales in the last 4 weeks.");
    var next7 = f.days.reduce(function (a, d) { return a + d.value; }, 0);
    el.innerHTML = '<p class="ty-lead ty-lead-tight">Expected <b>' + A.money(next7) + "</b> over the next 7 days, " +
      '<b class="' + (next7 >= f.last7 ? "up" : "down") + '">' + A.changeText(next7, f.last7, "the last 7 days") + "</b>.</p>" +
      '<div data-slot="chart"></div>' +
      '<p class="ty-note">Based on the last 4 weeks: each weekday\'s usual sales, adjusted for the recent trend (' + (f.trend >= 1 ? "+" : "") + ((f.trend - 1) * 100).toFixed(0) + "%).</p>";
    A.columns(slot(el, "chart"), f.days.map(function (d) {
      return { label: A.WEEKDAYS[d.date.getDay()], title: d.date.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " (forecast)", value: d.value };
    }), { label: "Forecast revenue", height: 220 });
  }

  // ---- stock and expiry outlook --------------------------------------
  function risks(el) {
    var v = velocity(), prods = S.getProducts();
    var runout = [], risk = [], riskTotal = 0;
    prods.forEach(function (p) {
      var perDay = v[p.id] || 0, stock = Number(p.stock) || 0;
      if (perDay > 0 && stock > 0) {
        var cover = stock / perDay;
        if (cover <= 14) runout.push({ p: p, cover: cover, perDay: perDay });
      }
      if (perDay > 0) expiryRisk(p, perDay).forEach(function (r) { risk.push({ p: p, r: r }); riskTotal += r.value; });
    });
    runout.sort(function (a, b) { return a.cover - b.cover; });
    risk.sort(function (a, b) { return b.r.value - a.r.value; });
    el.innerHTML = '<div data-slot="stats"></div>' +
      '<div class="ty-cols"><div class="ty-block"><h3>Likely to run out within 2 weeks</h3>' +
      (runout.length ? runout.slice(0, 6).map(function (x) {
        return '<a class="ty-row" href="' + esc(A.links.product(x.p.id, "This month")) + '"><span class="ty-name">' + esc(x.p.name) +
          "<small>" + A.int(x.p.stock) + " " + esc(x.p.unit) + " left, selling about " + x.perDay.toFixed(1) + " a day" +
          (typeof Orders !== "undefined" && Orders.incoming(x.p.id) ? " \u00B7 " + plural(Orders.incoming(x.p.id), "unit") + " on order" : "") + "</small></span>" +
          '<span class="ty-delta down">' + (x.cover < 1 ? "< 1 day" : plural(Math.floor(x.cover), "day")) + "</span></a>";
      }).join("") : '<p class="ty-note">Nothing is expected to run out in the next 2 weeks.</p>') + "</div>" +
      '<div class="ty-block"><h3>Batches that may expire before they sell</h3>' +
      (risk.length ? risk.slice(0, 6).map(function (x) {
        return '<a class="ty-row" href="' + esc(A.links.product(x.p.id, "This month")) + '"><span class="ty-name">' + esc(x.p.name) +
          "<small>Lot " + esc(x.r.lot || "-") + ": about " + plural(x.r.left, esc(x.p.unit)) + " unsold, expires in " + plural(x.r.days, "day") + "</small></span>" +
          '<span class="ty-delta down">' + A.money(x.r.value) + "</span></a>";
      }).join("") : '<p class="ty-note">At the current pace, everything in stock should sell before it expires.</p>') + "</div></div>";
    A.stats(slot(el, "stats"), [
      { label: "May run out soon", value: A.int(runout.length), sub: "products within 14 days of cover", tone: runout.length ? "red" : "green" },
      { label: "Expiry loss risk", value: A.money(riskTotal), sub: A.int(risk.length) + " batches may not sell in time", tone: riskTotal ? "red" : "green" },
    ], false);
  }

  // ---- recommended actions -------------------------------------------
  function actions(el, limit) {
    limit = limit || 10;
    var v = velocity(), acts = [];
    var sales = S.getSales();
    S.getProducts().forEach(function (p) {
      var perDay = v[p.id] || 0, stock = Number(p.stock) || 0;
      var cover = perDay > 0 ? stock / perDay : Infinity;
      // clear batches that will not sell in time
      if (perDay > 0) {
        expiryRisk(p, perDay).filter(function (r) { return r.days <= 60; }).forEach(function (r) {
          var off = r.days <= 14 ? 20 : 10;
          acts.push({ pri: r.days <= 14 ? 1 : 2, type: "Clear stock", href: A.links.product(p.id, "This month"),
            title: "Move " + plural(r.left, p.unit) + " of " + p.name + " before it expires",
            why: "Lot " + (r.lot || "-") + " expires in " + plural(r.days, "day") + ". Offer it first and consider " + off + "% off to avoid losing " + A.money(r.value) + ".",
            score: r.value });
        });
      }
      // slow movers
      if (stock > 0 && perDay > 0 && cover > 120 && stock * Number(p.price) >= 2000) {
        acts.push({ pri: 3, type: "Hold ordering", href: A.links.product(p.id, "This year"),
          title: "Pause reordering " + p.name,
          why: "About " + plural(Math.round(cover), "day") + " of stock on hand, tying up " + A.money(stock * Number(p.price)) + ".", score: stock * Number(p.price) / 100 });
      }
    });
    // restock: from the Orders page's suggestions (stock condition + sales - what is already on order)
    if (typeof Orders !== "undefined") {
      Orders.suggestions().forEach(function (x) {
        var p = x.product;
        acts.push({ pri: x.priority, type: "Restock", href: "orders.html?add=" + encodeURIComponent(p.id),
          title: "Reorder " + plural(x.qty, p.unit) + " of " + p.name,
          why: x.reason + (x.onOrder ? ", with " + plural(x.onOrder, p.unit) + " already on order" : "") + ". Open Orders to create the purchase order.",
          score: x.perDay * Number(p.price) });
      });
      Orders.getOrders().filter(Orders.isOverdue).forEach(function (o) {
        acts.push({ pri: 1, type: "Follow up", href: "orders.html?order=" + encodeURIComponent(o.id),
          title: "Follow up on order " + o.id + (o.supplier ? " with " + o.supplier : ""),
          why: "It was expected on " + o.expected + " and has not been received yet.", score: 1e6 });
      });
    }
    // staffing
    var hours = {}, total = 0;
    sales.filter(function (s) { return new Date(s.at) > new Date(Date.now() - 28 * DAY); }).forEach(function (s) {
      var h = new Date(s.at).getHours(), t = S.saleTotal(s); hours[h] = (hours[h] || 0) + t; total += t;
    });
    var hk = Object.keys(hours).sort(function (a, b) { return hours[b] - hours[a]; })[0];
    if (hk !== undefined && total > 0) {
      acts.push({ pri: 3, type: "Staffing", href: A.links.time("hourofday", hk, "This month"),
        title: "Have a second cashier ready around " + A.hourLabel(Number(hk)),
        why: A.pct(hours[hk], total) + " of the last 4 weeks' revenue came in that hour.", score: hours[hk] / 1000 });
    }
    acts.sort(function (a, b) { return a.pri - b.pri || b.score - a.score; });
    if (!acts.length) return A.empty(el, "Nothing needs action right now. Stock levels and expiry dates look healthy.");
    var names = { 1: "High", 2: "Medium", 3: "Low" };
    el.innerHTML = '<div class="ty-actions">' + acts.slice(0, limit).map(function (a) {
      return '<a class="ty-act" href="' + esc(a.href) + '"><span class="ty-pill p' + a.pri + '">' + names[a.pri] + '</span>' +
        '<span class="ty-name"><b>' + esc(a.title) + "</b><small>" + esc(a.why) + '</small></span><span class="ty-tag">' + esc(a.type) + "</span></a>";
    }).join("") + "</div>" + (acts.length > limit ? '<p class="ty-note">Showing the ' + limit + " most important of " + acts.length + " suggestions.</p>" : "");
  }

  return { highlights: highlights, why: why, forecast: forecast, risks: risks, actions: actions };
})();
