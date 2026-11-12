// ---------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------
var settingsNav = document.getElementById("settingsNav");
settingsNav.addEventListener("click", function (e) {
  var btn = e.target.closest(".settings-tab");
  if (!btn) return;
  document.querySelectorAll(".settings-tab").forEach(function (el) {
    el.classList.remove("active");
  });
  btn.classList.add("active");

  var target = btn.dataset.tab;
  document.querySelectorAll(".settings-section").forEach(function (el) {
    el.hidden = el.dataset.section !== target;
  });
});

// ---------------------------------------------------------------------
// Segmented controls (theme / density) — applied live, saved with the rest
// ---------------------------------------------------------------------
function wireSegmented(fieldName, onChange) {
  var group = document.querySelector('.segmented[data-field="' + fieldName + '"]');
  group.addEventListener("click", function (e) {
    var opt = e.target.closest(".segmented-option");
    if (!opt) return;
    group.querySelectorAll(".segmented-option").forEach(function (el) {
      el.classList.remove("selected");
    });
    opt.classList.add("selected");
    onChange(opt.dataset.value);
  });
  return group;
}
function setSegmented(fieldName, value) {
  var group = document.querySelector('.segmented[data-field="' + fieldName + '"]');
  group.querySelectorAll(".segmented-option").forEach(function (el) {
    el.classList.toggle("selected", el.dataset.value === value);
  });
}

wireSegmented("theme", function (value) {
  MynelleStore.applyThemeAndDensity(
    Object.assign({}, MynelleStore.getSettings().general, { theme: value })
  );
});
wireSegmented("density", function (value) {
  MynelleStore.applyThemeAndDensity(
    Object.assign({}, MynelleStore.getSettings().general, { density: value })
  );
});

// ---------------------------------------------------------------------
// Load current settings into the form
// ---------------------------------------------------------------------
function loadForm() {
  var s = MynelleStore.getSettings();

  setSegmented("theme", s.general.theme);
  setSegmented("density", s.general.density);
  document.getElementById("gDateFormat").value = s.general.dateFormat;
  document.getElementById("gLowStockAlerts").checked = s.general.lowStockAlerts;
  document.getElementById("gExpiryAlerts").checked = s.general.expiryAlerts;

  document.getElementById("bName").value = s.business.name;
  document.getElementById("bAddress").value = s.business.address;
  document.getElementById("bContact").value = s.business.contact;
  document.getElementById("bLicense").value = s.business.license;

  document.getElementById("iCriticalLevel").value =
    s.inventory.criticalLevelUnits || s.inventory.lowStockThresholdPcs;
  document.getElementById("iCriticalAlerts").checked = s.general.lowStockAlerts;
  document.getElementById("iLowStockPackages").value = s.inventory.lowStockThresholdPackages;
  document.getElementById("iExpiryWindow").value = s.inventory.expiryWindowDays;
  document.getElementById("iDefaultUnit").value =
    s.inventory.defaultUnit === "pcs" ? "unit" : s.inventory.defaultUnit;
  document.getElementById("iRequireExpiry").checked = s.inventory.requireExpiry;
  document.getElementById("iDefaultSort").value = s.inventory.defaultSort;
  document.getElementById("iIdPrefix").value = s.inventory.idPrefix;
  document.getElementById("iIdDigits").value = s.inventory.idDigits;

  var prefixList = document.getElementById("idPrefixList");
  prefixList.innerHTML = "";
  MynelleStore.CATEGORIES.forEach(function (cat) {
    var row = document.createElement("label");
    row.className = "id-prefix-row";
    var name = document.createElement("span");
    name.textContent = cat;
    var input = document.createElement("input");
    input.type = "text";
    input.className = "settings-input id-prefix-input";
    input.maxLength = 6;
    input.autocomplete = "off";
    input.dataset.category = cat;
    input.placeholder = s.inventory.idPrefix;
    input.value = (s.inventory.idPrefixes && s.inventory.idPrefixes[cat]) || "";
    input.addEventListener("input", function () {
      input.value = MynelleStore.sanitizePrefix(input.value);
    });
    row.appendChild(name);
    row.appendChild(input);
    prefixList.appendChild(row);
  });
  var defaultPrefixInput = document.getElementById("iIdPrefix");
  defaultPrefixInput.addEventListener("input", function () {
    defaultPrefixInput.value = MynelleStore.sanitizePrefix(defaultPrefixInput.value);
    prefixList.querySelectorAll("input").forEach(function (el) {
      el.placeholder = defaultPrefixInput.value || "PRD";
    });
  });

  document.getElementById("pCurrency").value = s.pricing.currency;
  document.getElementById("pDecimals").value = String(s.pricing.decimals);
  document.getElementById("pVat").value = s.pricing.vat;
}
loadForm();

