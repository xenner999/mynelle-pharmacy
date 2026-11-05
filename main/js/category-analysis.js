(function () {
  var A = Analytics;
  var S = MynelleStore;
  var $ = function (id) { return document.getElementById(id); };
  var period = A.initialPeriod("This month");

  function render() {
    var sales = S.salesIn(period);
    var sold = A.soldByProduct(sales);
    var cats = {};
    S.getProducts().forEach(function (p) {
      var k = p.category || "Uncategorised";
      var c = cats[k] || (cats[k] = { name: k, products: 0, stock: 0, value: 0, units: 0, revenue: 0 });
      c.products += 1;
      c.stock += Number(p.stock);
      c.value += A.stockValue(p);
      var r = sold[p.id];
      if (r) { c.units += r.units; c.revenue += r.revenue; }
    });
    var rows = Object.keys(cats).map(function (k) { return cats[k]; });
    var totalRevenue = rows.reduce(function (a, c) { return a + c.revenue; }, 0);
    var totalValue = rows.reduce(function (a, c) { return a + c.value; }, 0);
    var byRevenue = rows.slice().sort(function (a, b) { return b.revenue - a.revenue; });
    var byValue = rows.slice().sort(function (a, b) { return b.value - a.value; });

    A.stats($("summary"), [
      { label: "Categories in use", value: A.int(rows.length), sub: A.int(S.getProducts().length) + " products", tone: "blue" },
      { label: "Top category by revenue", value: byRevenue[0] && byRevenue[0].revenue ? byRevenue[0].name : "None", sub: byRevenue[0] && byRevenue[0].revenue ? A.pct(byRevenue[0].revenue, totalRevenue, 1) + " of revenue" : "", tone: "green" },
      { label: "Largest stock value", value: byValue[0] ? byValue[0].name : "None", sub: byValue[0] ? A.pct(byValue[0].value, totalValue, 1) + " of stock value" : "", tone: "teal" },
      { label: "Total stock value", value: A.money(totalValue), tone: "navy" },
    ], true);

    A.donut($("revenueDonut"), byRevenue.filter(function (c) { return c.revenue > 0; }).map(function (c) {
      return { label: c.name, value: c.revenue, href: A.links.category(c.name, period) };
    }), { center: A.money(totalRevenue), centerLabel: "Revenue", label: "Revenue by category" });

    A.bars($("valueBars"), byValue.map(function (c) {
      return { name: c.name, sub: A.int(c.products) + (c.products === 1 ? " product" : " products"), value: c.value, tone: "c2", href: A.links.category(c.name, period) };
    }));

    A.table($("catTable"), [
      { label: "Category", render: function (c) { return c.name; } },
      { label: "Products", render: function (c) { return A.int(c.products); }, cls: "num" },
      { label: "Units in stock", render: function (c) { return A.int(c.stock); }, cls: "num" },
      { label: "Stock value", render: function (c) { return A.money(c.value); }, cls: "num" },
      { label: "Units sold", render: function (c) { return A.int(c.units); }, cls: "num" },
      { label: "Revenue", render: function (c) { return A.money(c.revenue); }, cls: "num" },
      { label: "Share of revenue", render: function (c) { return A.pct(c.revenue, totalRevenue, 1); }, cls: "num" },
    ], byRevenue, { pageSize: 20, rowHref: function (c) { return A.links.category(c.name, period); } });
  }

  A.tabs($("periodTabs"), period, function (p) { period = p; render(); });
  render();
})();
