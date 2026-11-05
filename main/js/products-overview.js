document.getElementById("sideNav").addEventListener("click", function (e) {
  var btn = e.target.closest(".nav-item");
  if (!btn || btn.tagName === "A") return;
});

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  });
}

var categoryChips = document.getElementById("categoryChips");
var overviewCount = document.getElementById("overviewCount");
var productGrid = document.getElementById("productGrid");
var overviewEmpty = document.getElementById("overviewEmpty");
var overviewEmptyTitle = document.getElementById("overviewEmptyTitle");
var overviewEmptySub = document.getElementById("overviewEmptySub");
var searchInput = document.getElementById("searchInput");

var legendHealthy = document.getElementById("legendHealthy");
var legendLowStock = document.getElementById("legendLowStock");
var legendOutStock = document.getElementById("legendOutStock");
var legendSafe = document.getElementById("legendSafe");
var legendExpiringSoon = document.getElementById("legendExpiringSoon");
var categoryLegend = document.getElementById("categoryLegend");

var CATEGORY_COLORS = ["#2c4a8c", "#0e7c86", "#b4740e", "#7a2036", "#94a3b8"];

function drawDonut(wrapEl, segments, total, centerValue, centerLabel) {
  if (!wrapEl) return;
  var r = 58;
  var c = 2 * Math.PI * r;
  var offset = 0;
  var circles = segments
    .map(function (seg) {
      if (seg.value <= 0 || total <= 0) return "";
      var len = (seg.value / total) * c;
      var circle =
        '<circle cx="75" cy="75" r="' +
        r +
        '" fill="none" stroke="' +
        seg.color +
        '" stroke-width="18" stroke-dasharray="' +
        len +
        " " +
        (c - len) +
        '" stroke-dashoffset="' +
        -offset +
        '" transform="rotate(-90 75 75)" />';
      offset += len;
      return circle;
    })
    .join("");

  wrapEl.innerHTML =
    '<svg viewBox="0 0 150 150">' +
    '<circle cx="75" cy="75" r="' +
    r +
    '" fill="none" stroke="var(--bg)" stroke-width="18" />' +
    circles +
    '<text x="75" y="71" text-anchor="middle" font-size="24" font-weight="700" fill="var(--text)">' +
    centerValue +
    "</text>" +
    '<text x="75" y="89" text-anchor="middle" font-size="9.5" fill="var(--text-muted)">' +
    centerLabel +
    "</text>" +
    "</svg>";
}

var state = { category: "all", query: "" };

function statusFor(p) {
  var stock = Number(p.stock) || 0;
  if (stock === 0) return { key: "out-of-stock", label: "Out of stock" };
  if (typeof MynelleStore !== "undefined" && MynelleStore.isLowStock(p)) {
    return { key: "low-stock", label: "Low stock" };
  }
  return { key: "in-stock", label: "In stock" };
}

function productCard(p) {
  var status = statusFor(p);
  return (
    '<div class="product-card">' +
    '<span class="cat-tag">' +
    esc(p.category || "Uncategorized") +
    "</span>" +
    '<div class="name">' +
    esc(p.name) +
    "</div>" +
    (p.brand ? '<div class="brand">' + esc(p.brand) + "</div>" : "") +
    '<div class="row">' +
    '<span class="price">' +
    esc(
      typeof MynelleStore !== "undefined"
        ? MynelleStore.formatCurrency(p.price)
        : p.price
    ) +
    "</span>" +
    '<span class="status-pill ' +
    status.key +
    '">' +
    status.label +
    "</span>" +
    "</div>" +
    "</div>"
  );
}

