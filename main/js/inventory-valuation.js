(function () {
  var A = Analytics;
  var S = MynelleStore;
  var $ = function (id) { return document.getElementById(id); };

  var products = S.getProducts();
  var total = products.reduce(function (a, p) { return a + A.stockValue(p); }, 0);
  var units = products.reduce(function (a, p) { return a + Number(p.stock); }, 0);
  var cats = {};
  products.forEach(function (p) {
    var k = p.category || "Uncategorised";
    var c = cats[k] || (cats[k] = { name: k, value: 0, products: 0 });
    c.value += A.stockValue(p);
    c.products += 1;
  });
  var catRows = Object.keys(cats).map(function (k) { return cats[k]; }).sort(function (a, b) { return b.value - a.value; });
  var ranked = products.slice().sort(function (a, b) { return A.stockValue(b) - A.stockValue(a); });

  var top10 = ranked.slice(0, Math.max(1, Math.ceil(ranked.length * 0.1)));
  var top10Value = top10.reduce(function (a, p) { return a + A.stockValue(p); }, 0);

  A.stats($("summary"), [
    { label: "Total stock value", value: A.money(total), sub: "At selling price", tone: "blue" },
    { label: "Units on hand", value: A.int(units), sub: A.int(products.length) + " products", tone: "green" },
    { label: "Average per product", value: A.money(products.length ? total / products.length : 0), tone: "teal" },
    { label: "Top 10% of products", value: A.pct(top10Value, total, 0), sub: "of total stock value", tone: "navy" },
  ], true);

  A.donut($("catDonut"), catRows.map(function (c) { return { label: c.name, value: c.value, href: A.links.category(c.name) }; }),
    { center: A.money(total), centerLabel: "Stock value", label: "Stock value by category", empty: "No products in inventory" });

  A.bars($("topBars"), ranked.slice(0, 10).map(function (p) {
    return { name: p.name, sub: S.formatQty(p.stock, p.unit) + " on hand", value: A.stockValue(p), tone: "c2", href: A.links.product(p.id) };
  }), { empty: "No products in inventory" });

  A.table($("valueTable"), [
    { label: "Product", render: function (p) { return p.name; } },
    { label: "Category", render: function (p) { return p.category || ""; }, cls: "muted" },
    { label: "In stock", render: function (p) { return S.formatQty(p.stock, p.unit); }, cls: "num" },
    { label: "Unit price", render: function (p) { return A.money(p.price); }, cls: "num" },
    { label: "Stock value", render: function (p) { return A.money(A.stockValue(p)); }, cls: "num" },
    { label: "Share", render: function (p) { return A.pct(A.stockValue(p), total, 1); }, cls: "num" },
  ], ranked, { pageSize: 15, empty: "No products in inventory", rowHref: function (p) { return A.links.product(p.id); } });

})();
