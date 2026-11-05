// Dedicated page for one category: category-detail.html?c=Antibiotics&period=This+month
(function () {
  var A = Analytics;
  var S = MynelleStore;
  var $ = function (id) { return document.getElementById(id); };
  A.wireBack();

  var cname = A.param("c");
  var period = A.initialPeriod("This month");
  var products = S.getProducts().filter(function (p) { return (p.category || "Uncategorised") === cname; });
  var ids = {};
  products.forEach(function (p) { ids[p.id] = true; });
  if (!cname || !products.length) {
    A.missing("Category not found", "No products are filed under \u201C" + (cname || "(none given)") + "\u201D.", "category-analysis.html", "Category analysis");
    return;
  }
  A.head(cname, A.int(products.length) + (products.length === 1 ? " product" : " products") + " in this category");
  var keep = function (i) { return ids[i.productId]; };

  function render() {
    var sales = S.salesIn(period);
    var mine = A.narrow(sales, keep);
    var all = A.totals(sales);
    var cur = A.totals(mine);
    var pr = A.previousRange(period);
    var prev = pr ? A.totals(A.narrow(A.salesBetween(pr.from, pr.to), keep)) : null;
    var stockValue = products.reduce(function (a, p) { return a + A.stockValue(p); }, 0);

    A.stats($("summary"), [
      { label: "Revenue", value: A.money(cur.revenue), sub: prev ? A.changeText(cur.revenue, prev.revenue, A.previousLabel(period)) : "", tone: "blue" },
      { label: "Share of sales", value: A.pct(cur.revenue, all.revenue, 1), sub: "of " + A.money(all.revenue) + " total", tone: "green" },
      { label: "Units sold", value: A.int(cur.units), sub: A.int(cur.count) + " transactions", tone: "teal" },
      { label: "Stock value", value: A.money(stockValue), sub: A.int(products.length) + " products", tone: "navy" },
    ], true);

    A.line($("trendChart"), A.buckets(period, mine).map(function (x) {
      return { label: x.label, title: x.title, value: x.revenue, href: A.bucketHref(period, x) };
    }), { label: "Category revenue trend", empty: "No sales in this category for this period" });

    var sold = A.soldByProduct(mine);
    var rows = products.map(function (p) {
      var r = sold[p.id] || { units: 0, revenue: 0 };
      return { p: p, units: r.units, revenue: r.revenue };
    }).sort(function (a, b) { return b.revenue - a.revenue; });

    A.bars($("topBars"), rows.filter(function (r) { return r.revenue > 0; }).slice(0, 8).map(function (r) {
      return { name: r.p.name, sub: A.int(r.units) + " sold", value: r.revenue, href: A.links.product(r.p.id, period) };
    }), { empty: "No sales in this period" });

    var pay = {};
    mine.forEach(function (s) {
      var k = s.payment || "Cash";
      pay[k] = (pay[k] || 0) + S.saleTotal(s);
    });
    A.donut($("payChart"), Object.keys(pay).sort(function (a, b) { return pay[b] - pay[a]; }).map(function (k) {
      return { label: k, value: pay[k], href: A.links.payment(k, period) };
    }), { center: A.money(cur.revenue), centerLabel: "Revenue", label: "Category revenue by payment method", empty: "No sales in this period" });

    A.table($("prodTable"), [
      { label: "Product", render: function (r) { return r.p.name; } },
      { label: "Units sold", render: function (r) { return A.int(r.units); }, cls: "num" },
      { label: "Revenue", render: function (r) { return A.money(r.revenue); }, cls: "num" },
      { label: "In stock", render: function (r) { return S.formatQty(r.p.stock, r.p.unit); }, cls: "num" },
      { label: "Stock value", render: function (r) { return A.money(A.stockValue(r.p)); }, cls: "num" },
    ], rows, { pageSize: 15, rowHref: function (r) { return A.links.product(r.p.id, period); } });

    var withCat = sales.filter(function (s) { return s.items.some(keep); });
    A.txnTable($("txnTable"), A.newest(withCat), {
      amountLabel: "This category",
      amount: function (s) { return s.items.filter(keep).reduce(function (a, i) { return a + i.qty * i.price; }, 0); },
      empty: "No transactions in this category for this period",
    });
  }

  A.tabs($("periodTabs"), period, function (x) { period = x; render(); });
  A.onResize(render);
  render();
})();
