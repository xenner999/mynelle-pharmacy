// Shared store for settings, inventory products and sales.
// Data is persisted to localStorage; swap the get/save functions for API
// calls when a backend is added.
var MynelleStore = (function () {
  var SETTINGS_KEY = "mynelle_settings";
  var PRODUCTS_KEY = "mynelle_products";
  var SALES_KEY = "mynelle_sales";
  var SEEDED_KEY = "mynelle_seeded";
  var IMAGES_KEY = "mynelle_product_images";
  var DISMISSED_KEY = "mynelle_dismissed_alerts";

  var defaults = {
    general: {
      theme: "light", // "light" | "dark"
      density: "comfortable", // "comfortable" | "compact"
      dateFormat: "MM/DD/YYYY",
      lowStockAlerts: true,
      expiryAlerts: true,
    },
    business: {
      name: "",
      address: "",
      contact: "",
      license: "",
    },
    inventory: {
      // Default critical level, in base units of measurement. A product
      // can override this with its own criticalLevel.
      criticalLevelUnits: 10,
      lowStockThresholdPcs: 10,
      lowStockThresholdPackages: 1,
      expiryWindowDays: 180, // "expiring soon" = within half a year of the expiry date
      defaultUnit: "pcs",
      requireExpiry: false,
      defaultSort: "added", // newest added first
      // Product IDs look like PRD-0001. Each category can use its own prefix.
      idPrefix: "PRD",
      idDigits: 4,
      idPrefixes: {},
    },
    pricing: {
      currency: "\u20B1",
      decimals: 2,
      vat: 12,
    },
  };

  // Standard pharmacy inventory categories. Used by the Add product form
  // and the Inventory filter so stock is grouped the way a pharmacy
  // actually organises its shelves.
  var CATEGORIES = [
    "Analgesics & Antipyretics",
    "Antibiotics & Anti-infectives",
    "Antihistamines, Cough & Cold",
    "Cardiovascular & Hypertension",
    "Diabetes & Endocrine",
    "Gastrointestinal",
    "Respiratory & Asthma",
    "Dermatologicals (Topical)",
    "Ophthalmic & Otic",
    "Vitamins & Supplements",
    "Women's Health & Contraceptives",
    "First Aid & Wound Care",
    "Personal Care & Toiletries",
    "Baby & Infant Care",
    "Others",
  ];

  // Units of measurement (the base unit a product is counted/dispensed in),
  // kept separate from packaging (box / pack / bottle / strip).
  var UNITS = [
    "tablet",
    "capsule",
    "softgel",
    "sachet",
    "suppository",
    "ampoule",
    "vial",
    "syringe",
    "patch",
    "mL",
    "L",
    "g",
    "mg",
    "piece",
  ];

  // Measure units aren't counted, so they never get an "s".
  var MEASURE_UNITS = ["mL", "L", "g", "mg", "kg", "mcg"];

  function pluralizeUnit(unit, qty) {
    if (!unit) return "";
    if (MEASURE_UNITS.indexOf(unit) !== -1) return unit;
    if (Number(qty) === 1) return unit;
    if (unit === "box") return "boxes";
    if (/s$/.test(unit)) return unit;
    return unit + "s";
  }

  function formatQty(qty, unit) {
    var n = Number(qty) || 0;
    return n + " " + pluralizeUnit(unit || "piece", n);
  }

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function getSettings() {
    var out = clone(defaults);
    try {
      var raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        Object.keys(out).forEach(function (section) {
          if (saved[section]) {
            Object.assign(out[section], saved[section]);
          }
        });
        // The old default sort was A–Z; the default is now a fixed order.
        if (out.inventory.defaultSort === "name-asc") out.inventory.defaultSort = "added";
        // The old default was 20 days; the expiring category is now 6 months.
        if (!saved.inventory || saved.inventory.expiryWindowDays === undefined ||
            Number(saved.inventory.expiryWindowDays) === 20) {
          out.inventory.expiryWindowDays = 180;
        }
      }
    } catch (e) {
      /* ignore malformed storage */
    }
    return out;
  }

  function saveSettingsSection(section, values) {
    var all = getSettings();
    Object.assign(all[section], values);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(all));
    } catch (e) {
      /* storage unavailable */
    }
    if (section === "general") applyThemeAndDensity(all.general);
    return all;
  }

  function applyThemeAndDensity(general) {
    general = general || getSettings().general;
    document.documentElement.setAttribute("data-theme", general.theme);
    document.documentElement.setAttribute("data-density", general.density);
  }

  // ---------------------------------------------------------------------
  // Products: names, packaging and batches
  // ---------------------------------------------------------------------
  var DAY_MS = 24 * 60 * 60 * 1000;
  var STOCK_LOG_KEY = "mynelle_stock_log";
  var PACKAGE_TYPES = ["box", "pack", "bottle", "strip", "blister", "sachet", "carton", "tube", "vial"];

  function todayStart() {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  // Whole days from today to a YYYY-MM-DD date (negative = already past).
  function daysUntil(dateStr) {
    if (!dateStr) return null;
    var d = new Date(dateStr);
    if (isNaN(d)) return null;
    return Math.round((d - todayStart()) / DAY_MS);
  }

  var STRENGTH_TAIL = /^(.*?)\s+(\d[\d.,]*\s?(?:mg|g|mcg|mL|L|IU|%)(?:\/\d[\d.,]*\s?(?:mL|g|mg))?(?:\s?\d[\d.,]*\s?(?:mL|g))?)$/i;

  // "Paracetamol 500mg" -> ["Paracetamol", "500mg"]
  function splitName(name) {
    var m = STRENGTH_TAIL.exec(String(name || "").trim());
    return m ? [m[1], m[2]] : [String(name || "").trim(), ""];
  }

  function composeName(generic, strength) {
    var g = String(generic || "").trim();
    var st = String(strength || "").trim();
    return st ? g + " " + st : g;
  }

  // packaging: [{ name: "box", per: 10 }, { name: "strip", per: 10 }]
  // means 1 box = 10 strips and 1 strip = 10 base units (e.g. tablets).
  function packagingMultiplier(packaging, fromIndex) {
    var m = 1;
    for (var i = fromIndex; i < packaging.length; i++) m *= Number(packaging[i].per);
    return m;
  }

  // Ways to count a product, smallest to largest: [{ name, mult }]
  function unitOptions(product) {
    var opts = [{ name: product.unit, mult: 1 }];
    var pk = product.packaging || [];
    for (var i = pk.length - 1; i >= 0; i--) {
      opts.push({ name: pk[i].name, mult: packagingMultiplier(pk, i) });
    }
    return opts;
  }

  // 480 tablets -> "4 boxes, 8 strips" (largest packages first).
  function breakdown(qty, product) {
    var pk = product.packaging || [];
    var left = Number(qty) || 0;
    var parts = [];
    for (var i = 0; i < pk.length; i++) {
      var mult = packagingMultiplier(pk, i);
      var n = Math.floor(left / mult);
      if (n > 0) parts.push(n + " " + pluralizeUnit(pk[i].name, n));
      left -= n * mult;
    }
    if (parts.length && left > 0) parts.push(left + " " + pluralizeUnit(product.unit, left));
    return parts.join(", ");
  }

  function sortBatches(list) {
    return list.slice().sort(function (a, b) {
      return (a.expiry || "9999-99-99").localeCompare(b.expiry || "9999-99-99");
    });
  }

  // Keeps a product consistent: packaging and batches are the source of
  // truth; stock, expiry and the legacy package fields are derived.
  function normalizeProduct(p) {
    var out = Object.assign({}, p);

    if (out.genericName === undefined) {
      var parts = splitName(out.name);
      out.genericName = parts[0];
      out.strength = out.strength || parts[1];
    }
    out.strength = out.strength || "";
    out.archived = !!out.archived;
    out.name = composeName(out.genericName, out.strength) || out.name || "";

    if (!Array.isArray(out.packaging)) {
      out.packaging =
        out.packageUnit && Number(out.piecesPerPackage) > 0
          ? [{ name: out.packageUnit, per: Number(out.piecesPerPackage) }]
          : [];
    }
    out.packaging = out.packaging
      .filter(function (l) {
        return l && l.name && Number(l.per) > 0;
      })
      .map(function (l) {
        return { name: l.name, per: Number(l.per) };
      });
    out.packageUnit = out.packaging.length ? out.packaging[0].name : null;
    out.piecesPerPackage = out.packaging.length ? packagingMultiplier(out.packaging, 0) : null;
    out.packageQty = null;

    if (!Array.isArray(out.batches)) {
      out.batches =
        Number(out.stock) > 0
          ? [{ lot: "", expiry: out.expiry || "", qty: Number(out.stock), received: "" }]
          : [];
    }
    out.batches = sortBatches(
      out.batches
        .filter(function (b) {
          return b && Number(b.qty) > 0;
        })
        .map(function (b) {
          return {
            lot: b.lot || "",
            expiry: b.expiry || "",
            qty: Number(b.qty),
            received: b.received || "",
          };
        })
    );
    out.stock = out.batches.reduce(function (sum, b) {
      return sum + b.qty;
    }, 0);
    var dated = out.batches.filter(function (b) {
      return b.expiry;
    });
    out.expiry = dated.length ? dated[0].expiry : "";

    out.expiryWarningDays =
      out.expiryWarningDays === null || out.expiryWarningDays === undefined || out.expiryWarningDays === ""
        ? null
        : Number(out.expiryWarningDays);
    return out;
  }

  // Every product, archived ones included. Used by anything that reads, edits
  // and writes the whole list back, so archived products are never lost.
  function getAllProducts() {
    try {
      var raw = localStorage.getItem(PRODUCTS_KEY);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.map(normalizeProduct) : [];
    } catch (e) {
      return [];
    }
  }

  // Active products only. Archived products are hidden from the POS, alerts,
  // reports and the inventory list (see getArchivedProducts).
  function getProducts() {
    return getAllProducts().filter(function (p) {
      return !p.archived;
    });
  }
  function getArchivedProducts() {
    return getAllProducts().filter(function (p) {
      return p.archived;
    });
  }

  function saveProducts(list) {
    try {
      localStorage.setItem(PRODUCTS_KEY, JSON.stringify(list.map(normalizeProduct)));
    } catch (e) {
      /* storage unavailable */
    }
  }

  // Stock that can still be sold: batches that haven't expired.
  function sellableStock(product) {
    return product.batches.reduce(function (sum, b) {
      var d = daysUntil(b.expiry);
      return d !== null && d < 0 ? sum : sum + b.qty;
    }, 0);
  }

  function expiredStock(product) {
    return product.batches.reduce(function (sum, b) {
      var d = daysUntil(b.expiry);
      return d !== null && d < 0 ? sum + b.qty : sum;
    }, 0);
  }

  // Warning lead time: the product's own, otherwise the Settings default.
  // 180 -> "6 months", 20 -> "20 days"
  function windowLabel(days) {
    days = Number(days) || 0;
    return days >= 60 && days % 30 === 0 ? days / 30 + " months" : days + " days";
  }

  function expiryWindowFor(product) {
    var own = Number(product.expiryWarningDays);
    if (!isNaN(own) && own > 0 && product.expiryWarningDays !== null) return own;
    return Number(getSettings().inventory.expiryWindowDays) || 0;
  }

  // ---------------------------------------------------------------------
  // Stock movements
  // ---------------------------------------------------------------------
  function getStockLog(productId, limit) {
    var list = [];
    try {
      var raw = localStorage.getItem(STOCK_LOG_KEY);
      list = raw ? JSON.parse(raw) : [];
    } catch (e) {
      list = [];
    }
    if (productId) {
      list = list.filter(function (m) {
        return m.productId === productId;
      });
    }
    list = list.slice().reverse();
    return limit ? list.slice(0, limit) : list;
  }

  function logMovements(entries) {
    var list = [];
    try {
      var raw = localStorage.getItem(STOCK_LOG_KEY);
      list = raw ? JSON.parse(raw) : [];
    } catch (e) {
      list = [];
    }
    var at = new Date().toISOString();
    entries.forEach(function (m) {
      list.push(Object.assign({ at: at }, m));
    });
    if (list.length > 3000) list = list.slice(list.length - 3000);
    try {
      localStorage.setItem(STOCK_LOG_KEY, JSON.stringify(list));
    } catch (e) {
      /* storage unavailable */
    }
  }

  function findProduct(list, id) {
    return list.filter(function (p) {
      return p.id === id;
    })[0];
  }

  // Adds stock as a batch. qty is in the base unit. Same lot and expiry
  // are merged into one batch.
  function receiveStock(productId, info) {
    var list = getAllProducts();
    var p = findProduct(list, productId);
    var qty = Number(info.qty);
    if (!p) throw new Error("Product not found.");
    if (!(qty > 0)) throw new Error("Enter a valid quantity.");
    var lot = String(info.lot || "").trim();
    var expiry = info.expiry || "";
    var batch = p.batches.filter(function (b) {
      return lot && b.lot === lot && b.expiry === expiry;
    })[0];
    if (batch) batch.qty += qty;
    else
      p.batches.push({
        lot: lot,
        expiry: expiry,
        qty: qty,
        received: new Date().toISOString().slice(0, 10),
      });
    saveProducts(list);
    logMovements([
      { productId: productId, type: "receive", qty: qty, lot: lot, expiry: expiry, reason: info.reason || "Stock received" },
    ]);
    return findProduct(getAllProducts(), productId);
  }

  // Sets one batch to a counted quantity (0 removes it). The change is
  // logged with a reason.
  function adjustBatch(productId, batchIndex, newQty, reason) {
    var list = getAllProducts();
    var p = findProduct(list, productId);
    if (!p) throw new Error("Product not found.");
    var b = p.batches[batchIndex];
    if (!b) throw new Error("Batch not found.");
    var target = Number(newQty);
    if (isNaN(target) || target < 0) throw new Error("Enter a valid quantity.");
    var delta = target - b.qty;
    if (delta === 0) return p;
    var lot = b.lot;
    var expiry = b.expiry;
    b.qty = target;
    saveProducts(list);
    logMovements([
      { productId: productId, type: "adjust", qty: delta, lot: lot, expiry: expiry, reason: reason || "Count correction" },
    ]);
    return findProduct(getAllProducts(), productId);
  }

  function addProduct(product) {
    var list = getAllProducts();
    list.push(product);
    saveProducts(list);
    return list;
  }

  function updateProduct(id, patch) {
    var list = getAllProducts().map(function (p) {
      return p.id === id ? Object.assign({}, p, patch) : p;
    });
    saveProducts(list);
    return list;
  }

  function removeProduct(id) {
    var list = getAllProducts().filter(function (p) {
      return p.id !== id;
    });
    saveProducts(list);
    removeProductImage(id);
    return list;
  }

  // Archiving hides a product everywhere without deleting it: stock, batches,
  // price and past sales stay intact, and it can be restored at any time.
  function setArchived(id, archived) {
    var list = getAllProducts().map(function (p) {
      if (p.id !== id) return p;
      var next = Object.assign({}, p, { archived: archived });
      if (archived) next.archivedAt = new Date().toISOString();
      else delete next.archivedAt;
      return next;
    });
    saveProducts(list);
    return list;
  }
  function archiveProduct(id) {
    return setArchived(id, true);
  }
  function restoreProduct(id) {
    return setArchived(id, false);
  }

  function sanitizePrefix(value) {
    return String(value == null ? "" : value)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 6);
  }

  // Prefix used for a category: its own if set, otherwise the default.
  function prefixFor(category) {
    var inv = getSettings().inventory;
    var own = inv.idPrefixes && category ? sanitizePrefix(inv.idPrefixes[category]) : "";
    return own || sanitizePrefix(inv.idPrefix) || "PRD";
  }

  // Next free ID for a category, numbered separately for each prefix.
  function nextProductId(category) {
    var inv = getSettings().inventory;
    var prefix = prefixFor(category);
    var digits = Math.min(10, Math.max(1, Number(inv.idDigits) || 4));
    var pattern = new RegExp("^" + prefix + "-(\\d+)$");
    var max = 0;
    getAllProducts().forEach(function (p) {
      var m = pattern.exec(String(p.id));
      if (m && Number(m[1]) > max) max = Number(m[1]);
    });
    return prefix + "-" + String(max + 1).padStart(digits, "0");
  }

  function productIdExists(id, exceptId) {
    var target = String(id).toUpperCase();
    return getAllProducts().some(function (p) {
      return String(p.id).toUpperCase() === target && p.id !== exceptId;
    });
  }

  function formatCurrency(amount) {
    var pricing = getSettings().pricing;
    var n = Number(amount);
    if (isNaN(n)) n = 0;
    var fixed = Math.abs(n).toFixed(pricing.decimals);
    var parts = fixed.split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return (n < 0 ? "-" : "") + pricing.currency + parts.join(".");
  }

  // Critical level: at or below this, the product needs reordering.
  function criticalLevelFor(product) {
    var inv = getSettings().inventory;
    var own = Number(product.criticalLevel);
    if (!isNaN(own) && own > 0) return own;
    // No per-product level set — fall back to the defaults in Settings.
    if (product.piecesPerPackage && Number(product.piecesPerPackage) > 0) {
      return (
        Number(product.piecesPerPackage) * Number(inv.lowStockThresholdPackages)
      );
    }
    return Number(inv.criticalLevelUnits || inv.lowStockThresholdPcs);
  }

  function isLowStock(product) {
    return Number(product.stock) <= criticalLevelFor(product);
  }

  function isExpiringSoon(product) {
    var window = expiryWindowFor(product);
    return product.batches.some(function (b) {
      var d = daysUntil(b.expiry);
      return d !== null && d <= window;
    });
  }

  // ---------------------------------------------------------------------
  // Sales
  // ---------------------------------------------------------------------
  function getSales() {
    try {
      var raw = localStorage.getItem(SALES_KEY);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  function saveSales(list) {
    try {
      localStorage.setItem(SALES_KEY, JSON.stringify(list));
    } catch (e) {
      /* storage unavailable */
    }
  }

  function nextSaleId(list) {
    var max = 0;
    list.forEach(function (s) {
      var n = parseInt(String(s.id).replace(/\D/g, ""), 10);
      if (!isNaN(n) && n > max) max = n;
    });
    return "TXN-" + String(max + 1).padStart(6, "0");
  }

  // Records a sale and deducts the sold quantities from stock, taking
  // from the batch that expires first and never from expired batches.
  // items: [{ productId, qty }]. Throws if a product is missing or short.
  // extra (optional, from the POS): { discount, vat, tendered, change, notes, cashier }
  function recordSale(items, payment, extra) {
    var products = getAllProducts();
    var picked = items.map(function (item) {
      var p = findProduct(products, item.productId);
      var qty = Number(item.qty);
      if (!p || p.archived) throw new Error("Product not found.");
      if (!(qty > 0)) throw new Error("Enter a valid quantity.");
      if (qty > sellableStock(p)) {
        throw new Error(
          "Not enough in-date stock for " + p.name + (expiredStock(p) ? " (expired stock can't be sold)." : ".")
        );
      }
      var need = qty;
      var lots = [];
      p.batches.forEach(function (b) {
        var d = daysUntil(b.expiry);
        if (need <= 0 || (d !== null && d < 0)) return;
        var take = Math.min(b.qty, need);
        b.qty -= take;
        need -= take;
        lots.push({ lot: b.lot, expiry: b.expiry, qty: take });
      });
      return { product: p, qty: qty, lots: lots };
    });
    saveProducts(products);

    var list = getSales();
    var sale = {
      id: nextSaleId(list),
      at: new Date().toISOString(),
      payment: payment || "Cash",
      items: picked.map(function (l) {
        return {
          productId: l.product.id,
          name: l.product.name,
          qty: l.qty,
          price: Number(l.product.price),
          lots: l.lots,
        };
      }),
    };
    if (extra) {
      sale.discount = Math.max(0, Number(extra.discount) || 0);
      sale.vat = Math.max(0, Number(extra.vat) || 0);
      sale.tendered = Number(extra.tendered) || 0;
      sale.change = Number(extra.change) || 0;
      sale.notes = extra.notes || "";
      sale.cashier = extra.cashier || "";
      sale.cashierId = extra.cashierId || ""; // lets each cashier see only their own numbers
      sale.source = "pos";
    }
    sale.total = saleTotal(sale);
    list.push(sale);
    saveSales(list);

    var moves = [];
    picked.forEach(function (l) {
      l.lots.forEach(function (x) {
        moves.push({ productId: l.product.id, type: "sale", qty: -x.qty, lot: x.lot, expiry: x.expiry, reason: sale.id });
      });
    });
    logMovements(moves);
    return sale;
  }

  // Items total less any discount given at the till. Prices are VAT-inclusive,
  // so VAT is not added on top (sale.vat is only the portion already inside).
  function saleTotal(sale) {
    var gross = sale.items.reduce(function (sum, i) {
      return sum + i.qty * i.price;
    }, 0);
    return Math.max(0, gross - (Number(sale.discount) || 0));
  }

  function saleQty(sale) {
    return sale.items.reduce(function (sum, i) {
      return sum + i.qty;
    }, 0);
  }

  // Start of a named reporting period, as a Date.
  function periodStart(label) {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    if (label === "Today") return d;
    if (label === "This week") {
      var day = d.getDay(); // 0 = Sunday
      d.setDate(d.getDate() - ((day + 6) % 7)); // back to Monday
      return d;
    }
    if (label === "This month") {
      d.setDate(1);
      return d;
    }
    if (label === "This year") {
      d.setMonth(0, 1);
      return d;
    }
    return new Date(0); // All time
  }

  function salesIn(label) {
    var from = periodStart(label).getTime();
    return getSales().filter(function (s) {
      return new Date(s.at).getTime() >= from;
    });
  }

  function formatDateTime(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return "\u2014";
    var fmt = getSettings().general.dateFormat;
    var dd = String(d.getDate()).padStart(2, "0");
    var mm = String(d.getMonth() + 1).padStart(2, "0");
    var yy = d.getFullYear();
    var date =
      fmt === "DD/MM/YYYY"
        ? dd + "/" + mm + "/" + yy
        : fmt === "YYYY-MM-DD"
        ? yy + "-" + mm + "-" + dd
        : mm + "/" + dd + "/" + yy;
    var h = d.getHours();
    var ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    var min = String(d.getMinutes()).padStart(2, "0");
    return date + ", " + h + ":" + min + " " + ampm;
  }

  // ---------------------------------------------------------------------
  // Sample data (first run only) and reset
  // ---------------------------------------------------------------------
  // [name, brand, category, unit, stock, price, expiry in days (null = none),
  //  critical level, pieces per box (null = sold loose), popularity weight]
  var SAMPLE_PRODUCTS = [
    ["Paracetamol 500mg", "Biogesic", "Analgesics & Antipyretics", "tablet", 480, 3.5, 410, 100, 100, 12],
    ["Mefenamic Acid 500mg", "Ponstan", "Analgesics & Antipyretics", "capsule", 36, 9, 220, 60, null, 6],
    ["Ibuprofen 400mg", "Medicol", "Analgesics & Antipyretics", "tablet", 210, 7, 16, 50, null, 6],
    ["Amoxicillin 500mg", "Amoxil", "Antibiotics & Anti-infectives", "capsule", 320, 6.5, 300, 100, 100, 8],
    ["Azithromycin 500mg", "Zithromax", "Antibiotics & Anti-infectives", "tablet", 24, 85, 540, 30, null, 2],
    ["Cefalexin 500mg", "", "Antibiotics & Anti-infectives", "capsule", 140, 14, 365, 40, null, 3],
    ["Cetirizine 10mg", "Virlix", "Antihistamines, Cough & Cold", "tablet", 260, 8, 13, 60, null, 7],
    ["Loratadine 10mg", "Claritin", "Antihistamines, Cough & Cold", "tablet", 140, 12, 380, 40, null, 4],
    ["Paracetamol + Phenylephrine + Chlorphenamine", "Neozep", "Antihistamines, Cough & Cold", "tablet", 0, 6.5, 200, 80, null, 9],
    ["Carbocisteine 500mg", "Solmux", "Antihistamines, Cough & Cold", "capsule", 190, 14, 330, 50, null, 5],
    ["Ambroxol Syrup 15mg/5mL", "Mucosolvan", "Antihistamines, Cough & Cold", "piece", 9, 165, -6, 6, null, 1],
    ["Losartan 50mg", "Cozaar", "Cardiovascular & Hypertension", "tablet", 400, 11.5, 480, 120, 100, 8],
    ["Amlodipine 5mg", "Norvasc", "Cardiovascular & Hypertension", "tablet", 15, 9.5, 11, 60, null, 5],
    ["Simvastatin 20mg", "Zocor", "Cardiovascular & Hypertension", "tablet", 200, 9, 420, 60, null, 3],
    ["Metformin 500mg", "Glucophage", "Diabetes & Endocrine", "tablet", 520, 4.5, 450, 120, 100, 8],
    ["Glimepiride 2mg", "Amaryl", "Diabetes & Endocrine", "tablet", 90, 16, 290, 30, null, 3],
    ["Omeprazole 20mg", "Losec", "Gastrointestinal", "capsule", 240, 8.5, 270, 60, null, 6],
    ["Loperamide 2mg", "Diatabs", "Gastrointestinal", "capsule", 70, 7, 9, 30, null, 4],
    ["Oral Rehydration Salts", "Hydrite", "Gastrointestinal", "sachet", 60, 14, 600, 20, null, 3],
    ["Salbutamol Inhaler", "Ventolin", "Respiratory & Asthma", "piece", 12, 310, 400, 6, null, 1],
    ["Hydrocortisone 1% Cream", "", "Dermatologicals (Topical)", "piece", 28, 95, 500, 8, null, 2],
    ["Mupirocin Ointment", "Bactroban", "Dermatologicals (Topical)", "piece", 4, 285, 330, 6, null, 1],
    ["Povidone-Iodine Solution", "Betadine", "First Aid & Wound Care", "piece", 45, 78, 700, 12, null, 3],
    ["Isopropyl Alcohol 70% 500mL", "Green Cross", "First Aid & Wound Care", "piece", 66, 95, 800, 15, null, 4],
    ["Cotton Balls 100g", "", "First Aid & Wound Care", "piece", 50, 38, null, 12, null, 2],
    ["Ascorbic Acid 500mg", "Cecon", "Vitamins & Supplements", "tablet", 600, 3, 390, 150, 100, 10],
    ["Multivitamins + Minerals", "Enervon", "Vitamins & Supplements", "tablet", 360, 6.5, 440, 100, null, 7],
    ["Ferrous Sulfate + Folic Acid", "Iberet", "Vitamins & Supplements", "tablet", 120, 9, 310, 40, null, 3],
    ["Combined Oral Contraceptive", "Trust", "Women's Health & Contraceptives", "piece", 40, 55, 520, 12, null, 3],
    ["Baby Powder 200g", "Johnson's", "Baby & Infant Care", "piece", 18, 125, 700, 6, null, 1],
    ["Dexamethasone 0.5mg", "", "Others", "tablet", 0, 5, 260, 40, null, 1],
  ];

  function seedSampleData() {
    var rand = (function (seed) {
      return function () {
        seed |= 0;
        seed = (seed + 0x6d2b79f5) | 0;
        var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    })(20260);

    function pad(n) {
      return String(n).padStart(2, "0");
    }
    function ymd(d) {
      return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
    }

    var today = new Date();
    function dayOffset(n) {
      return ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() + n));
    }

    // Nested packaging per product (largest first), by name.
    var PACKS = {
      "Paracetamol 500mg": [["box", 10], ["strip", 10]],
      "Amoxicillin 500mg": [["box", 10], ["blister", 10]],
      "Cefalexin 500mg": [["box", 10], ["blister", 10]],
      "Cetirizine 10mg": [["box", 10], ["strip", 10]],
      "Loratadine 10mg": [["box", 10], ["strip", 10]],
      "Losartan 50mg": [["box", 10], ["strip", 10]],
      "Metformin 500mg": [["box", 10], ["strip", 10]],
      "Omeprazole 20mg": [["box", 10], ["blister", 10]],
      "Ascorbic Acid 500mg": [["box", 10], ["strip", 10]],
      "Multivitamins + Minerals": [["box", 10], ["strip", 10]],
      "Oral Rehydration Salts": [["box", 20]],
    };
    // Name and strength kept separate; only exceptions to the automatic split.
    var NAME_SPLIT = {
      "Hydrocortisone 1% Cream": ["Hydrocortisone Cream", "1%"],
      "Isopropyl Alcohol 70% 500mL": ["Isopropyl Alcohol", "70%, 500mL"],
    };
    var WARN_DAYS = {
      "Antibiotics & Anti-infectives": 45,
      "Cardiovascular & Hypertension": 60,
      "Diabetes & Endocrine": 60,
      "Vitamins & Supplements": 30,
    };

    var products = SAMPLE_PRODUCTS.map(function (r, i) {
      var id = "PRD-" + String(i + 1).padStart(4, "0");
      var split = NAME_SPLIT[r[0]] || splitName(r[0]);
      var stock = r[4];
      var batches = [];
      if (stock > 0) {
        var offset = r[6];
        if (offset === null) {
          batches.push({ lot: "L26" + id.slice(-3) + "A", expiry: "", qty: stock, received: dayOffset(-45) });
        } else if (offset < 0 || stock < 20) {
          batches.push({ lot: "L26" + id.slice(-3) + "A", expiry: dayOffset(offset), qty: stock, received: dayOffset(-120) });
        } else {
          // An older batch (expires first) and a newer one.
          var older = Math.max(1, Math.round(stock * 0.35));
          batches.push({ lot: "L25" + id.slice(-3) + "A", expiry: dayOffset(offset), qty: older, received: dayOffset(-120) });
          batches.push({ lot: "L26" + id.slice(-3) + "B", expiry: dayOffset(offset + 150), qty: stock - older, received: dayOffset(-25) });
        }
      }
      return {
        id: id,
        genericName: split[0],
        strength: split[1],
        name: composeName(split[0], split[1]),
        brand: r[1],
        category: r[2],
        unit: r[3],
        packaging: (PACKS[r[0]] || []).map(function (l) {
          return { name: l[0], per: l[1] };
        }),
        batches: batches,
        stock: stock,
        criticalLevel: r[7],
        expiryWarningDays: WARN_DAYS[r[2]] || null,
        price: r[5],
      };
    });

    // Weighted pick so fast movers sell more often.
    var pool = [];
    SAMPLE_PRODUCTS.forEach(function (r, i) {
      if (products[i].stock === 0) return;
      for (var k = 0; k < r[9]; k++) pool.push(i);
    });
    var payments = ["Cash", "Cash", "Cash", "Cash", "Cash", "Cash", "Cash", "GCash", "GCash", "GCash"];

    var sales = [];
    var now = new Date();
    for (var back = 60; back >= 0; back--) {
      var day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
      var weekend = day.getDay() === 0 || day.getDay() === 6;
      var count = Math.round((weekend ? 5 : 8) + rand() * (weekend ? 5 : 7));
      var times = [];
      for (var c = 0; c < count; c++) {
        var minutes = 8 * 60 + Math.floor(rand() * 12 * 60); // 8:00 - 20:00
        var stamp = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, minutes);
        if (stamp.getTime() <= now.getTime()) times.push(stamp);
      }
      times.sort(function (a, b) {
        return a - b;
      });
      times.forEach(function (stamp) {
        var lineCount = 1 + Math.floor(rand() * 3);
        var chosen = {};
        var items = [];
        for (var l = 0; l < lineCount; l++) {
          var idx = pool[Math.floor(rand() * pool.length)];
          if (chosen[idx]) continue;
          chosen[idx] = true;
          var p = products[idx];
          var qty =
            p.unit === "tablet" || p.unit === "capsule"
              ? 2 + Math.floor(rand() * 19)
              : 1 + Math.floor(rand() * 2);
          items.push({ productId: p.id, name: p.name, qty: qty, price: p.price });
        }
        var sale = {
          id: "TXN-" + String(sales.length + 1).padStart(6, "0"),
          at: stamp.toISOString(),
          payment: payments[Math.floor(rand() * payments.length)],
          items: items,
        };
        sale.total = saleTotal(sale);
        sales.push(sale);
      });
    }

    saveProducts(products);
    saveSales(sales);
    try {
      localStorage.removeItem(STOCK_LOG_KEY);
      localStorage.setItem(SEEDED_KEY, "1");
    } catch (e) {
      /* storage unavailable */
    }
  }

  // Reads a picture file, center-crops it to a square, shrinks it and returns
  // a Promise of a small JPEG data URL (about 10-40 KB).
  function imageFileToDataUrl(file, size) {
    size = size || 360;
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var side = Math.min(img.naturalWidth, img.naturalHeight);
        var out = Math.min(size, side);
        var c = document.createElement("canvas");
        c.width = c.height = out;
        var ctx = c.getContext("2d");
        ctx.fillStyle = "#ffffff"; // flatten transparent PNGs onto white
        ctx.fillRect(0, 0, out, out);
        ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, out, out);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("That file could not be read as a picture."));
      };
      img.src = url;
    });
  }

  // ---- Product pictures ----
  // Kept in their own key ({ productId: dataUrl }) so the big image strings are
  // not re-parsed every time the product list is read.
  function getProductImages() {
    try {
      var raw = localStorage.getItem(IMAGES_KEY);
      var map = raw ? JSON.parse(raw) : {};
      return map && typeof map === "object" && !Array.isArray(map) ? map : {};
    } catch (e) {
      return {};
    }
  }
  function getProductImage(productId) {
    return getProductImages()[productId] || "";
  }
  // Returns true when saved, false when the browser storage is full/unavailable.
  function setProductImage(productId, dataUrl) {
    var map = getProductImages();
    map[productId] = dataUrl;
    try {
      localStorage.setItem(IMAGES_KEY, JSON.stringify(map));
      return true;
    } catch (e) {
      return false;
    }
  }
  function removeProductImage(productId) {
    var map = getProductImages();
    if (!(productId in map)) return;
    delete map[productId];
    try {
      localStorage.setItem(IMAGES_KEY, JSON.stringify(map));
    } catch (e) {
      /* storage unavailable */
    }
  }

  // Removes products, sales and dismissed alerts. Settings are kept unless
  // includeSettings is true. The seeded flag stays set so cleared data is
  // not reloaded automatically.
  function clearData(includeSettings) {
    try {
      localStorage.removeItem(PRODUCTS_KEY);
      localStorage.removeItem(SALES_KEY);
      localStorage.removeItem(DISMISSED_KEY);
      localStorage.removeItem(STOCK_LOG_KEY);
      localStorage.removeItem(IMAGES_KEY);
      localStorage.removeItem("mynelle_orders");
      localStorage.setItem(SEEDED_KEY, "1");
      if (includeSettings) localStorage.removeItem(SETTINGS_KEY);
    } catch (e) {
      /* storage unavailable */
    }
  }

  // The app now starts EMPTY: no demo products or sales are loaded on first
  // run. (The sample data lives in database/mynelle_database.sql, and can
  // still be loaded on a device from Settings > "Load sample data".)

  return {
    getSettings: getSettings,
    saveSettingsSection: saveSettingsSection,
    applyThemeAndDensity: applyThemeAndDensity,
    getProducts: getProducts,
    getAllProducts: getAllProducts,
    getArchivedProducts: getArchivedProducts,
    archiveProduct: archiveProduct,
    restoreProduct: restoreProduct,
    imageFileToDataUrl: imageFileToDataUrl,
    saveProducts: saveProducts,
    addProduct: addProduct,
    updateProduct: updateProduct,
    receiveStock: receiveStock,
    adjustBatch: adjustBatch,
    getStockLog: getStockLog,
    windowLabel: windowLabel,
    sellableStock: sellableStock,
    expiredStock: expiredStock,
    expiryWindowFor: expiryWindowFor,
    daysUntil: daysUntil,
    splitName: splitName,
    composeName: composeName,
    unitOptions: unitOptions,
    breakdown: breakdown,
    packagingMultiplier: packagingMultiplier,
    normalizeProduct: normalizeProduct,
    PACKAGE_TYPES: PACKAGE_TYPES,
    removeProduct: removeProduct,
    nextProductId: nextProductId,
    productIdExists: productIdExists,
    prefixFor: prefixFor,
    sanitizePrefix: sanitizePrefix,
    formatCurrency: formatCurrency,
    isLowStock: isLowStock,
    criticalLevelFor: criticalLevelFor,
    pluralizeUnit: pluralizeUnit,
    formatQty: formatQty,
    CATEGORIES: CATEGORIES,
    UNITS: UNITS,
    isExpiringSoon: isExpiringSoon,
    getSales: getSales,
    recordSale: recordSale,
    saleTotal: saleTotal,
    saleQty: saleQty,
    salesIn: salesIn,
    periodStart: periodStart,
    formatDateTime: formatDateTime,
    seedSampleData: seedSampleData,
    clearData: clearData,
    getProductImages: getProductImages,
    getProductImage: getProductImage,
    setProductImage: setProductImage,
    removeProductImage: removeProductImage,
    IMAGES_KEY: IMAGES_KEY,
    SETTINGS_KEY: SETTINGS_KEY,
    PRODUCTS_KEY: PRODUCTS_KEY,
    SALES_KEY: SALES_KEY,
  };
})();
