// Status filter — single collapsible dropdown (All / Low stocks / Expiring soon)
var filterDropdown = document.getElementById("filterDropdown");
var filterToggle = document.getElementById("filterToggle");
var filterLabel = document.getElementById("filterLabel");
var filterMenu = document.getElementById("filterMenu");
var currentFilter = "all";
var currentPage = 0;
var pageSize = 10;

// Standard pharmacy categories are appended to the filter menu so stock can
// be viewed shelf by shelf.
(function buildCategoryFilter() {
  var sep = document.createElement("div");
  sep.className = "filter-sep";
  filterMenu.appendChild(sep);

  MynelleStore.CATEGORIES.forEach(function (cat) {
    var btn = document.createElement("button");
    btn.className = "filter-option";
    btn.type = "button";
    btn.setAttribute("role", "option");
    btn.dataset.filter = "cat:" + cat;
    btn.textContent = cat;
    filterMenu.appendChild(btn);
  });
})();

filterToggle.addEventListener("click", function (e) {
  var isOpen = filterDropdown.classList.toggle("open");
  filterToggle.setAttribute("aria-expanded", String(isOpen));
});

filterMenu.addEventListener("click", function (e) {
  var option = e.target.closest(".filter-option");
  if (!option) return;
  document.querySelectorAll(".filter-option").forEach(function (el) {
    el.classList.remove("active");
  });
  option.classList.add("active");
  filterLabel.textContent = option.textContent.trim();
  filterDropdown.classList.remove("open");
  filterToggle.setAttribute("aria-expanded", "false");
  currentFilter = option.dataset.filter;
  currentPage = 0;
  renderProducts();
});

document.addEventListener("click", function (e) {
  if (!filterDropdown.contains(e.target)) {
    filterDropdown.classList.remove("open");
    filterToggle.setAttribute("aria-expanded", "false");
  }
});

// ---------------------------------------------------------------------
// Product table rendering
// ---------------------------------------------------------------------
var tableWrap = document.querySelector(".table-wrap");
var tableHead = tableWrap.querySelector(".table-head");
var searchInput = document.getElementById("searchInput");
var searchQuery = "";

(function readQueryParam() {
  var m = /[?&]q=([^&]*)/.exec(window.location.search);
  if (m) {
    searchQuery = decodeURIComponent(m[1].replace(/\+/g, " "));
    searchInput.value = searchQuery;
  }
})();

function esc(v) {
  return String(v == null ? "" : v).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  });
}

var searchTimer = null;
searchInput.addEventListener("input", function () {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(function () {
    searchQuery = searchInput.value;
    currentPage = 0;
    renderProducts();
  }, 120);
});

var pluralizeUnit = MynelleStore.pluralizeUnit;

function archiveIconSvg() {
  return (
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<rect x="2" y="3" width="20" height="5" rx="1"/>' +
    '<path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>' +
    "</svg>"
  );
}

function restoreIconSvg() {
  return (
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>' +
    "</svg>"
  );
}

function boxIconSvg() {
  return (
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M21 8 12 3 3 8v8l9 5 9-5Z"/><path d="m3 8 9 5 9-5M12 13v8"/>' +
    "</svg>"
  );
}

function editIconSvg() {
  return (
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>' +
    "</svg>"
  );
}

function formatExpiry(dateStr, dateFormat) {
  if (!dateStr) return "\u2014";
  var parts = dateStr.split("-"); // YYYY-MM-DD from <input type="date">
  if (parts.length !== 3) return dateStr;
  var y = parts[0],
    m = parts[1],
    d = parts[2];
  if (dateFormat === "DD/MM/YYYY") return d + "/" + m + "/" + y;
  if (dateFormat === "YYYY-MM-DD") return y + "-" + m + "-" + d;
  return m + "/" + d + "/" + y; // MM/DD/YYYY default
}

