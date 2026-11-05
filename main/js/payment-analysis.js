(function () {
  var A = Analytics;
  var S = MynelleStore;
  var $ = function (id) { return document.getElementById(id); };
  var period = A.initialPeriod("This month");
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function render() {
    var sales = S.salesIn(period);
    var cur = A.totals(sales);
    var by = {};
    sales.forEach(function (s) {
      var k = s.payment || "Cash";
      var r = by[k] || (by[k] = { method: k, count: 0, revenue: 0 });
      r.count += 1;
      r.revenue += S.saleTotal(s);
    });
    var rows = Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return b.revenue - a.revenue; });
    var cash = by.Cash ? by.Cash.revenue : 0;
    var digital = cur.revenue - cash;
    var top = rows[0];

    A.stats($("summary"), [
      { label: "Most used method", value: top ? top.method : "None", sub: top ? A.pct(top.count, cur.count, 1) + " of transactions" : "", tone: "blue" },
      { label: "Cash revenue", value: A.money(cash), sub: A.pct(cash, cur.revenue, 1) + " of revenue", tone: "green" },
      { label: "Digital and card revenue", value: A.money(digital), sub: A.pct(digital, cur.revenue, 1) + " of revenue", tone: "teal" },
      { label: "Transactions", value: A.int(cur.count), sub: "Average " + A.money(cur.avg), tone: "navy" },
    ], true);

    A.donut($("revenueDonut"), rows.map(function (r) { return { label: r.method, value: r.revenue, href: A.links.payment(r.method, period) }; }),
      { center: A.money(cur.revenue), centerLabel: "Total revenue", label: "Revenue by payment method" });
    A.donut($("countDonut"), rows.map(function (r) { return { label: r.method, value: r.count, display: A.int(r.count), href: A.links.payment(r.method, period) }; }),
      { center: A.int(cur.count), centerLabel: "Transactions", label: "Transactions by payment method" });

    var months = {};
    sales.forEach(function (s) {
      var d = new Date(s.at);
      var key = period === "Today" ? d.getHours() : period === "This year" || period === "All time" ? d.getFullYear() + "-" + d.getMonth() : d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate();
      months[key] = months[key] || { t: d, methods: {} };
      var k = s.payment || "Cash";
      months[key].methods[k] = (months[key].methods[k] || 0) + S.saleTotal(s);
    });
    var names = rows.map(function (r) { return r.method; });
    var keys = Object.keys(months).sort(function (a, b) { return months[a].t - months[b].t; });
    var digitalPoints = keys.map(function (k) {
      var d = months[k].t;
      var label = period === "Today" ? (d.getHours() % 12 || 12) + (d.getHours() >= 12 ? "p" : "a") : period === "This year" || period === "All time" ? MONTHS[d.getMonth()] : String(d.getDate());
      var total = names.reduce(function (a, n) { return a + (months[k].methods[n] || 0); }, 0);
      var nonCash = total - (months[k].methods.Cash || 0);
      return { label: label, value: total ? (nonCash / total) * 100 : 0, title: label };
    });
    A.line($("shareChart"), digitalPoints, {
      format: function (v) { return Math.round(v) + "%"; },
      tip: function (v) { return v.toFixed(1) + "% non-cash"; },
      label: "Share of revenue paid without cash",
      empty: "No transactions in this period",
    });

    A.table($("methodTable"), [
      { label: "Method", render: function (r) { return r.method; } },
      { label: "Transactions", render: function (r) { return A.int(r.count); }, cls: "num" },
      { label: "Share of transactions", render: function (r) { return A.pct(r.count, cur.count, 1); }, cls: "num" },
      { label: "Revenue", render: function (r) { return A.money(r.revenue); }, cls: "num" },
      { label: "Share of revenue", render: function (r) { return A.pct(r.revenue, cur.revenue, 1); }, cls: "num" },
      { label: "Average sale", render: function (r) { return A.money(r.revenue / r.count); }, cls: "num" },
    ], rows, { empty: "No transactions in this period", rowHref: function (r) { return A.links.payment(r.method, period); } });
  }

  A.tabs($("periodTabs"), period, function (p) { period = p; render(); });
  A.onResize(render);
  render();
})();
