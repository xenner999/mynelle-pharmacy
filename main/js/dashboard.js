// Inventory and sales figures for the stat cards, recent sales and stock charts.
(function () {
  if (typeof MynelleStore === "undefined") return;
  var products = MynelleStore.getProducts();
  var settings = MynelleStore.getSettings();

  var totalEl = document.getElementById("statTotalProducts");
  var lowEl = document.getElementById("statLowStock");
  var expEl = document.getElementById("statExpiring");
  var expSubEl = document.getElementById("statExpiringSub");

  if (totalEl) totalEl.textContent = String(products.length);
  if (lowEl) {
    lowEl.textContent = String(
      products.filter(MynelleStore.isLowStock).length
    );
  }
  if (expEl) {
    expEl.textContent = String(
      products.filter(MynelleStore.isExpiringSoon).length
    );
  }
  if (expSubEl) {
    expSubEl.textContent =
      "Expiring within " + MynelleStore.windowLabel(settings.inventory.expiryWindowDays);
  }

  // ---- Stock overview: two donuts ----
  // Chart 1 "Stock Health" — every product bucketed into exactly one of
  // Healthy / Low / Out of stock, so the ring always sums to the total
  // product count (shown in the center).
  // Chart 2 "Shelf Life" — every product bucketed into Safe / Expiring
  // soon; the ring also sums to the total, but the center shows the
  // expiring count instead, since that's the number worth surfacing.
  function drawDonut(wrapEl, segments, total, centerValue, centerLabel) {
    if (!wrapEl) return;
    var r = 50;
    var c = 2 * Math.PI * r;
    var offset = 0;
    var circles = segments
      .map(function (seg) {
        if (seg.value <= 0 || total <= 0) return "";
        var len = (seg.value / total) * c;
        var circle =
          '<circle cx="66" cy="66" r="' +
          r +
          '" fill="none" stroke="' +
          seg.color +
          '" stroke-width="17" stroke-dasharray="' +
          len +
          " " +
          (c - len) +
          '" stroke-dashoffset="' +
          -offset +
          '" stroke-linecap="butt" transform="rotate(-90 66 66)" />';
        offset += len;
        return circle;
      })
      .join("");

    wrapEl.innerHTML =
      '<svg viewBox="0 0 132 132">' +
      '<circle cx="66" cy="66" r="' +
      r +
      '" fill="none" stroke="var(--bg)" stroke-width="17" />' +
      circles +
      '<text x="66" y="63" text-anchor="middle" font-size="22" font-weight="700" fill="var(--text)">' +
      centerValue +
      "</text>" +
      '<text x="66" y="80" text-anchor="middle" font-size="9" fill="var(--text-muted)">' +
      centerLabel +
      "</text>" +
      "</svg>";
  }

  var outOfStockCount = products.filter(function (p) {
    return Number(p.stock) === 0;
  }).length;
  var lowOnlyCount = products.filter(function (p) {
    return Number(p.stock) !== 0 && MynelleStore.isLowStock(p);
  }).length;
  var healthyCount = products.length - outOfStockCount - lowOnlyCount;

  var expiringTotal = products.filter(MynelleStore.isExpiringSoon).length;
  var safeCount = products.length - expiringTotal;

  var legendHealthy = document.getElementById("legendHealthy");
  var legendLowStock = document.getElementById("legendLowStock");
  var legendOutStock = document.getElementById("legendOutStock");
  var legendSafe = document.getElementById("legendSafe");
  var legendExpiringSoon = document.getElementById("legendExpiringSoon");

  if (legendHealthy) legendHealthy.textContent = String(healthyCount);
  if (legendLowStock) legendLowStock.textContent = String(lowOnlyCount);
  if (legendOutStock) legendOutStock.textContent = String(outOfStockCount);
  if (legendSafe) legendSafe.textContent = String(safeCount);
  if (legendExpiringSoon) legendExpiringSoon.textContent = String(expiringTotal);

  drawDonut(
    document.getElementById("healthDonutWrap"),
    [
      { value: healthyCount, color: "#22a06b" },
      { value: lowOnlyCount, color: "#d9640f" },
      { value: outOfStockCount, color: "#d90416" },
    ],
    products.length,
    products.length,
    "Total Products"
  );

  drawDonut(
    document.getElementById("shelfDonutWrap"),
    [
      { value: safeCount, color: "#22a06b" },
      { value: expiringTotal, color: "#0511f2" },
    ],
    products.length,
    expiringTotal,
    "Expiring"
  );
})();

