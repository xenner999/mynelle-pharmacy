(function () {
  var A = Analytics;
  var S = MynelleStore;
  var $ = function (id) { return document.getElementById(id); };
  var period = A.initialPeriod("This month");

  function kpi(id, value, sub, trend) {
    $(id + "Value").textContent = value;
    var subEl = $(id + "Sub");
    subEl.textContent = sub.text || "";
    subEl.className = "kpi-sub" + (sub.dir ? " " + sub.dir : "");
    if (trend) A.sparkline($(id + "Spark"), trend);
  }

  function vs(cur, prev, label) {
    var c = prev ? A.change(cur, prev) : null;
    if (!c) return { text: "" };
    return { text: c.text + " vs " + label, dir: c.value >= 0 ? "up" : "down" };
  }

  var L = A.links;

  function renderSales() {
    A.syncPeriodLinks(period);
    var sales = S.salesIn(period);
    var cur = A.totals(sales);
    var pr = A.previousRange(period);
    var prev = pr ? A.totals(A.salesBetween(pr.from, pr.to)) : null;
    var label = A.previousLabel(period);
    var b = A.buckets(period, sales);

    kpi("kRevenue", A.money(cur.revenue), vs(cur.revenue, prev && prev.revenue, label), b.map(function (x) { return x.revenue; }));
    kpi("kTxn", A.int(cur.count), vs(cur.count, prev && prev.count, label), b.map(function (x) { return x.count; }));
    kpi("kAvg", A.money(cur.avg), vs(cur.avg, prev && prev.avg, label), b.map(function (x) { return x.count ? x.revenue / x.count : 0; }));

    $("trendTitle").textContent = period === "Today" ? "Revenue by hour" : period === "This year" || period === "All time" ? "Revenue by month" : "Revenue by day";
    A.line($("trendChart"), b.map(function (x) { return { label: x.label, title: x.title, value: x.revenue, href: A.bucketHref(period, x) }; }), { label: "Revenue trend", empty: "No sales in this period" });

    var pay = {};
    var hours = [];
    var h;
    for (h = 0; h < 24; h++) hours.push({ label: A.hourLabel(h), title: A.hourLabel(h) + " hour", value: 0, href: L.time("hourofday", h, period) });
    var week = [1, 2, 3, 4, 5, 6, 0].map(function (d) { return { label: A.WEEKDAYS[d], title: A.WEEKDAYS[d], value: 0, dow: d, href: L.time("weekday", d, period) }; });
    var sold = {};
    var names = {};
    sales.forEach(function (s) {
      var t = new Date(s.at);
      var total = S.saleTotal(s);
      var k = s.payment || "Cash";
      pay[k] = (pay[k] || 0) + total;
      hours[t.getHours()].value += total;
      week.forEach(function (w) { if (w.dow === t.getDay()) w.value += total; });
      s.items.forEach(function (i) {
        sold[i.productId] = (sold[i.productId] || 0) + i.qty * i.price;
        names[i.productId] = i.name;
      });
    });

    A.donut($("payChart"), Object.keys(pay).sort(function (a, b2) { return pay[b2] - pay[a]; }).map(function (k) {
      return { label: k, value: pay[k], href: L.payment(k, period) };
    }), { center: A.money(cur.revenue), centerLabel: "Revenue", label: "Revenue by payment method", empty: "No sales in this period" });

    A.bars($("topBars"), Object.keys(sold).sort(function (a, b2) { return sold[b2] - sold[a]; }).slice(0, 6).map(function (id) {
      return { name: names[id], value: sold[id], href: L.product(id, period) };
    }), { empty: "No sales in this period" });

    var byCat = {};
    var catOf = {};
    S.getProducts().forEach(function (p) { catOf[p.id] = p.category || "Uncategorised"; });
    Object.keys(sold).forEach(function (id) {
      var c = catOf[id] || "Uncategorised";
      byCat[c] = (byCat[c] || 0) + sold[id];
    });
    A.donut($("catDonut"), Object.keys(byCat).sort(function (a, b2) { return byCat[b2] - byCat[a]; }).map(function (c) {
      return { label: c, value: byCat[c], href: L.category(c, period) };
    }), { center: A.money(cur.revenue), centerLabel: "Revenue", label: "Revenue by category", empty: "No sales in this period" });

    A.columns($("hourChart"), hours.slice(6, 23), { height: 210, label: "Revenue by hour of day", empty: "No sales in this period" });
    A.columns($("weekdayChart"), week, { height: 210, label: "Revenue by day of week", empty: "No sales in this period" });
  }

  function renderInventory() {
    var products = S.getProducts();
    var value = products.reduce(function (a, p) { return a + A.stockValue(p); }, 0);
    kpi("kValue", A.money(value), { text: A.int(products.length) + " products" });

    var out = products.filter(function (p) { return Number(p.stock) === 0; });
    var low = products.filter(function (p) { return S.isLowStock(p) && Number(p.stock) > 0; });
    kpi("kLow", A.int(low.length), { text: "At or below critical level" });
    kpi("kOut", A.int(out.length), { text: "Need restocking" });

    var batches = [];
    products.forEach(function (p) {
      p.batches.forEach(function (b) {
        var d = A.daysUntil(b.expiry);
        if (d !== null) batches.push({ p: p, b: b, d: d, v: b.qty * Number(p.price) });
      });
    });
    var flagged = batches.filter(function (r) { return r.d <= S.expiryWindowFor(r.p); });
    kpi("kExp", A.int(flagged.length), { text: "Expired or inside the warning window" });
    kpi("kRisk", A.money(flagged.reduce(function (a, r) { return a + r.v; }, 0)), { text: "Stock value in those batches" });

    A.donut($("levelDonut"), [
      { label: "Healthy", value: products.length - low.length - out.length, display: A.int(products.length - low.length - out.length), href: L.stock("healthy") },
      { label: "Low stock", value: low.length, display: A.int(low.length), href: L.stock("low") },
      { label: "Out of stock", value: out.length, display: A.int(out.length), href: L.stock("out") },
    ], { center: A.int(products.length), centerLabel: "Products", label: "Stock levels", empty: "No products in inventory" });

    var edges = [
      ["Expired", function (d) { return d < 0; }, "c4"],
      ["0-30d", function (d) { return d >= 0 && d <= 30; }, "c3"],
      ["31-60d", function (d) { return d > 30 && d <= 60; }, "c3"],
      ["61-90d", function (d) { return d > 60 && d <= 90; }, "c2"],
      ["91-180d", function (d) { return d > 90 && d <= 180; }, "c2"],
      ["181-365d", function (d) { return d > 180 && d <= 365; }, "c5"],
      ["1y+", function (d) { return d > 365; }, "c5"],
    ];
    A.columns($("expiryChart"), edges.map(function (e) {
      return { label: e[0], title: e[0], tone: e[2], href: L.stock("batches", e[0]), value: batches.filter(function (r) { return e[1](r.d); }).length };
    }), { height: 210, format: function (v) { return String(Math.round(v)); }, tip: function (v) { return v + (v === 1 ? " batch" : " batches"); }, label: "Batches by time to expiry", empty: "No batches with expiry dates" });

    var tight = products.filter(function (p) { return Number(p.stock) > 0 && S.isLowStock(p); })
      .map(function (p) { return { p: p, ratio: Number(p.stock) / S.criticalLevelFor(p) }; })
      .sort(function (a, b) { return a.ratio - b.ratio; }).slice(0, 8);
    var outRows = out.slice(0, Math.max(0, 8 - tight.length)).map(function (p) { return { p: p, ratio: 0 }; });
    A.bars($("restockBars"), outRows.concat(tight).map(function (r) {
      var tone = r.ratio === 0 ? "c4" : r.ratio <= 0.5 ? "c3" : "c2";
      return {
        name: r.p.name,
        href: L.product(r.p.id),
        sub: r.ratio === 0 ? "Out of stock" : "Critical level " + S.criticalLevelFor(r.p),
        value: r.ratio === 0 ? 0.04 : r.ratio,
        display: S.formatQty(r.p.stock, r.p.unit),
        tone: tone,
      };
    }), { empty: "Nothing is running low" });
  }

  function render() {
    renderSales();
    renderInventory();
  }

  A.tabs($("periodTabs"), period, function (p) { period = p; renderSales(); });
  A.onResize(render);
  render();
})();
