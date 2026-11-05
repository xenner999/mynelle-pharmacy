// Product images page: pick a picture per product, shrink it, store it.
var grid = document.getElementById("imgGrid");
var fileInput = document.getElementById("imgFile");
var msgEl = document.getElementById("imgMsg");
var summaryEl = document.getElementById("imgSummary");
var filterEl = document.getElementById("imgFilter");
var categoryEl = document.getElementById("imgCategory");
var searchInput = document.getElementById("searchInput");

var SIZE = 360; // saved pictures are SIZE x SIZE px (square crop)
var MAX_FILE = 15 * 1024 * 1024; // refuse absurdly large originals
var pendingId = null; // product the file dialog is currently for

function esc(s) {
  var d = document.createElement("div");
  d.innerText = s == null ? "" : s;
  return d.innerHTML;
}
function say(text, kind) {
  msgEl.textContent = text || "";
  msgEl.className = "img-msg" + (kind ? " " + kind : "");
}

var CAMERA =
  '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>';

function fillCategories() {
  var used = {};
  MynelleStore.getProducts().forEach(function (p) {
    used[p.category || "Others"] = true;
  });
  var names = Object.keys(used).sort();
  var keep = categoryEl.value || "All";
  categoryEl.innerHTML = ["All"]
    .concat(names)
    .map(function (c) {
      return '<option value="' + esc(c) + '">' + (c === "All" ? "All categories" : esc(c)) + "</option>";
    })
    .join("");
  categoryEl.value = names.indexOf(keep) !== -1 || keep === "All" ? keep : "All";
}

function render() {
  var products = MynelleStore.getProducts();
  var images = MynelleStore.getProductImages();
  var withCount = products.filter(function (p) {
    return images[p.id];
  }).length;
  summaryEl.innerHTML = "<strong>" + withCount + "</strong> of " + products.length + " products have a picture";

  var q = (searchInput.value || "").trim().toLowerCase();
  var mode = filterEl.value;
  var cat = categoryEl.value;
  var rows = products.filter(function (p) {
    if (mode === "with" && !images[p.id]) return false;
    if (mode === "without" && images[p.id]) return false;
    if (cat !== "All" && (p.category || "Others") !== cat) return false;
    if (q) {
      var hay = [p.name, p.brand, p.category, p.id, p.genericName].join(" ").toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  });

  if (!products.length) {
    grid.innerHTML = '<p class="img-empty">No products yet. Add products in Inventory first.</p>';
    return;
  }
  if (!rows.length) {
    grid.innerHTML = '<p class="img-empty">No products match.</p>';
    return;
  }
  grid.innerHTML =
    '<div class="img-head"><span>Photo</span><span>Product</span><span>Category</span><span>Action</span></div>' +
    rows
      .map(function (p) {
        var img = images[p.id];
        return (
          '<div class="img-row" data-id="' + esc(p.id) + '">' +
          '<button type="button" class="img-thumb' + (img ? " has" : "") + '" data-pick="' + esc(p.id) + '" aria-label="' + (img ? "Change" : "Add") + " photo for " + esc(p.name) + '">' +
          (img ? '<img src="' + img + '" alt="' + esc(p.name) + '" />' : '<span class="ph">' + CAMERA + "</span>") +
          "</button>" +
          '<span class="img-name">' + esc(p.name) + (p.brand ? '<span class="img-sub">' + esc(p.brand) + "</span>" : "") + "</span>" +
          '<span class="img-cat">' + esc(p.category || "Others") + "</span>" +
          '<span class="img-actions">' +
          '<button type="button" class="img-btn primary" data-pick="' + esc(p.id) + '">' + (img ? "Change" : "Upload") + "</button>" +
          (img ? '<button type="button" class="img-btn danger" data-remove="' + esc(p.id) + '">Remove</button>' : "") +
          "</span></div>"
        );
      })
      .join("");
}

function shrink(file) {
  return MynelleStore.imageFileToDataUrl(file, SIZE);
}

function saveFor(id, file) {
  if (!file) return;
  if (!/^image\//.test(file.type)) { say("Please choose an image file (JPG, PNG, WEBP...).", "err"); return; }
  if (file.size > MAX_FILE) { say("That picture is too large (over 15 MB). Choose a smaller one.", "err"); return; }
  var product = MynelleStore.getProducts().filter(function (p) { return p.id === id; })[0];
  if (!product) { say("That product no longer exists.", "err"); render(); return; }
  shrink(file)
    .then(function (dataUrl) {
      if (MynelleStore.setProductImage(id, dataUrl)) {
        say("Picture saved for " + product.name + ".", "ok");
      } else {
        say("Could not save: browser storage is full. Remove a few pictures and try again.", "err");
      }
      render();
    })
    .catch(function (e) { say(e.message, "err"); });
}

grid.addEventListener("click", function (e) {
  var pick = e.target.closest("[data-pick]");
  if (pick) {
    pendingId = pick.getAttribute("data-pick");
    fileInput.value = "";
    fileInput.click();
    return;
  }
  var rm = e.target.closest("[data-remove]");
  if (rm) {
    MynelleStore.removeProductImage(rm.getAttribute("data-remove"));
    say("Picture removed.", "ok");
    render();
  }
});
fileInput.addEventListener("change", function () {
  if (pendingId && fileInput.files && fileInput.files[0]) saveFor(pendingId, fileInput.files[0]);
});

// Drag a photo straight onto a product card.
grid.addEventListener("dragover", function (e) {
  var card = e.target.closest(".img-row");
  if (!card) return;
  e.preventDefault();
  card.classList.add("drag");
});
grid.addEventListener("dragleave", function (e) {
  var card = e.target.closest(".img-row");
  if (card && !card.contains(e.relatedTarget)) card.classList.remove("drag");
});
grid.addEventListener("drop", function (e) {
  var card = e.target.closest(".img-row");
  if (!card) return;
  e.preventDefault();
  card.classList.remove("drag");
  var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  saveFor(card.getAttribute("data-id"), f);
});
// Dropping outside a card must not navigate the browser to the file.
window.addEventListener("dragover", function (e) { e.preventDefault(); });
window.addEventListener("drop", function (e) { e.preventDefault(); });

filterEl.addEventListener("change", render);
categoryEl.addEventListener("change", render);
var t = null;
searchInput.addEventListener("input", function () {
  window.clearTimeout(t);
  t = window.setTimeout(render, 120);
});
window.addEventListener("storage", function (e) {
  if (e.key === MynelleStore.PRODUCTS_KEY) fillCategories();
  if (e.key === MynelleStore.PRODUCTS_KEY || e.key === MynelleStore.IMAGES_KEY) render();
});

fillCategories();
render();