// ---- Sales: today's total and the latest transactions ----
(function () {
  if (typeof MynelleStore === "undefined") return;

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  var today = MynelleStore.salesIn("Today");
  var todayTotal = today.reduce(function (sum, s) {
    return sum + MynelleStore.saleTotal(s);
  }, 0);
  var totalEl = document.getElementById("statTodaySales");
  var subEl = document.getElementById("statTodaySalesSub");
  if (totalEl) totalEl.textContent = MynelleStore.formatCurrency(todayTotal);
  if (subEl) {
    subEl.textContent =
      today.length + (today.length === 1 ? " transaction" : " transactions");
  }

  var wrap = document.getElementById("recentSales");
  if (!wrap) return;
  var head = wrap.querySelector(".table-head");
  var recent = MynelleStore.getSales()
    .slice()
    .sort(function (a, b) {
      return new Date(b.at) - new Date(a.at);
    })
    .slice(0, 6);

  if (recent.length === 0) {
    var empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = '<p class="title">No sales recorded yet</p>';
    wrap.appendChild(empty);
    return;
  }

  recent.forEach(function (s) {
    var first = s.items[0] ? s.items[0].name : "";
    var extra = s.items.length - 1;
    var d = new Date(s.at);
    var h = d.getHours();
    var time =
      (h % 12 || 12) + ":" + String(d.getMinutes()).padStart(2, "0") + " " + (h >= 12 ? "PM" : "AM");
    var isToday = d.toDateString() === new Date().toDateString();
    var row = document.createElement("div");
    row.className = "table-row";
    row.style.cursor = "pointer";
    row.title = "View transaction details";
    row.addEventListener("click", function () { SalesView.openDetails(s); });
    row.innerHTML =
      "<span>" + esc(first) + (extra > 0 ? " +" + extra + " more" : "") + "</span>" +
      "<span>" + MynelleStore.saleQty(s) + "</span>" +
      "<span>" + esc(MynelleStore.formatCurrency(MynelleStore.saleTotal(s))) + "</span>" +
      "<span>" + (isToday ? time : esc(MynelleStore.formatDateTime(s.at).split(",")[0])) + "</span>";
    wrap.appendChild(row);
  });
})();

// ---- Sales trend, top products and insights (shared chart + insight code) ----
(function () {
  if (typeof MynelleStore === "undefined" || typeof Analytics === "undefined" || typeof Insights === "undefined") return;
  var A = Analytics;
  var S = MynelleStore;
  var $ = function (id) { return document.getElementById(id); };
  var period = "This week";
  var TREND_PERIODS = ["Today", "This week", "This month", "This year"];

  function renderSales() {
    var sales = S.salesIn(period);
    var b = A.buckets(period, sales);
    $("trendTitle").textContent = period === "Today" ? "Revenue by hour" : period === "This year" ? "Revenue by month" : "Revenue by day";
    A.line($("trendChart"), b.map(function (x) {
      return { label: x.label, title: x.title, value: x.revenue, href: A.bucketHref(period, x) };
    }), { label: "Revenue trend", empty: "No sales in this period" });

    var sold = {}, names = {};
    sales.forEach(function (s) {
      s.items.forEach(function (i) {
        sold[i.productId] = (sold[i.productId] || 0) + i.qty * i.price;
        names[i.productId] = i.name;
      });
    });
    A.bars($("topBars"), Object.keys(sold).sort(function (a, c) { return sold[c] - sold[a]; }).slice(0, 6).map(function (id) {
      return { name: names[id], value: sold[id], href: A.links.product(id, period) };
    }), { empty: "No sales in this period" });
    $("trendLink").href = "sales-analysis.html?period=" + encodeURIComponent(period);
    $("topLink").href = "product-performance.html?period=" + encodeURIComponent(period);
  }

  function renderInsights() {
    Insights.actions($("insActions"), 6);
    Insights.forecast($("insForecast"));
  }

  function render() { renderSales(); renderInsights(); }

  A.tabs($("periodTabs"), period, function (p) { period = p; renderSales(); }, TREND_PERIODS);
  A.onResize(render);
  render();
})();

// Keep the dashboard in step with sales rung up at the POS (another tab/window).
window.addEventListener("storage", function (e) {
  if (e.key === MynelleStore.PRODUCTS_KEY || e.key === MynelleStore.SALES_KEY) {
    window.location.reload();
  }
});
