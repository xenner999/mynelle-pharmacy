function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  });
}

function daysLeft(expiry) {
  var diff = (new Date(expiry) - new Date()) / (1000 * 60 * 60 * 24);
  return Math.max(0, Math.ceil(diff));
}

var detailSummary = document.getElementById("detailSummary");
var detailCount = document.getElementById("detailCount");
var detailTableHead = document.getElementById("detailTableHead");
var detailTableWrap = document.getElementById("detailTableWrap");
var detailEmpty = document.getElementById("detailEmpty");
var detailEmptyTitle = document.getElementById("detailEmptyTitle");
var detailEmptySub = document.getElementById("detailEmptySub");
var searchInput = document.getElementById("searchInput");

detailTableHead.style.gridTemplateColumns = "1.9fr 1.3fr 1.1fr 0.9fr 0.9fr 1fr";
detailTableHead.innerHTML =
  "<span>Product</span><span>Category</span><span>Expiry date</span>" +
  "<span>Days left</span><span>Stock</span><span>Action</span>";

var query = "";

function rowsData() {
  return MynelleStore.getProducts()
    .filter(MynelleStore.isExpiringSoon)
    .sort(function (a, b) {
      return daysLeft(a.expiry) - daysLeft(b.expiry);
    });
}

function render() {
  var rows = rowsData();

  var urgent = rows.filter(function (p) {
    return daysLeft(p.expiry) <= 3;
  }).length;
  var categories = {};
  rows.forEach(function (p) {
    if (p.category) categories[p.category] = true;
  });

  detailSummary.innerHTML =
    '<div class="detail-stat tone-exp">' +
    '<div class="stat-top"><span class="stat-label">Expiring items</span>' +
    '<span class="stat-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></span></div>' +
    '<div class="stat-value">' +
    rows.length +
    '</div></div>' +
    '<div class="detail-stat tone-red">' +
    '<div class="stat-top"><span class="stat-label">Within 3 days</span>' +
    '<span class="stat-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span></div>' +
    '<div class="stat-value">' +
    urgent +
    '</div></div>' +
    '<div class="detail-stat tone-navy">' +
    '<div class="stat-top"><span class="stat-label">Categories affected</span>' +
    '<span class="stat-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg></span></div>' +
    '<div class="stat-value">' +
    Object.keys(categories).length +
    "</div></div>";

  var q = query.trim().toLowerCase();
  var visible = rows.filter(function (p) {
    if (!q) return true;
    return (
      (p.name || "").toLowerCase().indexOf(q) !== -1 ||
      (p.category || "").toLowerCase().indexOf(q) !== -1
    );
  });

  detailCount.textContent =
    visible.length === 1 ? "1 product" : visible.length + " products";

  if (visible.length === 0) {
    detailTableWrap.hidden = true;
    detailTableHead.hidden = true;
    detailEmpty.hidden = false;
    if (rows.length === 0) {
      detailEmptyTitle.textContent = "Nothing is expiring soon";
      detailEmptySub.textContent = "No products are inside the expiry warning window.";
    } else {
      detailEmptyTitle.textContent = "No products match your search";
      detailEmptySub.textContent = "Try a different keyword.";
    }
  } else {
    detailTableWrap.hidden = false;
    detailTableHead.hidden = false;
    detailEmpty.hidden = true;
    detailTableWrap.innerHTML = visible
      .map(function (p) {
        var left = daysLeft(p.expiry);
        var urgentRow = left <= 3;
        var row = document.createElement("div");
        row.className = "detail-row";
        row.style.gridTemplateColumns = "1.9fr 1.3fr 1.1fr 0.9fr 0.9fr 1fr";
        row.innerHTML =
          '<span class="detail-product"><span class="name">' +
          esc(p.name) +
          "</span></span>" +
          '<span class="detail-cell muted">' +
          esc(p.category || "\u2014") +
          "</span>" +
          '<span class="detail-cell muted">' +
          esc(
            new Date(p.expiry).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          ) +
          "</span>" +
          '<span class="detail-cell"><span class="urgency-pill ' +
          (urgentRow ? "tone-red" : "tone-exp") +
          '">' +
          left +
          (left === 1 ? " day" : " days") +
          "</span></span>" +
          '<span class="detail-cell muted">' +
          MynelleStore.formatQty(p.stock, p.unit) +
          "</span>" +
          '<span><a class="detail-action-btn" href="inventory.html">View</a></span>';
        return row.outerHTML;
      })
      .join("");
  }
}

var debounce = null;
searchInput.addEventListener("input", function () {
  window.clearTimeout(debounce);
  debounce = window.setTimeout(function () {
    query = searchInput.value;
    render();
  }, 120);
});

document.addEventListener("mynelle:products-changed", render);
window.addEventListener("storage", function (e) {
  if (e.key === MynelleStore.PRODUCTS_KEY) render();
});

render();