function renderProducts() {
  var settings = MynelleStore.getSettings();
  var viewingArchived = currentFilter === "archived";
  var products = viewingArchived ? MynelleStore.getArchivedProducts() : MynelleStore.getProducts();

  // Sort per the default sort order set in Settings → Inventory & stock
  var sort = settings.inventory.defaultSort;
  // "added" (default) = newest added first, "oldest" = oldest added first.
  // Both follow the order products were added in, so rows never jump around
  // after an edit or restock. The other options re-sort.
  products = products.slice();
  if (sort === "added") products.reverse();
  if (sort === "name-az" || sort === "name-desc" || sort === "stock-asc" || sort === "expiry-soonest") {
    products.sort(function (a, b) {
      if (sort === "name-desc") return b.name.localeCompare(a.name);
      if (sort === "stock-asc") return a.stock - b.stock;
      if (sort === "expiry-soonest")
        return (a.expiry || "9999-99-99").localeCompare(b.expiry || "9999-99-99");
      return a.name.localeCompare(b.name); // name-az
    });
  }

  var filtered = products.filter(function (p) {
    if (currentFilter === "low") return MynelleStore.isLowStock(p);
    if (currentFilter === "expiring") return MynelleStore.isExpiringSoon(p);
    if (currentFilter.indexOf("cat:") === 0)
      return (p.category || "") === currentFilter.slice(4);
    return true;
  });

  var q = searchQuery.trim().toLowerCase();
  if (q) {
    filtered = filtered.filter(function (p) {
      return (
        (p.name || "").toLowerCase().indexOf(q) !== -1 ||
        (p.brand || "").toLowerCase().indexOf(q) !== -1 ||
        (p.category || "").toLowerCase().indexOf(q) !== -1 ||
        String(p.id).toLowerCase().indexOf(q) !== -1 ||
        p.batches.some(function (b) {
          return (b.lot || "").toLowerCase().indexOf(q) !== -1;
        })
      );
    });
  }

  // Clear everything after the head row
  Array.prototype.slice.call(tableWrap.children).forEach(function (child) {
    if (child !== tableHead) child.remove();
  });

  if (filtered.length === 0) {
    var empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML =
      '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#e1e6f0" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<rect x="8" y="2" width="8" height="4" rx="1"/>' +
      '<path d="M9 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3"/>' +
      '<path d="M9 12h6M9 16h6"/>' +
      "</svg>" +
      '<p class="title">' +
      (viewingArchived && products.length === 0
        ? "No archived products"
        : products.length === 0
        ? "No products in inventory yet"
        : "No products found") +
      "</p>" +
      '<p class="sub">' +
      (viewingArchived && products.length === 0
        ? "Archived products are hidden from the POS and reports. Archive a product from the main list to see it here."
        : products.length === 0
        ? "Use Add product to start tracking stock."
        : "Try a different filter or search term.") +
      "</p>";
    tableWrap.appendChild(empty);
    renderPager(0, 0, 0, 1);
    return;
  }

  var totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  if (currentPage > totalPages - 1) currentPage = totalPages - 1;
  var pageStart = currentPage * pageSize;
  var pageItems = filtered.slice(pageStart, pageStart + pageSize);

  pageItems.forEach(function (p) {
    var row = document.createElement("div");
    row.className = "table-row";
    row.dataset.id = p.id;

    var low = MynelleStore.isLowStock(p);
    var expiredQty = MynelleStore.expiredStock(p);
    var stockHtml =
      '<span class="stock-pill' +
      (low ? " low" : "") +
      (Number(p.stock) === 0 ? " out" : "") +
      '">' +
      esc(MynelleStore.formatQty(p.stock, p.unit)) +
      "</span>";
    var crumbs = MynelleStore.breakdown(p.stock, p);
    if (crumbs) {
      stockHtml +=
        '<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">' + esc(crumbs) + "</div>";
    }
    if (low) {
      stockHtml +=
        '<div class="critical-note">Critical level: ' + MynelleStore.criticalLevelFor(p) + "</div>";
    }
    if (expiredQty) {
      stockHtml +=
        '<div class="critical-note">' + esc(MynelleStore.formatQty(expiredQty, p.unit)) + " expired</div>";
    }

    var expiryHtml = formatExpiry(p.expiry, settings.general.dateFormat);
    if (p.expiry) {
      var dl = MynelleStore.daysUntil(p.expiry);
      var cls = dl < 0 ? "bad" : MynelleStore.isExpiringSoon(p) ? "warn" : "";
      var sub =
        dl < 0 ? "Expired" : dl === 0 ? "Today" : MynelleStore.isExpiringSoon(p) ? dl + (dl === 1 ? " day left" : " days left") : "";
      if (p.batches.length > 1) sub = (sub ? sub + ", " : "") + p.batches.length + " batches";
      expiryHtml =
        '<div class="expiry-cell">' + esc(expiryHtml) + (sub ? '<span class="sub ' + cls + '">' + esc(sub) + "</span>" : "") + "</div>";
    } else if (p.batches.length > 1) {
      expiryHtml = '<div class="expiry-cell">\u2014<span class="sub">' + p.batches.length + " batches</span></div>";
    }

    var nameHtml = esc(p.name);
    if (p.brand) {
      nameHtml += '<div class="brand-note">' + esc(p.brand) + "</div>";
    }

    row.innerHTML =
      "<span>" +
      esc(p.id) +
      "</span>" +
      "<span>" +
      nameHtml +
      "</span>" +
      '<span><span class="category-pill">' +
      esc(p.category || "Uncategorised") +
      "</span></span>" +
      "<span>" +
      stockHtml +
      "</span>" +
      "<span>" +
      expiryHtml +
      "</span>" +
      "<span>" +
      MynelleStore.formatCurrency(p.price) +
      "</span>" +
      '<span class="row-actions">' +
      (viewingArchived
        ? '<button class="action-icon-btn restore" type="button" data-action="restore" data-id="' +
          esc(p.id) +
          '" aria-label="Restore product">' +
          restoreIconSvg() +
          " Restore</button>"
        : '<button class="action-icon-btn" type="button" data-action="stock" data-id="' +
          esc(p.id) +
          '" aria-label="Manage stock">' +
          boxIconSvg() +
          "</button>" +
          '<button class="action-icon-btn" type="button" data-action="edit" data-id="' +
          esc(p.id) +
          '" aria-label="Edit product">' +
          editIconSvg() +
          "</button>" +
          '<button class="action-icon-btn" type="button" data-action="archive" data-id="' +
          esc(p.id) +
          '" aria-label="Archive product" title="Archive">' +
          archiveIconSvg() +
          "</button>") +
      "</span>";

    tableWrap.appendChild(row);
  });

  renderPager(filtered.length, pageStart, pageItems.length, totalPages);
}

// Previous / Next controls under the table
function getPager() {
  var el = document.getElementById("invPager");
  if (!el) {
    el = document.createElement("div");
    el.id = "invPager";
    el.className = "pager";
    tableWrap.parentNode.insertBefore(el, tableWrap.nextSibling);
    el.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-page]");
      if (!btn || btn.disabled) return;
      var act = btn.dataset.page;
      var last = Math.max(1, Math.ceil(lastTotal / pageSize)) - 1;
      if (act === "first") currentPage = 0;
      else if (act === "prev") currentPage = Math.max(0, currentPage - 1);
      else if (act === "next") currentPage = Math.min(last, currentPage + 1);
      else if (act === "last") currentPage = last;
      renderProducts();
      tableWrap.scrollIntoView({ block: "start", behavior: "smooth" });
    });
    el.addEventListener("change", function (e) {
      if (e.target.id !== "invPageSize") return;
      pageSize = Number(e.target.value) || 10;
      currentPage = 0;
      renderProducts();
    });
  }
  return el;
}
var lastTotal = 0;

function renderPager(total, start, shown, totalPages) {
  var pager = getPager();
  lastTotal = total;
  if (total === 0) {
    pager.innerHTML = "";
    pager.style.display = "none";
    return;
  }
  pager.style.display = "";
  var atFirst = currentPage === 0;
  var atLast = currentPage >= totalPages - 1;
  pager.innerHTML =
    '<span class="pager-info">Showing ' + (start + 1) + "\u2013" + (start + shown) +
    " of " + total.toLocaleString("en-US") + " products</span>" +
    '<div class="pager-actions">' +
    '<label class="pager-size">Rows per page ' +
    '<select id="invPageSize" aria-label="Rows per page">' +
    [10, 25, 50, 100].map(function (n) {
      return '<option value="' + n + '"' + (n === pageSize ? " selected" : "") + ">" + n + "</option>";
    }).join("") +
    "</select></label>" +
    '<button type="button" class="pager-btn" data-page="first"' + (atFirst ? " disabled" : "") + ">First</button>" +
    '<button type="button" class="pager-btn" data-page="prev"' + (atFirst ? " disabled" : "") + ">Previous</button>" +
    '<span class="pager-page">Page ' + (currentPage + 1) + " of " + totalPages + "</span>" +
    '<button type="button" class="pager-btn" data-page="next"' + (atLast ? " disabled" : "") + ">Next</button>" +
    '<button type="button" class="pager-btn" data-page="last"' + (atLast ? " disabled" : "") + ">Last</button>" +
    "</div>";
}

tableWrap.addEventListener("click", function (e) {
  var stockBtn = e.target.closest('[data-action="stock"]');
  if (stockBtn) {
    openStock(stockBtn.dataset.id);
    return;
  }
  var editBtn = e.target.closest('[data-action="edit"]');
  if (editBtn) {
    var product = MynelleStore.getProducts().filter(function (p) {
      return p.id === editBtn.dataset.id;
    })[0];
    if (product) openModal(product);
    return;
  }
  var restoreBtn = e.target.closest('[data-action="restore"]');
  if (restoreBtn) {
    MynelleStore.restoreProduct(restoreBtn.dataset.id);
    document.dispatchEvent(new CustomEvent("mynelle:products-changed"));
    renderProducts();
    showToast("Product restored to inventory");
    return;
  }
  var btn = e.target.closest('[data-action="archive"]');
  if (!btn) return;
  var archivedId = btn.dataset.id;
  MynelleStore.archiveProduct(archivedId);
  document.dispatchEvent(new CustomEvent("mynelle:products-changed"));
  renderProducts();
  showToast("Product archived", {
    label: "Undo",
    onClick: function () {
      MynelleStore.restoreProduct(archivedId);
      document.dispatchEvent(new CustomEvent("mynelle:products-changed"));
      renderProducts();
    },
  });
});

