// Dedicated stock lists.
//   stock-detail.html?view=healthy|low|out        products in that stock state
//   stock-detail.html?view=batches&bucket=0-30d    batches in an expiry bucket
(function () {
  var A = Analytics;
  var S = MynelleStore;
  var $ = function (id) { return document.getElementById(id); };
  A.wireBack();

  var view = A.param("view");
  var bucket = A.param("bucket");
  var products = S.getProducts();
  var BUCKETS = {
    "Expired": function (d) { return d < 0; },
    "0-30d": function (d) { return d >= 0 && d <= 30; },
    "31-60d": function (d) { return d > 30 && d <= 60; },
    "61-90d": function (d) { return d > 60 && d <= 90; },
    "91-180d": function (d) { return d > 90 && d <= 180; },
    "181-365d": function (d) { return d > 180 && d <= 365; },
    "1y+": function (d) { return d > 365; },
  };
  var BUCKET_NAME = {
    "Expired": "Expired batches", "0-30d": "Batches expiring in 0\u201330 days", "31-60d": "Batches expiring in 31\u201360 days",
    "61-90d": "Batches expiring in 61\u201390 days", "91-180d": "Batches expiring in 91\u2013180 days",
    "181-365d": "Batches expiring in 181\u2013365 days", "1y+": "Batches expiring in over a year",
  };

  if (view === "healthy" || view === "low" || view === "out") {
    var names = { healthy: "Healthy stock", low: "Low stock", out: "Out of stock" };
    var rows = products.filter(function (p) {
      var stock = Number(p.stock);
      if (view === "out") return stock === 0;
      if (view === "low") return stock > 0 && S.isLowStock(p);
      return stock > 0 && !S.isLowStock(p);
    }).sort(function (a, b) {
      return (Number(a.stock) / S.criticalLevelFor(a)) - (Number(b.stock) / S.criticalLevelFor(b));
    });
    A.head(names[view], A.int(rows.length) + " of " + A.int(products.length) + " products");
    A.stats($("summary"), [
      { label: "Products", value: A.int(rows.length), sub: A.pct(rows.length, products.length, 1) + " of inventory", tone: view === "out" ? "maroon" : "blue" },
      { label: "Stock value", value: A.money(rows.reduce(function (a, p) { return a + A.stockValue(p); }, 0)), sub: "In this group", tone: "green" },
      { label: "Categories", value: A.int(new Set(rows.map(function (p) { return p.category || "Uncategorised"; })).size), sub: "Represented", tone: "teal" },
    ]);
    $("listTitle").textContent = names[view];
    A.table($("listTable"), [
      { label: "Product", render: function (p) { return p.name; } },
      { label: "Category", render: function (p) { return p.category || "Uncategorised"; }, cls: "muted" },
      { label: "In stock", render: function (p) { return S.formatQty(p.stock, p.unit); }, cls: "num" },
      { label: "Critical level", render: function (p) { return S.formatQty(S.criticalLevelFor(p), p.unit); }, cls: "num" },
      { label: "Stock value", render: function (p) { return A.money(A.stockValue(p)); }, cls: "num" },
    ], rows, { pageSize: 20, empty: "No products in this group", rowHref: function (p) { return A.links.product(p.id); } });
    return;
  }

  if (view === "batches" && BUCKETS[bucket]) {
    var list = [];
    products.forEach(function (p) {
      p.batches.forEach(function (b) {
        var d = A.daysUntil(b.expiry);
        if (d !== null && BUCKETS[bucket](d)) list.push({ p: p, b: b, d: d, v: b.qty * Number(p.price) });
      });
    });
    list.sort(function (a, b) { return a.d - b.d; });
    A.head(BUCKET_NAME[bucket], A.int(list.length) + (list.length === 1 ? " batch" : " batches"));
    A.stats($("summary"), [
      { label: "Batches", value: A.int(list.length), sub: BUCKET_NAME[bucket], tone: bucket === "Expired" ? "maroon" : "blue" },
      { label: "Stock value", value: A.money(list.reduce(function (a, r) { return a + r.v; }, 0)), sub: "In these batches", tone: "green" },
      { label: "Products", value: A.int(new Set(list.map(function (r) { return r.p.id; })).size), sub: "Affected", tone: "teal" },
    ]);
    $("listTitle").textContent = BUCKET_NAME[bucket];
    A.table($("listTable"), [
      { label: "Product", render: function (r) { return r.p.name; } },
      { label: "Lot", render: function (r) { return r.b.lot || "\u2014"; }, cls: "muted" },
      { label: "Expiry", render: function (r) { return r.b.expiry; }, cls: "muted" },
      { label: "Days left", render: function (r) { return r.d < 0 ? Math.abs(r.d) + " days ago" : String(r.d); }, cls: "num" },
      { label: "Qty", render: function (r) { return S.formatQty(r.b.qty, r.p.unit); }, cls: "num" },
      { label: "Value", render: function (r) { return A.money(r.v); }, cls: "num" },
    ], list, { pageSize: 20, empty: "No batches in this group", rowHref: function (r) { return A.links.product(r.p.id); } });
    return;
  }

  A.missing("List not found", "That stock list could not be read from the link.", "analytics.html", "Back to analytics");
})();
