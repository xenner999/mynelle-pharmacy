// Dedicated page for one payment method: payment-detail.html?m=Cash&period=This+month
(function () {
  var A = Analytics;
  var S = MynelleStore;
  var $ = function (id) { return document.getElementById(id); };
  A.wireBack();

  var method = A.param("m");
  var period = A.initialPeriod("This month");
  if (!method) {
    A.missing("Payment method not found", "No payment method was given.", "payment-analysis.html", "Payment analysis");
    return;
  }
  A.head(method + " payments", "Every transaction paid by " + method);
  var is = function (s) { return (s.payment || "Cash") === method; };

  function render() {
    var sales = S.salesIn(period);
    var mine = sales.filter(is);
    var all = A.totals(sales);
    var cur = A.totals(mine);
    var pr = A.previousRange(period);
    var prev = pr ? A.totals(A.salesBetween(pr.from, pr.to).filter(is)) : null;

    A.stats($("summary"), [
      { label: "Revenue", value: A.money(cur.revenue), sub: prev ? A.changeText(cur.revenue, prev.revenue, A.previousLabel(period)) : "", tone: "blue" },
      { label: "Transactions", value: A.int(cur.count), sub: prev ? A.changeText(cur.count, prev.count, A.previousLabel(period)) : "", tone: "green" },
      { label: "Average sale", value: A.money(cur.avg), sub: "All methods: " + A.money(all.avg), tone: "teal" },
      { label: "Share of revenue", value: A.pct(cur.revenue, all.revenue, 1), sub: "of " + A.money(all.revenue), tone: "navy" },
    ], true);

    A.line($("trendChart"), A.buckets(period, mine).map(function (x) {
      return { label: x.label, title: x.title, value: x.revenue, href: A.bucketHref(period, x) };
    }), { label: method + " revenue trend", empty: "No " + method + " payments in this period" });

    var sold = {};
    var names = {};
    var hours = [];
    var h;
    for (h = 0; h < 24; h++) hours.push({ label: A.hourLabel(h), title: A.hourLabel(h) + " hour", value: 0, href: A.links.time("hourofday", h, period) });
    mine.forEach(function (s) {
      hours[new Date(s.at).getHours()].value += S.saleTotal(s);
      s.items.forEach(function (i) {
        sold[i.productId] = (sold[i.productId] || 0) + i.qty * i.price;
        names[i.productId] = i.name;
      });
    });
    A.bars($("topBars"), Object.keys(sold).sort(function (a, b) { return sold[b] - sold[a]; }).slice(0, 8).map(function (id) {
      return { name: names[id], value: sold[id], href: A.links.product(id, period) };
    }), { empty: "No sales in this period" });
    A.columns($("hourChart"), hours.slice(6, 23), { height: 210, label: method + " revenue by hour", empty: "No sales in this period" });

    A.txnTable($("txnTable"), A.newest(mine));
  }

  A.tabs($("periodTabs"), period, function (x) { period = x; render(); });
  A.onResize(render);
  render();
})();