// ---------------------------------------------------------------------
// Save handlers
// ---------------------------------------------------------------------
function flashSaved(section) {
  var el = document.querySelector('.save-confirm[data-confirm="' + section + '"]');
  el.classList.add("show");
  window.setTimeout(function () {
    el.classList.remove("show");
  }, 1800);
}

document.querySelector('[data-save="general"]').addEventListener("click", function () {
  var theme = document.querySelector('.segmented[data-field="theme"] .selected').dataset.value;
  var density = document.querySelector('.segmented[data-field="density"] .selected').dataset.value;
  MynelleStore.saveSettingsSection("general", {
    theme: theme,
    density: density,
    dateFormat: document.getElementById("gDateFormat").value,
    lowStockAlerts: document.getElementById("gLowStockAlerts").checked,
    expiryAlerts: document.getElementById("gExpiryAlerts").checked,
  });
  flashSaved("general");
  document.dispatchEvent(new CustomEvent("mynelle:products-changed"));
  showToast("General settings saved");
});

document.querySelector('[data-save="business"]').addEventListener("click", function () {
  MynelleStore.saveSettingsSection("business", {
    name: document.getElementById("bName").value.trim(),
    address: document.getElementById("bAddress").value.trim(),
    contact: document.getElementById("bContact").value.trim(),
    license: document.getElementById("bLicense").value.trim(),
  });
  flashSaved("business");
  showToast("Business info saved");
});

// The same preference is shown in General and in Inventory & stock —
// keep the two switches in step so neither shows a stale value.
(function syncAlertSwitches() {
  var a = document.getElementById("gLowStockAlerts");
  var b = document.getElementById("iCriticalAlerts");
  a.addEventListener("change", function () {
    b.checked = a.checked;
  });
  b.addEventListener("change", function () {
    a.checked = b.checked;
  });
})();

document.querySelector('[data-save="inventory"]').addEventListener("click", function () {
  MynelleStore.saveSettingsSection("inventory", {
    criticalLevelUnits:
      Number(document.getElementById("iCriticalLevel").value) || 0,
    lowStockThresholdPcs:
      Number(document.getElementById("iCriticalLevel").value) || 0,
    lowStockThresholdPackages: Number(document.getElementById("iLowStockPackages").value) || 0,
    expiryWindowDays: Number(document.getElementById("iExpiryWindow").value) || 0,
    defaultUnit: document.getElementById("iDefaultUnit").value,
    requireExpiry: document.getElementById("iRequireExpiry").checked,
    defaultSort: document.getElementById("iDefaultSort").value,
    idPrefix: MynelleStore.sanitizePrefix(document.getElementById("iIdPrefix").value) || "PRD",
    idDigits: Math.min(10, Math.max(1, Number(document.getElementById("iIdDigits").value) || 4)),
    idPrefixes: (function () {
      var out = {};
      document.querySelectorAll("#idPrefixList input").forEach(function (el) {
        var v = MynelleStore.sanitizePrefix(el.value);
        if (v) out[el.dataset.category] = v;
      });
      return out;
    })(),
  });
  // The critical-level notification toggle lives with the other alert
  // switches in General, so it saves into that section.
  MynelleStore.saveSettingsSection("general", {
    lowStockAlerts: document.getElementById("iCriticalAlerts").checked,
  });
  flashSaved("inventory");
  document.dispatchEvent(new CustomEvent("mynelle:products-changed"));
  showToast("Inventory settings saved");
});