function render() {
  var all = typeof MynelleStore !== "undefined" ? MynelleStore.getProducts() : [];

  // ---- Donut 1: Stock Health ----
  var outCount = all.filter(function (p) {
    return Number(p.stock) === 0;
  }).length;
  var lowCount = all.filter(function (p) {
    return Number(p.stock) !== 0 && MynelleStore.isLowStock(p);
  }).length;
  var healthyCount = all.length - outCount - lowCount;

  legendHealthy.textContent = String(healthyCount);
  legendLowStock.textContent = String(lowCount);
  legendOutStock.textContent = String(outCount);

  drawDonut(
    document.getElementById("healthDonutWrap"),
    [
      { value: healthyCount, color: "#4f83d6" },
      { value: lowCount, color: "#1b2447" },
      { value: outCount, color: "#b3323f" },
    ],
    all.length,
    all.length,
    "Total Products"
  );

  // ---- Donut 2: Shelf Life ----
  var expiringCount =
    typeof MynelleStore !== "undefined"
      ? all.filter(MynelleStore.isExpiringSoon).length
      : 0;
  var safeCount = all.length - expiringCount;

  legendSafe.textContent = String(safeCount);
  legendExpiringSoon.textContent = String(expiringCount);

  drawDonut(
    document.getElementById("shelfDonutWrap"),
    [
      { value: safeCount, color: "#4f83d6" },
      { value: expiringCount, color: "#b4740e" },
    ],
    all.length,
    expiringCount,
    "Expiring"
  );

  // ---- Donut 3: Category Mix (top 4 + Others) ----
  var counts = {};
  all.forEach(function (p) {
    var cat = p.category || "Uncategorized";
    counts[cat] = (counts[cat] || 0) + 1;
  });
  var sorted = Object.keys(counts).sort(function (a, b) {
    return counts[b] - counts[a];
  });
  var top = sorted.slice(0, 4);
  var othersCount = sorted.slice(4).reduce(function (sum, c) {
    return sum + counts[c];
  }, 0);

  var catSegments = top.map(function (name, i) {
    return { label: name, value: counts[name], color: CATEGORY_COLORS[i] };
  });
  if (othersCount > 0) {
    catSegments.push({
      label: "Others",
      value: othersCount,
      color: CATEGORY_COLORS[4],
    });
  }

  drawDonut(
    document.getElementById("categoryDonutWrap"),
    catSegments,
    all.length,
    sorted.length,
    "Categories"
  );

  categoryLegend.innerHTML = catSegments.length
    ? catSegments
        .map(function (seg) {
          return (
            '<div class="legend-row"><span class="dot" style="background:' +
            seg.color +
            '"></span><span class="legend-label">' +
            esc(seg.label) +
            '</span><span class="legend-count">' +
            seg.value +
            "</span></div>"
          );
        })
        .join("")
    : '<div class="legend-row"><span class="legend-label">No products yet.</span></div>';

  // ---- Category chips ----
  var catNames = Object.keys(counts).sort();
  categoryChips.innerHTML =
    '<button class="chip' +
    (state.category === "all" ? " active" : "") +
    '" data-cat="all" type="button">All categories</button>' +
    catNames
      .map(function (c) {
        return (
          '<button class="chip' +
          (state.category === c ? " active" : "") +
          '" data-cat="' +
          esc(c) +
          '" type="button">' +
          esc(c) +
          "</button>"
        );
      })
      .join("");

  var query = state.query.trim().toLowerCase();
  var visible = all.filter(function (p) {
    if (state.category !== "all" && p.category !== state.category) return false;
    if (!query) return true;
    return (
      (p.name || "").toLowerCase().indexOf(query) !== -1 ||
      (p.brand || "").toLowerCase().indexOf(query) !== -1 ||
      (p.category || "").toLowerCase().indexOf(query) !== -1
    );
  });

  overviewCount.textContent =
    visible.length === 1 ? "1 product" : visible.length + " products";

  if (visible.length === 0) {
    productGrid.hidden = true;
    overviewEmpty.hidden = false;
    if (all.length === 0) {
      overviewEmptyTitle.textContent = "No products yet";
      overviewEmptySub.textContent = "Add your first product from the Inventory page.";
    } else {
      overviewEmptyTitle.textContent = "No products match your search";
      overviewEmptySub.textContent = "Try a different keyword or category.";
    }
  } else {
    productGrid.hidden = false;
    overviewEmpty.hidden = true;
    productGrid.innerHTML = visible.map(productCard).join("");
  }
}

categoryChips.addEventListener("click", function (e) {
  var btn = e.target.closest(".chip");
  if (!btn) return;
  state.category = btn.dataset.cat;
  render();
});

var searchDebounce = null;
searchInput.addEventListener("input", function () {
  window.clearTimeout(searchDebounce);
  searchDebounce = window.setTimeout(function () {
    state.query = searchInput.value;
    render();
  }, 120);
});

document.addEventListener("mynelle:products-changed", render);
window.addEventListener("storage", function (e) {
  if (typeof MynelleStore !== "undefined" && e.key === MynelleStore.PRODUCTS_KEY) {
    render();
  }
});

render();
