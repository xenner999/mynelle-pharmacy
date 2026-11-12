function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  });
}

var detailSummary = document.getElementById("detailSummary");
var detailCount = document.getElementById("detailCount");
var detailTableHead = document.getElementById("detailTableHead");
var detailTableWrap = document.getElementById("detailTableWrap");
var detailEmpty = document.getElementById("detailEmpty");
var detailEmptyTitle = document.getElementById("detailEmptyTitle");
var detailEmptySub = document.getElementById("detailEmptySub");
var searchInput = document.getElementById("searchInput");

detailTableHead.style.gridTemplateColumns = "2fr 1.4fr 1.2fr 1fr 1fr";
detailTableHead.innerHTML =
  "<span>Product</span><span>Category</span><span>Brand</span>" +
  "<span>Unit price</span><span>Action</span>";

var query = "";

function rowsData() {
  return MynelleStore.getProducts()
    .filter(function (p) {
      return Number(p.stock) === 0;
    })
    .sort(function (a, b) {
      return (a.name || "").localeCompare(b.name || "");
    });
}

function render() {
  var rows = rowsData();

  var categories = {};
  var totalValue = 0;
  rows.forEach(function (p) {
    if (p.category) categories[p.category] = true;
    totalValue += Number(p.price) || 0;
  });

  detailSummary.innerHTML =
    '<div class="detail-stat tone-red">' +
    '<div class="stat-top"><span class="stat-label">Out of stock items</span>' +
    '<span class="stat-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span></div>' +
    '<div class="stat-value">' +
    rows.length +
    '</div></div>' +
    '<div class="detail-stat tone-navy">' +
    '<div class="stat-top"><span class="stat-label">Categories affected</span>' +
    '<span class="stat-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg></span></div>' +
    '<div class="stat-value">' +
    Object.keys(categories).length +
    '</div></div>' +
    '<div class="detail-stat tone-gold">' +
    '<div class="stat-top"><span class="stat-label">Combined unit value</span>' +
    '<span class="stat-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></span></div>' +
    '<div class="stat-value">' +
    MynelleStore.formatCurrency(totalValue) +
    "</div></div>";

  var q = query.trim().toLowerCase();
  var visible = rows.filter(function (p) {
    if (!q) return true;
    return (
      (p.name || "").toLowerCase().indexOf(q) !== -1 ||
      (p.category || "").toLowerCase().indexOf(q) !== -1 ||
      (p.brand || "").toLowerCase().indexOf(q) !== -1
    );
  });

  detailCount.textContent =
    visible.length === 1 ? "1 product" : visible.length + " products";

  if (visible.length === 0) {
    detailTableWrap.hidden = true;
    detailTableHead.hidden = true;
    detailEmpty.hidden = false;
    if (rows.length === 0) {
      detailEmptyTitle.textContent = "Nothing is out of stock";
      detailEmptySub.textContent = "Every product has at least one unit on hand.";
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
        var row = document.createElement("div");
        row.className = "detail-row";
        row.style.gridTemplateColumns = "2fr 1.4fr 1.2fr 1fr 1fr";
        row.innerHTML =
          '<span class="detail-product"><span class="name">' +
          esc(p.name) +
          "</span></span>" +
          '<span class="detail-cell muted">' +
          esc(p.category || "\u2014") +
          "</span>" +
          '<span class="detail-cell muted">' +
          esc(p.brand || "\u2014") +
          "</span>" +
          '<span class="detail-cell">' +
          MynelleStore.formatCurrency(p.price) +
          "</span>" +
          '<span><a class="detail-action-btn" href="' + Orders.restockHref(p.id) + '">' + Orders.restockLabel(p.id) + "</a></span>";
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