document.querySelector('[data-save="pricing"]').addEventListener("click", function () {
  MynelleStore.saveSettingsSection("pricing", {
    currency: document.getElementById("pCurrency").value.trim() || "\u20B1",
    decimals: Number(document.getElementById("pDecimals").value),
    vat: Number(document.getElementById("pVat").value) || 0,
  });
  flashSaved("pricing");
  showToast("Pricing saved");
});

// ---------------------------------------------------------------------
// Data: export / import / sample data / clear
// ---------------------------------------------------------------------
document.getElementById("btnExport").addEventListener("click", function () {
  var payload = {
    exportedAt: new Date().toISOString(),
    products: MynelleStore.getProducts(),
    sales: MynelleStore.getSales(),
  };
  var blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = "mynelle-export.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast("Data exported");
});

var fileImport = document.getElementById("fileImport");
document.getElementById("btnImport").addEventListener("click", function () {
  fileImport.click();
});
fileImport.addEventListener("change", function () {
  var file = fileImport.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function () {
    try {
      var data = JSON.parse(reader.result);
      var products = Array.isArray(data) ? data : data.products;
      var sales = Array.isArray(data) ? null : data.sales;
      if (!Array.isArray(products)) throw new Error("No products found in file.");
      MynelleConfirm.ask({
        title: "Import this data?",
        message: "This replaces your current products" + (Array.isArray(sales) ? " and sales" : "") + ".",
        details: [["Products", products.length], ["Sales", Array.isArray(sales) ? sales.length : ""]],
        confirmText: "Import",
        tone: "danger",
      }).then(function (yes) {
        if (!yes) return;
        MynelleStore.saveProducts(products);
        if (Array.isArray(sales)) {
          try {
            localStorage.setItem(MynelleStore.SALES_KEY, JSON.stringify(sales));
          } catch (e) {
            /* storage unavailable */
          }
        }
        showToast("Data imported");
      });
    } catch (err) {
      window.alert("Couldn't read that file. Choose a file exported from this app.");
    } finally {
      fileImport.value = "";
    }
  };
  reader.readAsText(file);
});

document.getElementById("btnSample").addEventListener("click", function () {
  MynelleConfirm.ask({
    title: "Load sample data?",
    message: "Your current products and sales will be replaced with sample data.",
    confirmText: "Load sample data",
    tone: "danger",
  }).then(function (yes) {
    if (!yes) return;
    var saved = 0;
    try {
      MynelleStore.seedSampleData();
      saved = MynelleStore.getProducts().length;
    } catch (err) {
      saved = 0;
    }
    if (!saved) {
      // The seed ran but nothing was kept: the browser is blocking site storage
      // (private/incognito mode, an in-app browser, or storage switched off).
      MynelleConfirm.ask({
        title: "Couldn't save the sample data",
        message:
          "Your browser isn't letting this site store data. Open the site in a normal (not private) tab in Chrome, Edge, Safari or Firefox, make sure cookies/site data are allowed, then try again.",
        confirmText: "OK",
        cancelText: "Close",
        tone: "danger",
      });
      return;
    }
    showToast("Sample data loaded");
    MynelleConfirm.ask({
      title: "Sample data loaded",
      message: saved + " products and their sales history are ready to explore.",
      confirmText: "View inventory",
      cancelText: "Stay here",
      tone: "success",
    }).then(function (go) {
      if (go) window.location.href = "inventory.html";
    });
  });
});

document.getElementById("btnClear").addEventListener("click", function () {
  MynelleConfirm.ask({
    title: "Delete everything?",
    message: "This permanently deletes every product, sale and setting on this device.",
    confirmText: "Delete everything",
    tone: "danger",
  }).then(function (yes) {
    if (!yes) return;
    MynelleStore.clearData(true);
    window.location.reload();
  });
});

// ---------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------
var toastEl = document.getElementById("toast");
var toastTimer = null;
function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(function () {
    toastEl.classList.remove("show");
  }, 2400);
}
