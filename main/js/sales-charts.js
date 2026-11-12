// Revenue figures and charts shown above the transaction list on the Sales page.
// They follow the page's own period menu. Needs analytics-lib.js and settings-store.js.
(function () {
  if (typeof Analytics === "undefined" || typeof MynelleStore === "undefined") return;
  var A = Analytics;
  var S = MynelleStore;
  var $ = function (id) { return document.getElementById(id); };
  if (!$("kRevenueValue")) return;

  function currentPeriod() {
    var el = $("periodLabel");
    var t = el ? el.textContent.trim() : "";
    return A.PERIODS.indexOf(t) >= 0 ? t : "This month";
  }

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

  function renderSales() {
    var period = currentPeriod();
    A.syncPeriodLinks(period);
    var sales = S.salesIn(period);
    var cur = A.totals(sales);
    var pr = A.previousRange(period);
    var prev = pr ? A.totals(A.salesBetween(pr.from, pr.to)) : null;
    var label = A.previousLabel(period);
    var b = A.buckets(period, sales);

    kpi("kRevenue", A.money(cur.revenue), vs(cur.revenue, prev && prev.revenue, label), b.map(function (x) { return x.revenue; }));
    kpi("kTxn", A.int(cur.count), vs(cur.count, prev && prev.count, label), b.map(function (x) { return x.count; }));
    kpi("kAvg", A.money(cur.avg), vs(cur.avg, prev && prev.avg, label), b.map(function (x) { return x.count ? x.revenue / x.count : 0; }));

    var pay = {};
    var hours = [];
    var h;
    for (h = 0; h < 24; h++) hours.push({ label: A.hourLabel(h), title: A.hourLabel(h) + " hour", value: 0, href: L.time("hourofday", h, period) });
    var week = [1, 2, 3, 4, 5, 6, 0].map(function (d) { return { label: A.WEEKDAYS[d], title: A.WEEKDAYS[d], value: 0, dow: d, href: L.time("weekday", d, period) }; });
    var sold = {};
    var names = {};
    sales.forEach(function (s) {
      var t = new Date(s.at);
      var total = S.saleTotal(s);
      var k = s.payment || "Cash";
      pay[k] = (pay[k] || 0) + total;
      hours[t.getHours()].value += total;
      week.forEach(function (w) { if (w.dow === t.getDay()) w.value += total; });
      s.items.forEach(function (i) {
        sold[i.productId] = (sold[i.productId] || 0) + i.qty * i.price;
        names[i.productId] = i.name;
      });
    });

    A.donut($("payChart"), Object.keys(pay).sort(function (a, b2) { return pay[b2] - pay[a]; }).map(function (k) {
      return { label: k, value: pay[k], href: L.payment(k, period) };
    }), { center: A.money(cur.revenue), centerLabel: "Revenue", label: "Revenue by payment method", empty: "No sales in this period" });

    var byCat = {};
    var catOf = {};
    S.getProducts().forEach(function (p) { catOf[p.id] = p.category || "Uncategorised"; });
    Object.keys(sold).forEach(function (id) {
      var c = catOf[id] || "Uncategorised";
      byCat[c] = (byCat[c] || 0) + sold[id];
    });
    A.donut($("catDonut"), Object.keys(byCat).sort(function (a, b2) { return byCat[b2] - byCat[a]; }).map(function (c) {
      return { label: c, value: byCat[c], href: L.category(c, period) };
    }), { center: A.money(cur.revenue), centerLabel: "Revenue", label: "Revenue by category", empty: "No sales in this period" });

    A.columns($("hourChart"), hours.slice(6, 23), { height: 210, label: "Revenue by hour of day", empty: "No sales in this period" });
    A.columns($("weekdayChart"), week, { height: 210, label: "Revenue by day of week", empty: "No sales in this period" });
  }

  A.onResize(renderSales);
  renderSales();
  var label = $("periodLabel");
  if (label && window.MutationObserver) new MutationObserver(renderSales).observe(label, { childList: true, characterData: true, subtree: true });
})();
