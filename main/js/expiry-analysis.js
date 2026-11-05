(function () {
  var A = Analytics;
  var S = MynelleStore;
  var $ = function (id) { return document.getElementById(id); };

  var KEYS = ["Expired", "0-30d", "31-60d", "61-90d", "91-180d", "181-365d", "1y+"];
  var BUCKETS = [
    { label: "Expired", test: function (d) { return d < 0; }, tone: "c4" },
    { label: "0 to 30 days", test: function (d) { return d >= 0 && d <= 30; }, tone: "c3" },
    { label: "31 to 60 days", test: function (d) { return d > 30 && d <= 60; }, tone: "c3" },
    { label: "61 to 90 days", test: function (d) { return d > 60 && d <= 90; }, tone: "c2" },
    { label: "91 to 180 days", test: function (d) { return d > 90 && d <= 180; }, tone: "c2" },
    { label: "181 to 365 days", test: function (d) { return d > 180 && d <= 365; }, tone: "c5" },
    { label: "Over a year", test: function (d) { return d > 365; }, tone: "c5" },
  ];

  // One row per batch, since each batch has its own expiry date.
  var batches = [];
  S.getProducts().forEach(function (p) {
    p.batches.forEach(function (b) {
      batches.push({ p: p, b: b, days: A.daysUntil(b.expiry), value: b.qty * Number(p.price) });
    });
  });
  var dated = batches.filter(function (r) { return r.days !== null; });
  var noExpiry = batches.length - dated.length;
  var totalValue = batches.reduce(function (a, r) { return a + r.value; }, 0);

  var buckets = BUCKETS.map(function (b) {
    var items = dated.filter(function (r) { return b.test(r.days); });
    return {
      label: b.label, tone: b.tone, items: items, key: KEYS[BUCKETS.indexOf(b)],
      count: items.length,
      value: items.reduce(function (a, r) { return a + r.value; }, 0),
    };
  });
  var expired = buckets[0];
  var soon = buckets[1];
  var atRisk = expired.value + soon.value;

  function plural(n, word) {
    return A.int(n) + " " + word + (n === 1 ? "" : "es");
  }

  A.stats($("summary"), [
    { label: "Expired", value: plural(expired.count, "batch"), sub: A.money(expired.value) + " in stock", tone: "maroon" },
    { label: "Expiring within 30 days", value: plural(soon.count, "batch"), sub: A.money(soon.value) + " in stock", tone: "gold" },
    { label: "Value at risk", value: A.money(atRisk), sub: A.pct(atRisk, totalValue, 1) + " of stock value", tone: "red" },
    { label: "No expiry date", value: plural(noExpiry, "batch"), tone: "navy" },
  ], true);

  function countChart() {
    A.columns($("countChart"), buckets.map(function (b) {
      return { label: b.label.replace(" days", "d").replace("Over a year", "1y+"), title: b.label, value: b.count, tone: b.tone, href: A.links.stock("batches", b.key) };
    }), { height: 230, format: function (v) { return String(Math.round(v)); }, tip: function (v) { return v + (v === 1 ? " batch" : " batches"); }, label: "Batches by time to expiry", empty: "No batches with expiry dates" });
  }
  countChart();

  A.bars($("valueBars"), buckets.map(function (b) {
    return { name: b.label, sub: A.int(b.count) + (b.count === 1 ? " batch" : " batches"), value: b.value, tone: b.tone, href: A.links.stock("batches", b.key) };
  }), { empty: "No batches with expiry dates" });

  var windowDays = Number(MynelleStore.getSettings().inventory.expiryWindowDays) || 180;
  var watch = dated.filter(function (r) { return r.days <= windowDays; }).sort(function (a, b) { return a.days - b.days; });
  A.table($("watchTable"), [
    { label: "Product", render: function (r) { return r.p.name; } },
    { label: "Lot", render: function (r) { return r.b.lot || "\u2014"; }, cls: "muted" },
    { label: "Expiry date", render: function (r) { return S.formatDateTime(r.b.expiry + "T12:00:00").split(",")[0]; }, cls: "muted" },
    { label: "Days left", render: function (r) { return r.days < 0 ? "Expired " + Math.abs(r.days) + "d ago" : r.days === 0 ? "Today" : r.days; }, cls: "num" },
    { label: "Quantity", render: function (r) { return S.formatQty(r.b.qty, r.p.unit); }, cls: "num" },
    { label: "Stock value", render: function (r) { return A.money(r.value); }, cls: "num" },
    { label: "Status", html: true, render: function (r) { return r.days < 0 ? '<span class="tag red">Expired</span>' : r.days <= S.expiryWindowFor(r.p) ? '<span class="tag gold">Expiring</span>' : '<span class="tag">Watch</span>'; } },
  ], watch, { pageSize: 15, rowHref: function (r) { return A.links.product(r.p.id); }, empty: "Nothing expires within " + MynelleStore.windowLabel(windowDays) });

  A.onResize(countChart);
})();