// ---------------------------------------------------------------------
// Add product modal
// ---------------------------------------------------------------------
var overlay = document.getElementById("addProductOverlay");
var addBtn = document.querySelector("button.add-btn");

// Bound first so the button works even if a later part of this script fails.
addBtn.addEventListener("click", function () {
  try {
    openModal();
  } catch (err) {
    console.error(err);
    showToast("Couldn't open the form. Reload the page and try again.");
  }
});
var form = document.getElementById("addProductForm");
var fId = document.getElementById("fProductId");
var fName = document.getElementById("fProductName");
var fStock = document.getElementById("fStock");
var fExpiry = document.getElementById("fExpiry");
var fExpiryLabel = document.getElementById("fExpiryLabel");
var fPrice = document.getElementById("fPrice");
var fBrand = document.getElementById("fBrand");
var fDoseNum = document.getElementById("fDoseNum");
var fDoseUnit = document.getElementById("fDoseUnit");
var errDose = document.getElementById("errDose");
var fCategory = document.getElementById("fCategory");
var fBaseUnit = document.getElementById("fBaseUnit");
var fCriticalLevel = document.getElementById("fCriticalLevel");
var fTotalPiecesPreview = document.getElementById("fTotalPiecesPreview");

// ---------------------------------------------------------------------
// Autocomplete for Generic name / Brand name — suggests names already
// used in this pharmacy's inventory first (so entries stay consistent),
// backed by a small starter list of common Philippine pharmacy generics
// and brands for when the catalog is still mostly empty.
// ---------------------------------------------------------------------
var GENERIC_NAME_SEED = [
  "Paracetamol 500mg", "Amoxicillin 500mg", "Mefenamic Acid 500mg",
  "Ibuprofen 400mg", "Cetirizine 10mg", "Loratadine 10mg",
  "Diphenhydramine 25mg", "Ambroxol 30mg", "Salbutamol Inhaler",
  "Losartan 50mg", "Amlodipine 5mg", "Metoprolol 50mg",
  "Metformin 500mg", "Glimepiride 2mg", "Omeprazole 20mg",
  "Ranitidine 150mg", "Loperamide 2mg", "Oral Rehydration Salts",
  "Ascorbic Acid 500mg", "Multivitamins + Minerals", "Ferrous Sulfate 325mg",
  "Azithromycin 500mg", "Cefalexin 500mg", "Clindamycin 300mg",
  "Simvastatin 20mg", "Atorvastatin 20mg", "Furosemide 40mg",
  "Hydrochlorothiazide 25mg", "Prednisone 20mg", "Dexamethasone 0.5mg",
  "Tranexamic Acid 500mg", "Mupirocin Ointment", "Hydrocortisone Cream",
  "Povidone-Iodine Solution", "Isotonic Nasal Spray",
];
var BRAND_NAME_SEED = [
  "RiteMed", "Biogesic", "Bioflu", "Neozep", "Decolgen", "Alaxan",
  "Medicol", "Ponstan", "Amoxil", "Augmentin", "Zithromax",
  "Virlix", "Claritin", "Benadryl", "Ventolin", "Cozaar",
  "Norvasc", "Glucophage", "Amaryl", "Losec", "Zantac",
  "Diatabs", "Hidrasec", "Cecon", "Enervon", "Berocca",
  "Centrum", "Solmux", "Robitussin", "Zocor", "Lipitor",
  "Lasix", "Betadine",
];

var STRENGTH_SEED = [
  "500mg", "250mg", "400mg", "325mg", "300mg", "200mg", "150mg", "100mg",
  "50mg", "40mg", "30mg", "25mg", "20mg", "10mg", "5mg", "2mg", "1%",
  "120mg/5mL", "250mg/5mL", "15mg/5mL",
];

function buildSuggestionPool(seed, field) {
  var fromProducts = MynelleStore.getProducts()
    .map(function (p) {
      return (p[field] || "").trim();
    })
    .filter(Boolean);
  var seen = {};
  var out = [];
  fromProducts.concat(seed).forEach(function (value) {
    var key = value.toLowerCase();
    if (seen[key]) return;
    seen[key] = true;
    out.push({ value: value, fromCatalog: fromProducts.indexOf(value) !== -1 });
  });
  return out;
}

