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
      { value: healthyCount, color: "#4f83d6" },
      { value: lowOnlyCount, color: "#1b2447" },
      { value: outOfStockCount, color: "#b3323f" },
    ],
    products.length,
    products.length,
    "Total Products"
  );

  drawDonut(
    document.getElementById("shelfDonutWrap"),
    [
      { value: safeCount, color: "#4f83d6" },
      { value: expiringTotal, color: "#b4740e" },
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

// Keep the dashboard in step with sales rung up at the POS (another tab/window).
window.addEventListener("storage", function (e) {
  if (e.key === MynelleStore.PRODUCTS_KEY || e.key === MynelleStore.SALES_KEY) {
    window.location.reload();
  }
});
