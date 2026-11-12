(function () {
  var A = Analytics;
  var S = MynelleStore;
  var $ = function (id) { return document.getElementById(id); };
  var WINDOW_DAYS = 30;
  var TARGET_DAYS = 30;

  var since = new Date(Date.now() - WINDOW_DAYS * 86400000);
  var sold = A.soldByProduct(A.salesBetween(since, new Date()));

  var rows = S.getProducts().map(function (p) {
    var units = (sold[p.id] || { units: 0 }).units;
    var perDay = units / WINDOW_DAYS;
    var stock = Number(p.stock);
    var level = stock === 0 ? "out" : S.isLowStock(p) ? "low" : "healthy";
    var critical = A.criticalLevel(p);
    var need = Math.max(Math.ceil(perDay * TARGET_DAYS - stock), critical * 2 - stock, 0);
    return { p: p, stock: stock, level: level, perDay: perDay, critical: critical,
      cover: perDay > 0 ? stock / perDay : null, order: need };
  });

  var count = function (l) { return rows.filter(function (r) { return r.level === l; }).length; };
  var healthy = count("healthy");
  var low = count("low");
  var out = count("out");

  A.stats($("summary"), [
    { label: "Healthy stock", value: A.int(healthy), sub: A.pct(healthy, rows.length, 0) + " of products", tone: "green" },
    { label: "Low stock", value: A.int(low), sub: A.pct(low, rows.length, 0) + " of products", tone: "gold" },
    { label: "Out of stock", value: A.int(out), sub: A.pct(out, rows.length, 0) + " of products", tone: "red" },
    { label: "Products tracked", value: A.int(rows.length), tone: "navy" },
  ], true);

  A.donut($("levelDonut"), [
    { label: "Healthy", value: healthy, display: A.int(healthy), href: A.links.stock("healthy") },
    { label: "Low stock", value: low, display: A.int(low), href: A.links.stock("low") },
    { label: "Out of stock", value: out, display: A.int(out), href: A.links.stock("out") },
  ], { center: A.int(rows.length), centerLabel: "Products", label: "Stock level distribution", empty: "No products in inventory" });

  var fastest = rows.filter(function (r) { return r.cover !== null; })
    .sort(function (a, b) { return a.cover - b.cover; }).slice(0, 10);
  A.bars($("coverBars"), fastest.map(function (r) {
    return { name: r.p.name, href: A.links.product(r.p.id), sub: r.perDay.toFixed(1) + " sold per day", value: Math.max(0, 100 - r.cover) , display: r.stock === 0 ? "Out" : Math.round(r.cover) + " days", tone: r.cover < 7 ? "c4" : r.cover < 14 ? "c3" : "c2" };
  }), { empty: "No sales in the last " + WINDOW_DAYS + " days" });

  var reorder = rows.filter(function (r) { return r.order > 0 && (r.level !== "healthy" || (r.cover !== null && r.cover < 14)); })
    .sort(function (a, b) {
      var rank = { out: 0, low: 1, healthy: 2 };
      return rank[a.level] - rank[b.level] || (a.cover === null ? 9999 : a.cover) - (b.cover === null ? 9999 : b.cover);
    });
  A.table($("reorderTable"), [
    { label: "Product", render: function (r) { return r.p.name; } },
    { label: "In stock", render: function (r) { return S.formatQty(r.stock, r.p.unit); }, cls: "num" },
    { label: "Critical level", render: function (r) { return A.int(r.critical); }, cls: "num" },
    { label: "Sold per day", render: function (r) { return r.perDay.toFixed(1); }, cls: "num" },
    { label: "Days left", render: function (r) { return r.cover === null ? "\u2014" : Math.round(r.cover); }, cls: "num" },
    { label: "Suggested order", render: function (r) { return S.formatQty(r.order, r.p.unit); }, cls: "num" },
    { label: "Action", html: true, render: function (r) { return '<a class="an-rowlink" href="' + Orders.restockHref(r.p.id) + '">' + Orders.restockLabel(r.p.id) + "</a>"; } },
    { label: "Status", html: true, render: function (r) { return r.level === "out" ? '<span class="tag red">Out</span>' : r.level === "low" ? '<span class="tag gold">Low</span>' : '<span class="tag">Running down</span>'; } },
  ], reorder, { pageSize: 15, empty: "No products need reordering", rowHref: function (r) { return A.links.product(r.p.id); } });
})();
