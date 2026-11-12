// Stock figures and charts shown above the product list on the Inventory page.
// Needs analytics-lib.js and settings-store.js.
(function () {
  if (typeof Analytics === "undefined" || typeof MynelleStore === "undefined") return;
  var A = Analytics;
  var S = MynelleStore;
  var $ = function (id) { return document.getElementById(id); };
  if (!$("kValueValue")) return;

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

  A.onResize(renderInventory);
  renderInventory();
})();