function attachAutocomplete(inputEl, poolFn) {
  var wrap = document.createElement("div");
  wrap.className = "ac-wrap";
  inputEl.parentNode.insertBefore(wrap, inputEl);
  wrap.appendChild(inputEl);

  var list = document.createElement("div");
  list.className = "ac-list";
  list.setAttribute("role", "listbox");
  wrap.appendChild(list);

  var activeIndex = -1;
  var currentMatches = [];

  function close() {
    wrap.classList.remove("ac-open");
    activeIndex = -1;
  }

  function highlight(idx) {
    var items = list.querySelectorAll(".ac-item");
    items.forEach(function (el, i) {
      el.classList.toggle("active", i === idx);
    });
    if (items[idx]) items[idx].scrollIntoView({ block: "nearest" });
    activeIndex = idx;
  }

  function open(query) {
    var q = query.trim().toLowerCase();
    currentMatches = poolFn()
      .filter(function (item) {
        return !q || item.value.toLowerCase().indexOf(q) !== -1;
      })
      .slice(0, 7);

    if (currentMatches.length === 0) {
      close();
      return;
    }

    list.innerHTML = currentMatches
      .map(function (item) {
        return (
          '<div class="ac-item" role="option">' +
          item.value.replace(/[&<>"]/g, function (c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
          }) +
          (item.fromCatalog ? '<span class="ac-tag">In inventory</span>' : "") +
          "</div>"
        );
      })
      .join("");
    wrap.classList.add("ac-open");
    activeIndex = -1;
  }

  inputEl.addEventListener("input", function () {
    open(inputEl.value);
  });
  inputEl.addEventListener("focus", function () {
    open(inputEl.value);
  });
  inputEl.addEventListener("keydown", function (e) {
    if (!wrap.classList.contains("ac-open")) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      highlight(Math.min(activeIndex + 1, currentMatches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      highlight(Math.max(activeIndex - 1, 0));
    } else if (e.key === "Enter") {
      if (activeIndex >= 0 && currentMatches[activeIndex]) {
        e.preventDefault();
        inputEl.value = currentMatches[activeIndex].value;
        close();
      }
    } else if (e.key === "Escape") {
      close();
    }
  });
  list.addEventListener("mousedown", function (e) {
    // mousedown (not click) so this fires before the input's blur handler
    var item = e.target.closest(".ac-item");
    if (!item) return;
    e.preventDefault();
    var idx = Array.prototype.indexOf.call(list.children, item);
    if (currentMatches[idx]) {
      inputEl.value = currentMatches[idx].value;
    }
    close();
  });
  document.addEventListener("click", function (e) {
    if (!wrap.contains(e.target)) close();
  });
}

attachAutocomplete(fName, function () {
  var generics = GENERIC_NAME_SEED.map(function (n) {
    return MynelleStore.splitName(n)[0];
  });
  return buildSuggestionPool(generics, "genericName");
});

// ---- Dose = number + measurement (stored as one string, e.g. "500mg") ----
var DOSE_UNITS = ["mg", "mcg", "g", "mL", "L", "IU", "%", "mg/mL", "mg/5mL", "mcg/mL", "g/100mL"];
(function buildDoseUnits() {
  var ph = document.createElement("option");
  ph.value = "";
  ph.textContent = "Unit";
  fDoseUnit.appendChild(ph);
  DOSE_UNITS.forEach(function (u) {
    var o = document.createElement("option");
    o.value = u;
    o.textContent = u;
    fDoseUnit.appendChild(o);
  });
})();

// Old products may hold a free-text strength we can't split; keep it unless edited.
var legacyStrength = "";
function setDose(strength) {
  legacyStrength = "";
  fDoseNum.value = "";
  fDoseUnit.value = "";
  Array.prototype.slice.call(fDoseUnit.options).forEach(function (o) {
    if (o.dataset.extra) o.remove();
  });
  var str = String(strength || "").trim();
  if (!str) return;
  var m = /^(\d+(?:\.\d+)?)\s*(.*)$/.exec(str);
  if (!m) { legacyStrength = str; return; }
  var unit = m[2].trim();
  var found = DOSE_UNITS.filter(function (u) { return u.toLowerCase() === unit.toLowerCase(); })[0];
  if (!found && unit) {
    var o = document.createElement("option");
    o.value = unit;
    o.textContent = unit;
    o.dataset.extra = "1";
    fDoseUnit.appendChild(o);
    found = unit;
  }
  fDoseNum.value = m[1];
  fDoseUnit.value = found || "";
}
function doseTouched() { legacyStrength = ""; }
fDoseNum.addEventListener("input", doseTouched);
fDoseUnit.addEventListener("change", doseTouched);
attachAutocomplete(fBrand, function () {
  return buildSuggestionPool(BRAND_NAME_SEED, "brand");
});

// Fill the category and unit-of-measurement selects from the shared lists.
(function buildSelects() {
  var placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select a category";
  fCategory.appendChild(placeholder);

  MynelleStore.CATEGORIES.forEach(function (cat) {
    var opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    fCategory.appendChild(opt);
  });

  MynelleStore.UNITS.forEach(function (unit) {
    var opt = document.createElement("option");
    opt.value = unit;
    opt.textContent = unit;
    fBaseUnit.appendChild(opt);
  });
  fBaseUnit.value = "tablet";
})();

// ---------------------------------------------------------------------
// Add / edit product
// ---------------------------------------------------------------------
var MAX_LEVELS = 3;
var levelsEl = document.getElementById("packagingLevels");
var btnAddLevel = document.getElementById("btnAddLevel");
var packagingPreview = document.getElementById("packagingPreview");
var fStockUnit = document.getElementById("fStockUnit");
var fLot = document.getElementById("fLot");
var fExpiryWarning = document.getElementById("fExpiryWarning");
var moreOptions = document.getElementById("moreOptions");
var editingProduct = null;
var idTouched = false;
var modalTitle = document.getElementById("addProductTitle");
var modalSubmit = document.getElementById("addProductSubmit");

function readLevels() {
  return Array.prototype.map.call(levelsEl.querySelectorAll(".packaging-row"), function (row) {
    return {
      name: row.querySelector(".lv-name").value,
      per: Number(row.querySelector(".lv-per").value),
    };
  });
}

function addLevelRow(level) {
  var row = document.createElement("div");
  row.className = "packaging-row";
  row.innerHTML =
    "<span>1</span>" +
    '<select class="settings-select lv-name" aria-label="Package type">' +
    MynelleStore.PACKAGE_TYPES.map(function (t) {
      return '<option value="' + t + '">' + t + "</option>";
    }).join("") +
    "</select>" +
    "<span>contains</span>" +
    '<input type="number" class="settings-input lv-per" min="1" step="1" placeholder="10" aria-label="Quantity inside" />' +
    '<span class="lv-next"></span>' +
    '<button type="button" class="btn-link rm">Remove</button>';
  if (level) {
    row.querySelector(".lv-name").value = level.name;
    row.querySelector(".lv-per").value = level.per;
  } else {
    // Suggest a package type not used yet, largest first.
    var used = readLevels().map(function (l) { return l.name; });
    var next = ["box", "strip", "blister"].filter(function (t) { return used.indexOf(t) === -1; })[0];
    if (next) row.querySelector(".lv-name").value = next;
  }
  levelsEl.appendChild(row);
}

function refreshPackaging() {
  var base = fBaseUnit.value;
  var levels = readLevels();
  levelsEl.querySelectorAll(".packaging-row").forEach(function (row, i) {
    var nextName = i < levels.length - 1 ? levels[i + 1].name : base;
    row.querySelector(".lv-next").textContent = pluralizeUnit(nextName, levels[i].per || 2);
  });
  btnAddLevel.disabled = levels.length >= MAX_LEVELS;

  var valid = levels.every(function (l) { return l.per > 0; });
  if (levels.length && valid) {
    packagingPreview.textContent =
      "1 " + levels[0].name + " = " +
      MynelleStore.formatQty(MynelleStore.packagingMultiplier(levels, 0), base);
  } else {
    packagingPreview.textContent = "";
  }

  var priceLabel = document.getElementById("fPriceLabel");
  if (priceLabel) priceLabel.textContent = "Price per " + base + " *";

  // Opening stock can be entered in the base unit or any package level.
  var previous = fStockUnit.value;
  var opts = MynelleStore.unitOptions({ unit: base, packaging: valid ? levels : [] });
  fStockUnit.innerHTML = opts
    .map(function (o) {
      return '<option value="' + o.mult + '">' + esc(pluralizeUnit(o.name, 2)) + "</option>";
    })
    .join("");
  // With no package set up there is only one choice, which looks broken.
  // Offer a shortcut that opens the packaging section instead.
  if (!levels.length) {
    fStockUnit.insertAdjacentHTML("beforeend", '<option value="__add__">+ Add a box, pack or strip\u2026</option>');
  }
  fStockUnit.title = levels.length
    ? "How you're counting the opening stock (pieces or packages)"
    : "Only pieces for now \u2014 pick \"+ Add a box, pack or strip\" to enter stock by package";
  if (previous && Array.prototype.some.call(fStockUnit.options, function (o) { return o.value === previous; })) {
    fStockUnit.value = previous;
  }
  updateTotalPreview();
}

function updateTotalPreview() {
  var total = (Number(fStock.value) || 0) * (Number(fStockUnit.value) || 1);
  fTotalPiecesPreview.textContent = MynelleStore.formatQty(total, fBaseUnit.value);
}

levelsEl.addEventListener("input", refreshPackaging);
levelsEl.addEventListener("change", refreshPackaging);
levelsEl.addEventListener("click", function (e) {
  if (!e.target.closest(".rm")) return;
  e.target.closest(".packaging-row").remove();
  refreshPackaging();
});
btnAddLevel.addEventListener("click", function () {
  if (levelsEl.children.length >= MAX_LEVELS) return;
  addLevelRow();
  refreshPackaging();
});
fBaseUnit.addEventListener("change", refreshPackaging);
fStockUnit.addEventListener("change", function () {
  if (fStockUnit.value === "__add__") {
    fStockUnit.selectedIndex = 0; // back to pieces
    moreOptions.open = true;
    if (!levelsEl.children.length) addLevelRow();
    refreshPackaging();
    var per = levelsEl.querySelector(".lv-per");
    if (per) {
      per.scrollIntoView({ block: "center", behavior: "smooth" });
      per.focus();
    }
  }
  updateTotalPreview();
});
fStock.addEventListener("input", updateTotalPreview);

// Picture field. pendingPic: undefined = leave as is, "" = remove, string = new picture.
var picPreview = document.getElementById("picPreview");
var picFile = document.getElementById("picFile");
var picChoose = document.getElementById("picChoose");
var picRemove = document.getElementById("picRemove");
var errPicture = document.getElementById("errPicture");
var pendingPic;

function showPic(dataUrl) {
  picPreview.classList.toggle("has", !!dataUrl);
  picPreview.innerHTML = dataUrl ? '<img src="' + dataUrl + '" alt="" />' : "\uD83D\uDCF7";
  picRemove.hidden = !dataUrl;
  picChoose.textContent = dataUrl ? "Change picture" : "Choose picture";
}
picChoose.addEventListener("click", function () {
  picFile.value = "";
  picFile.click();
});
picFile.addEventListener("change", function () {
  var f = picFile.files && picFile.files[0];
  if (!f) return;
  errPicture.textContent = "";
  if (!/^image\//.test(f.type)) { errPicture.textContent = "Please choose an image file."; return; }
  if (f.size > 15 * 1024 * 1024) { errPicture.textContent = "That picture is over 15 MB."; return; }
  MynelleStore.imageFileToDataUrl(f)
    .then(function (url) {
      pendingPic = url;
      showPic(url);
    })
    .catch(function (e) {
      errPicture.textContent = e.message;
    });
});
picRemove.addEventListener("click", function () {
  pendingPic = "";
  showPic("");
});

function openModal(product) {
  var settings = MynelleStore.getSettings();
  editingProduct = product && product.id ? product : null;
  form.reset();
  clearErrors();
  levelsEl.innerHTML = "";
  modalTitle.textContent = editingProduct ? "Edit product" : "Add product";
  modalSubmit.textContent = editingProduct ? "Save changes" : "Add product";
  idTouched = false;
  pendingPic = undefined;
  errPicture.textContent = "";
  showPic(editingProduct ? MynelleStore.getProductImage(editingProduct.id) : "");
  fId.readOnly = !!editingProduct;
  fId.value = editingProduct ? editingProduct.id : MynelleStore.nextProductId("");
  fCategory.value = "";
  fBaseUnit.value = "tablet";
  setDose("");
  refreshExpiryLimits();
  fCriticalLevel.placeholder =
    "Default: " + (settings.inventory.criticalLevelUnits || settings.inventory.lowStockThresholdPcs);
  fExpiryWarning.placeholder = "Default: " + settings.inventory.expiryWindowDays;
  fExpiryLabel.textContent = settings.inventory.requireExpiry ? "Expiry date *" : "Expiry date";
  form.classList.toggle("is-edit", !!editingProduct);
  moreOptions.open = false;

  if (editingProduct) {
    fName.value = editingProduct.genericName || editingProduct.name || "";
    setDose(editingProduct.strength);
    fBrand.value = editingProduct.brand || "";
    fCategory.value = editingProduct.category || "";
    fBaseUnit.value = editingProduct.unit || "tablet";
    fCriticalLevel.value = editingProduct.criticalLevel || "";
    fExpiryWarning.value = editingProduct.expiryWarningDays || "";
    fPrice.value = editingProduct.price;
    editingProduct.packaging.forEach(addLevelRow);
    moreOptions.open = editingProduct.packaging.length > 0 || editingProduct.expiryWarningDays !== null;
  }
  refreshPackaging();
  if (!editingProduct) {
    var d = settings.inventory.defaultUnit;
    if (d && d !== "pcs" && d !== "unit") {
      var match = Array.prototype.filter.call(fStockUnit.options, function (o) {
        return o.textContent.indexOf(d) === 0;
      })[0];
      if (match) fStockUnit.value = match.value;
    }
  }
  updateTotalPreview();
  overlay.classList.add("open");
  window.setTimeout(function () {
    fName.focus();
  }, 0);
}

function closeModal() {
  overlay.classList.remove("open");
}

fId.addEventListener("input", function () {
  idTouched = true;
  var pos = fId.selectionStart;
  fId.value = fId.value.toUpperCase();
  if (pos != null) fId.setSelectionRange(pos, pos);
});

fCategory.addEventListener("change", function () {
  if (!editingProduct && !idTouched) {
    fId.value = MynelleStore.nextProductId(fCategory.value);
  }
});

document.getElementById("addProductClose").addEventListener("click", closeModal);
document.getElementById("addProductCancel").addEventListener("click", closeModal);
overlay.addEventListener("click", function (e) {
  if (e.target === overlay) closeModal();
});
document.addEventListener("keydown", function (e) {
  if (e.key !== "Escape") return;
  if (overlay.classList.contains("open")) closeModal();
  if (stockOverlay.classList.contains("open")) closeStock();
});

function clearErrors() {
  var summary = document.getElementById("formSummary");
  if (summary) summary.textContent = "";
  document.querySelectorAll(".field-error").forEach(function (el) {
    el.textContent = "";
  });
  document.querySelectorAll(".has-error").forEach(function (el) {
    el.classList.remove("has-error");
  });
}

function setError(input, errorEl, message) {
  input.classList.add("has-error");
  errorEl.textContent = message;
}

function todayIso() {
  var d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

// ---- Expiry limits: new stock must have at least 1 year of shelf life ----
var MIN_EXPIRY_MONTHS = 12; // change this one number to loosen/tighten the rule
var MAX_EXPIRY_YEARS = 10; // guards against typo years like 2202
var HAS_LETTER = /[A-Za-z\u00C0-\u024F]/;

// Catches nonsense like "12222122322", "dsdsdsd", "aaaa" while still allowing
// real names with numbers (Vitamin B12, Omega-3, Co-Q10). Returns "" if OK.
function nameProblem(value, what) {
  var v = String(value || "").trim();
  if (!v) return "";
  var letters = (v.match(/[A-Za-z\u00C0-\u024F]/g) || []).length;
  var digits = (v.match(/[0-9]/g) || []).length;
  if (!/^[A-Za-z\u00C0-\u024F]/.test(v)) return what + " must start with a letter.";
  if (letters < 3) return what + " needs at least 3 letters.";
  if (digits > letters) return what + " has more numbers than letters.";
  if (/[0-9]{5,}/.test(v)) return what + " has too many numbers in a row.";
  if (/(.)\1\1/i.test(v)) return what + " looks invalid (a character repeats 3 times in a row).";
  if (!/[aeiouy\u00C0-\u00FF]/i.test(v)) return what + " doesn't look like a real name \u2014 please check the spelling.";
  return "";
}

function isoFromDate(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function minExpiryIso() {
  var d = new Date();
  var day = d.getDate();
  d.setMonth(d.getMonth() + MIN_EXPIRY_MONTHS);
  if (d.getDate() !== day) d.setDate(0); // e.g. 31 Jan + 1 month -> end of Feb
  return isoFromDate(d);
}
function maxExpiryIso() {
  var d = new Date();
  d.setFullYear(d.getFullYear() + MAX_EXPIRY_YEARS);
  return isoFromDate(d);
}
function expiryProblem(value) {
  if (!value) return "";
  var min = minExpiryIso();
  var df = MynelleStore.getSettings().general.dateFormat;
  if (value < min) {
    return "Too soon \u2014 expiry must be at least " + (MIN_EXPIRY_MONTHS / 12) + " year from today (" + formatExpiry(min, df) + " or later).";
  }
  if (value > maxExpiryIso()) return "That date is too far ahead \u2014 please check the year.";
  return "";
}
function refreshExpiryLimits() {
  var min = minExpiryIso();
  var max = maxExpiryIso();
  var df = MynelleStore.getSettings().general.dateFormat;
  [fExpiry, document.getElementById("rExpiry")].forEach(function (el) {
    if (!el) return;
    el.min = min;
    el.max = max;
    el.title = "Expiry date \u2014 earliest allowed: " + formatExpiry(min, df);
  });
}
function liveExpiryCheck(input, errId) {
  input.addEventListener("focus", refreshExpiryLimits);
  input.addEventListener("change", function () {
    var msg = expiryProblem(input.value);
    var err = document.getElementById(errId);
    if (msg) {
      setError(input, err, msg);
    } else {
      input.classList.remove("has-error");
      err.textContent = "";
    }
  });
}
function liveNameCheck(input, errId, what) {
  input.addEventListener("blur", function () {
    var err = document.getElementById(errId);
    var msg = nameProblem(input.value, what);
    if (msg) setError(input, err, msg);
    else { input.classList.remove("has-error"); err.textContent = ""; }
  });
}
liveNameCheck(fName, "errProductName", "Generic name");
liveNameCheck(fBrand, "errBrand", "Brand name");
liveExpiryCheck(fExpiry, "errExpiry");
liveExpiryCheck(document.getElementById("rExpiry"), "errRExpiry");
refreshExpiryLimits();

form.addEventListener("submit", function (e) {
  e.preventDefault();
  clearErrors();

  var settings = MynelleStore.getSettings();
  var valid = true;

  if (!editingProduct) {
    var idValue = fId.value.trim().toUpperCase();
    var errId = document.getElementById("errProductId");
    if (!idValue) {
      setError(fId, errId, "Product ID is required.");
      valid = false;
    } else if (!/^[A-Z0-9]+(-[A-Z0-9]+)*$/.test(idValue)) {
      setError(fId, errId, "Use letters, numbers and hyphens only.");
      valid = false;
    } else if (MynelleStore.productIdExists(idValue)) {
      setError(fId, errId, "This ID is already used.");
      valid = false;
    }
  }

  var name = fName.value.trim();
  if (!name) {
    setError(fName, document.getElementById("errProductName"), "Product name is required.");
    valid = false;
  } else if (nameProblem(name, "Generic name")) {
    setError(fName, document.getElementById("errProductName"), nameProblem(name, "Generic name"));
    valid = false;
  }
  var brandCheck = fBrand.value.trim();
  if (nameProblem(brandCheck, "Brand name")) {
    setError(fBrand, document.getElementById("errBrand"), nameProblem(brandCheck, "Brand name"));
    valid = false;
  }

  var doseNum = fDoseNum.value.trim();
  var doseUnit = fDoseUnit.value;
  if (doseNum && !(Number(doseNum) > 0)) {
    setError(fDoseNum, errDose, "Enter a dose greater than 0.");
    valid = false;
  } else if (doseNum && !doseUnit) {
    setError(fDoseUnit, errDose, "Pick the measurement (mg, mL, ...).");
    valid = false;
  } else if (!doseNum && doseUnit) {
    setError(fDoseNum, errDose, "Enter the dose amount.");
    valid = false;
  }

  var category = fCategory.value;
  if (!category) {
    setError(fCategory, document.getElementById("errCategory"), "Pick a category.");
    valid = false;
  }

  var levels = readLevels();
  if (
    levels.some(function (l) {
      return !(l.per >= 1) || Math.floor(l.per) !== l.per;
    })
  ) {
    setError(levelsEl, document.getElementById("errPackaging"), "Enter a whole number inside each package.");
    valid = false;
  }

  var price = fPrice.value.trim();
  if (price === "" || Number(price) < 0) {
    setError(fPrice, document.getElementById("errPrice"), "Enter a valid price.");
    valid = false;
  }

  var criticalRaw = fCriticalLevel.value.trim();
  if (criticalRaw !== "" && Number(criticalRaw) < 0) {
    setError(fCriticalLevel, document.getElementById("errCriticalLevel"), "Enter a valid critical level.");
    valid = false;
  }

  var warnRaw = fExpiryWarning.value.trim();
  if (warnRaw !== "" && !(Number(warnRaw) >= 1)) {
    setError(fExpiryWarning, document.getElementById("errWarn"), "Enter 1 or more days.");
    valid = false;
  }

  var openingQty = 0;
  if (!editingProduct) {
    var stockRaw = fStock.value.trim();
    if (stockRaw === "" || Number(stockRaw) < 0) {
      setError(fStock, document.getElementById("errStock"), "Enter a valid quantity.");
      valid = false;
    } else {
      openingQty = Number(stockRaw) * (Number(fStockUnit.value) || 1);
    }
    if (valid && openingQty > 0 && settings.inventory.requireExpiry && !fExpiry.value) {
      setError(fExpiry, document.getElementById("errExpiry"), "Expiry date is required.");
      valid = false;
    }
    var expProblem = expiryProblem(fExpiry.value);
    if (expProblem) {
      setError(fExpiry, document.getElementById("errExpiry"), expProblem);
      valid = false;
    }
  }

  if (!valid) {
    document.getElementById("formSummary").textContent = "Please fix the highlighted fields.";
    if (moreOptions.querySelector(".has-error")) moreOptions.open = true;
    var firstBad = form.querySelector(".has-error");
    if (firstBad) {
      if (firstBad.scrollIntoView) firstBad.scrollIntoView({ block: "center", behavior: "smooth" });
      var focusEl = firstBad.matches("input, select") ? firstBad : firstBad.querySelector("input, select");
      if (focusEl) focusEl.focus({ preventScroll: true });
    }
    return;
  }

  var strength = doseNum
    ? String(Number(doseNum)) + doseUnit
    : legacyStrength; // untouched old free-text strength is kept as is
  if (
    !MynelleConfirm.gate(form, {
      title: editingProduct ? "Save changes to this product?" : "Add this product to inventory?",
      details: [
        ["Product", name],
        ["Dose", strength],
        ["Category", fCategory.value],
        ["Price", fPrice.value ? MynelleStore.formatCurrency(fPrice.value) + " per " + fBaseUnit.value : ""],
        [
          "Opening stock",
          !editingProduct && openingQty > 0
            ? MynelleStore.formatQty(openingQty, fBaseUnit.value) + (fExpiry.value ? " \u00B7 exp " + fExpiry.value : "")
            : "",
        ],
      ],
      confirmText: editingProduct ? "Save changes" : "Add product",
      tone: "success",
    })
  )
    return;

  var record = {
    genericName: name,
    strength: strength,
    name: MynelleStore.composeName(name, strength),
    brand: fBrand.value.trim(),
    category: category,
    unit: fBaseUnit.value,
    packaging: levels,
    criticalLevel: criticalRaw === "" ? null : Number(criticalRaw),
    expiryWarningDays: warnRaw === "" ? null : Number(warnRaw),
    price: Number(price),
  };

  if (editingProduct) {
    MynelleStore.updateProduct(editingProduct.id, record);
  } else {
    record.id = fId.value.trim().toUpperCase();
    record.batches =
      openingQty > 0
        ? [{ lot: fLot.value.trim(), expiry: fExpiry.value || "", qty: openingQty, received: todayIso() }]
        : [];
    MynelleStore.addProduct(record);
  }

  var savedId = editingProduct ? editingProduct.id : record.id;
  var picOk = true;
  if (pendingPic === "") MynelleStore.removeProductImage(savedId);
  else if (pendingPic) picOk = MynelleStore.setProductImage(savedId, pendingPic);

  closeModal();
  document.dispatchEvent(new CustomEvent("mynelle:products-changed"));
  renderProducts();
  showToast(
    (editingProduct
      ? '"' + record.name + '" updated'
      : '"' + record.name + '" added to inventory') +
      (picOk ? "" : ", but the picture could not be saved (browser storage is full)")
  );
});

// ---------------------------------------------------------------------
// Manage stock: batches, receive, adjust, history
// ---------------------------------------------------------------------
var stockOverlay = document.getElementById("stockOverlay");
var stockProductId = null;
var receiveForm = document.getElementById("receiveForm");
var adjustForm = document.getElementById("adjustForm");
var rUnit = document.getElementById("rUnit");
var rQty = document.getElementById("rQty");
var rLot = document.getElementById("rLot");
var rExpiry = document.getElementById("rExpiry");
var aBatch = document.getElementById("aBatch");
var aQty = document.getElementById("aQty");
var aReason = document.getElementById("aReason");

function currentStockProduct() {
  return MynelleStore.getProducts().filter(function (p) {
    return p.id === stockProductId;
  })[0];
}

function expiryStatus(expiry, product) {
  var d = MynelleStore.daysUntil(expiry);
  if (d === null) return { tag: "green", text: "No expiry", sub: "" };
  if (d < 0) return { tag: "red", text: "Expired", sub: "Expired " + Math.abs(d) + (Math.abs(d) === 1 ? " day ago" : " days ago") };
  var win = MynelleStore.expiryWindowFor(product);
  if (d <= win) return { tag: "gold", text: "Expiring", sub: d === 0 ? "Expires today" : d + (d === 1 ? " day left" : " days left") };
  return { tag: "green", text: "OK", sub: d + " days left" };
}

function renderStock() {
  var p = currentStockProduct();
  if (!p) {
    closeStock();
    return;
  }
  var settings = MynelleStore.getSettings();
  var df = settings.general.dateFormat;
  document.getElementById("stockTitle").textContent = p.name + (p.brand ? " (" + p.brand + ")" : "");

  var sellable = MynelleStore.sellableStock(p);
  var expired = MynelleStore.expiredStock(p);
  var crumbs = MynelleStore.breakdown(p.stock, p);
  document.getElementById("stockSummary").innerHTML =
    '<div><span class="k">On hand</span><span class="v">' + esc(MynelleStore.formatQty(p.stock, p.unit)) + "</span>" +
    (crumbs ? '<span class="s">' + esc(crumbs) + "</span>" : "") + "</div>" +
    '<div><span class="k">Available to sell</span><span class="v">' + esc(MynelleStore.formatQty(sellable, p.unit)) + "</span>" +
    (expired ? '<span class="s">' + esc(MynelleStore.formatQty(expired, p.unit)) + " expired</span>" : "") + "</div>" +
    '<div><span class="k">Stock value</span><span class="v">' + esc(MynelleStore.formatCurrency(p.stock * p.price)) + "</span></div>";

  // Batches
  var bt = document.getElementById("batchTable");
  if (!p.batches.length) {
    bt.innerHTML = '<div class="empty-state"><p class="title">No stock on hand</p></div>';
  } else {
    bt.innerHTML =
      '<table class="stock-table"><thead><tr><th>Lot</th><th>Received</th><th>Expiry</th><th class="num">Quantity</th><th>Status</th></tr></thead><tbody>' +
      p.batches
        .map(function (b) {
          var st = expiryStatus(b.expiry, p);
          return (
            "<tr><td>" + esc(b.lot || "\u2014") + "</td>" +
            '<td class="muted">' + esc(b.received ? formatExpiry(b.received, df) : "\u2014") + "</td>" +
            '<td class="expiry-cell">' + esc(b.expiry ? formatExpiry(b.expiry, df) : "\u2014") + (st.sub ? '<span class="sub">' + esc(st.sub) + "</span>" : "") + "</td>" +
            '<td class="num">' + esc(MynelleStore.formatQty(b.qty, p.unit)) + "</td>" +
            '<td><span class="batch-tag ' + st.tag + '">' + st.text + "</span></td></tr>"
          );
        })
        .join("") +
      "</tbody></table>";
  }

  // Receive: unit choices
  var prevUnit = rUnit.value;
  rUnit.innerHTML = MynelleStore.unitOptions(p)
    .map(function (o) {
      return '<option value="' + o.mult + '">' + esc(pluralizeUnit(o.name, 2)) + "</option>";
    })
    .join("");
  if (prevUnit && Array.prototype.some.call(rUnit.options, function (o) { return o.value === prevUnit; })) rUnit.value = prevUnit;
  document.getElementById("rExpiryLabel").textContent = settings.inventory.requireExpiry ? "Expiry date *" : "Expiry date";
  updateReceiveTotal();

  // Adjust: batch choices
  aBatch.innerHTML = p.batches.length
    ? p.batches
        .map(function (b, i) {
          return (
            '<option value="' + i + '">' + esc((b.lot || "No lot") + ", " + (b.expiry ? "exp " + formatExpiry(b.expiry, df) : "no expiry") + ", " + MynelleStore.formatQty(b.qty, p.unit)) + "</option>"
          );
        })
        .join("")
    : '<option value="">No batches</option>';
  aBatch.disabled = !p.batches.length;
  aQty.disabled = !p.batches.length;
  adjustForm.querySelector('button[type="submit"]').disabled = !p.batches.length;
  syncAdjustQty();

  // History
  var log = MynelleStore.getStockLog(p.id, 40);
  var ht = document.getElementById("historyTable");
  var typeText = { receive: "Received", adjust: "Adjusted", sale: "Sold" };
  ht.innerHTML = log.length
    ? '<table class="stock-table"><thead><tr><th>Date and time</th><th>Type</th><th>Lot</th><th class="num">Change</th><th>Note</th></tr></thead><tbody>' +
      log
        .map(function (m) {
          return (
            '<tr><td class="muted">' + esc(MynelleStore.formatDateTime(m.at)) + "</td>" +
            "<td>" + esc(typeText[m.type] || m.type) + "</td>" +
            "<td>" + esc(m.lot || "\u2014") + "</td>" +
            '<td class="num">' + (m.qty > 0 ? "+" : "") + esc(m.qty) + "</td>" +
            '<td class="muted">' + esc(m.reason || "") + "</td></tr>"
          );
        })
        .join("") +
      "</tbody></table>"
    : '<div class="empty-state"><p class="title">No movements recorded yet</p></div>';
}

function syncAdjustQty() {
  var p = currentStockProduct();
  var b = p && p.batches[Number(aBatch.value)];
  aQty.value = b ? b.qty : "";
}

function updateReceiveTotal() {
  var p = currentStockProduct();
  var total = (Number(rQty.value) || 0) * (Number(rUnit.value) || 1);
  document.getElementById("rTotal").textContent = MynelleStore.formatQty(total, p ? p.unit : "");
}

function openStock(id, tab) {
  stockProductId = id;
  receiveForm.reset();
  clearErrors();
  renderStock();
  showStockTab(tab || "batches");
  stockOverlay.classList.add("open");
}

function closeStock() {
  stockOverlay.classList.remove("open");
  stockProductId = null;
}

function showStockTab(name) {
  stockOverlay.querySelectorAll(".stock-tabs button").forEach(function (b) {
    b.classList.toggle("active", b.dataset.tab === name);
    b.setAttribute("aria-selected", b.dataset.tab === name ? "true" : "false");
  });
  stockOverlay.querySelectorAll(".stock-pane").forEach(function (pane) {
    pane.hidden = pane.dataset.pane !== name;
  });
}

stockOverlay.querySelector(".stock-tabs").addEventListener("click", function (e) {
  var b = e.target.closest("button");
  if (b) showStockTab(b.dataset.tab);
});
document.getElementById("stockClose").addEventListener("click", closeStock);
stockOverlay.addEventListener("click", function (e) {
  if (e.target === stockOverlay) closeStock();
});
rQty.addEventListener("input", updateReceiveTotal);
rUnit.addEventListener("change", updateReceiveTotal);
aBatch.addEventListener("change", syncAdjustQty);

receiveForm.addEventListener("submit", function (e) {
  e.preventDefault();
  clearErrors();
  var settings = MynelleStore.getSettings();
  var qtyRaw = rQty.value.trim();
  var ok = true;
  if (qtyRaw === "" || !(Number(qtyRaw) > 0)) {
    setError(rQty, document.getElementById("errRQty"), "Enter a valid quantity.");
    ok = false;
  }
  if (settings.inventory.requireExpiry && !rExpiry.value) {
    setError(rExpiry, document.getElementById("errRExpiry"), "Expiry date is required.");
    ok = false;
  }
  var rProblem = expiryProblem(rExpiry.value);
  if (rProblem) {
    setError(rExpiry, document.getElementById("errRExpiry"), rProblem);
    ok = false;
  }
  if (!ok) return;
  var p = currentStockProduct();
  var qty = Number(qtyRaw) * (Number(rUnit.value) || 1);
  if (
    !MynelleConfirm.gate(receiveForm, {
      title: "Add this stock?",
      message: "The quantity will be added to the inventory right away.",
      details: [
        ["Product", p.name],
        ["Quantity", MynelleStore.formatQty(qty, p.unit)],
        ["Lot no.", rLot.value.trim()],
        ["Expiry", rExpiry.value],
      ],
      confirmText: "Add stock",
      tone: "success",
    })
  )
    return;
  MynelleStore.receiveStock(p.id, { qty: qty, lot: rLot.value, expiry: rExpiry.value });
  receiveForm.reset();
  document.dispatchEvent(new CustomEvent("mynelle:products-changed"));
  renderProducts();
  renderStock();
  showStockTab("batches");
  showToast(MynelleStore.formatQty(qty, p.unit) + " received");
});

adjustForm.addEventListener("submit", function (e) {
  e.preventDefault();
  clearErrors();
  var qtyRaw = aQty.value.trim();
  if (qtyRaw === "" || Number(qtyRaw) < 0) {
    setError(aQty, document.getElementById("errAQty"), "Enter a valid quantity.");
    return;
  }
  var p = currentStockProduct();
  if (
    !MynelleConfirm.gate(adjustForm, {
      title: "Adjust this batch?",
      message: "The batch quantity will be changed and the adjustment logged.",
      details: [
        ["Product", p.name],
        ["New quantity", MynelleStore.formatQty(Number(qtyRaw), p.unit)],
        ["Reason", aReason.value],
      ],
      confirmText: "Adjust stock",
      tone: "danger",
    })
  )
    return;
  MynelleStore.adjustBatch(p.id, Number(aBatch.value), Number(qtyRaw), aReason.value);
  document.dispatchEvent(new CustomEvent("mynelle:products-changed"));
  renderProducts();
  renderStock();
  showStockTab("batches");
  showToast("Stock adjusted");
});

// ---------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------
var toastEl = document.getElementById("toast");
var toastTimer = null;
function showToast(message, action) {
  toastEl.textContent = message;
  toastEl.classList.toggle("has-action", !!action);
  if (action) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "toast-action";
    btn.textContent = action.label;
    btn.addEventListener("click", function () {
      window.clearTimeout(toastTimer);
      toastEl.classList.remove("show");
      action.onClick();
    });
    toastEl.appendChild(btn);
  }
  toastEl.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(
    function () {
      toastEl.classList.remove("show");
    },
    action ? 5000 : 2400
  );
}

renderProducts();

// Stock changes made elsewhere (e.g. a sale at the POS) show up here live.
window.addEventListener("storage", function (e) {
  if (e.key !== MynelleStore.PRODUCTS_KEY) return;
  renderProducts();
  if (stockOverlay.classList.contains("open") && stockProductId) renderStock();
});
