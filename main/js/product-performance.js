(function () {
  var A = Analytics;
  var S = MynelleStore;
  var $ = function (id) { return document.getElementById(id); };
  var period = A.initialPeriod("This month");

  function periodDays(sales) {
    var start = period === "All time" && sales.length
      ? new Date(Math.min.apply(null, sales.map(function (s) { return new Date(s.at); })))
      : S.periodStart(period);
    return Math.max(1, (new Date() - start) / 86400000);
  }

  function render() {
    var sales = S.salesIn(period);
    var days = periodDays(sales);
    var sold = A.soldByProduct(sales);
    var products = S.getProducts();
    var rows = products.map(function (p) {
      var r = sold[p.id] || { units: 0, revenue: 0 };
      var perDay = r.units / days;
      return {
        p: p, units: r.units, revenue: r.revenue, perDay: perDay,
        cover: perDay > 0 ? Number(p.stock) / perDay : null,
      };
    });
    var totalRevenue = rows.reduce(function (a, r) { return a + r.revenue; }, 0);
    var totalUnits = rows.reduce(function (a, r) { return a + r.units; }, 0);
    var moving = rows.filter(function (r) { return r.units > 0; });
    var byRevenue = moving.slice().sort(function (a, b) { return b.revenue - a.revenue; });
    var noSales = rows.filter(function (r) { return r.units === 0; });

    A.stats($("summary"), [
      { label: "Products sold", value: A.int(moving.length), sub: "of " + A.int(products.length) + " in inventory", tone: "blue" },
      { label: "Best seller", value: byRevenue[0] ? byRevenue[0].p.name : "None", sub: byRevenue[0] ? A.money(byRevenue[0].revenue) + " revenue" : "", tone: "green" },
      { label: "Units sold", value: A.int(totalUnits), sub: A.money(totalRevenue) + " revenue", tone: "teal" },
      { label: "No sales", value: A.int(noSales.length), sub: A.money(noSales.reduce(function (a, r) { return a + A.stockValue(r.p); }, 0)) + " in stock", tone: "maroon" },
    ], true);

    A.bars($("topRevenue"), byRevenue.slice(0, 10).map(function (r) {
      return { name: r.p.name, sub: S.formatQty(r.units, r.p.unit) + " sold", value: r.revenue, href: A.links.product(r.p.id, period) };
    }));
    A.bars($("topUnits"), moving.slice().sort(function (a, b) { return b.units - a.units; }).slice(0, 10).map(function (r) {
      return { name: r.p.name, sub: A.money(r.revenue) + " revenue", value: r.units, display: A.int(r.units), tone: "c2", href: A.links.product(r.p.id, period) };
    }));

    var slow = moving.slice().sort(function (a, b) { return a.revenue - b.revenue; }).slice(0, 5)
      .concat(noSales);
    A.table($("slowTable"), [
      { label: "Product", render: function (r) { return r.p.name; } },
      { label: "Category", render: function (r) { return r.p.category || ""; }, cls: "muted" },
      { label: "Units sold", render: function (r) { return A.int(r.units); }, cls: "num" },
      { label: "In stock", render: function (r) { return S.formatQty(r.p.stock, r.p.unit); }, cls: "num" },
      { label: "Stock value", render: function (r) { return A.money(A.stockValue(r.p)); }, cls: "num" },
      { label: "Status", html: true, render: function (r) { return r.units === 0 ? '<span class="tag red">No sales</span>' : '<span class="tag gold">Slow</span>'; } },
    ], slow, { empty: "Every product sold in this period", rowHref: function (r) { return A.links.product(r.p.id, period); } });

    A.table($("allTable"), [
      { label: "Product", render: function (r) { return r.p.name; } },
      { label: "Units sold", render: function (r) { return A.int(r.units); }, cls: "num" },
      { label: "Revenue", render: function (r) { return A.money(r.revenue); }, cls: "num" },
      { label: "Share of revenue", render: function (r) { return A.pct(r.revenue, totalRevenue, 1); }, cls: "num" },
      { label: "Sold per day", render: function (r) { return r.perDay.toFixed(1); }, cls: "num" },
      { label: "In stock", render: function (r) { return S.formatQty(r.p.stock, r.p.unit); }, cls: "num" },
      { label: "Days of stock left", render: function (r) { return r.cover === null ? "\u2014" : Math.round(r.cover); }, cls: "num" },
    ], rows.slice().sort(function (a, b) { return b.revenue - a.revenue; }), { pageSize: 15, rowHref: function (r) { return A.links.product(r.p.id, period); } });
  }

  A.tabs($("periodTabs"), period, function (p) { period = p; render(); });
  render();
})();
