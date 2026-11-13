// Purchase orders (restocking from suppliers), tied into the rest of the system:
//   - suggestions come from stock levels (low / out of stock) and sales speed
//   - receiving an order adds the stock to the product (new batch + stock log)
//   - open orders count as "incoming" so Analytics and Alerts don't ask for the same restock twice
// Needs settings-store.js (MynelleStore). Stored in localStorage under mynelle_orders.
var Orders = (function () {
  "use strict";
  var KEY = "mynelle_orders";
  var DAY = 24 * 60 * 60 * 1000;
  var COVER_DAYS = 21;  // order enough for about 3 weeks of sales
  var TIGHT_DAYS = 14;  // suggest a reorder when stock covers less than this
  var STATUSES = ["draft", "ordered", "received", "cancelled"];
  var S = MynelleStore;

  function read() {
    try { var l = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(l) ? l : []; }
    catch (e) { return []; }
  }
  function write(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { /* storage unavailable */ }
  }
  function getOrders() {
    return read().sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
  }
  function getOrder(id) { return read().filter(function (o) { return o.id === id; })[0] || null; }
  function nextId() {
    var max = 0;
    read().forEach(function (o) { var n = parseInt(String(o.id).replace(/\D/g, ""), 10); if (n > max) max = n; });
    return "PO-" + String(max + 1).padStart(4, "0");
  }
  function cleanLines(lines) {
    var byProduct = {};
    (lines || []).forEach(function (l) {
      var qty = Math.floor(Number(l.qty));
      if (!l.productId || !(qty > 0)) return;
      var cost = Math.max(0, Number(l.unitCost) || 0);
      var cur = byProduct[l.productId];
      if (cur) { cur.qty += qty; cur.unitCost = cost || cur.unitCost; return; } // same product twice -> one line
      byProduct[l.productId] = {
        productId: l.productId, name: l.name || "", unit: l.unit || "piece",
        qty: qty, unitCost: cost, receivedQty: Math.max(0, Number(l.receivedQty) || 0),
      };
    });
    return Object.keys(byProduct).map(function (k) { return byProduct[k]; });
  }
  function creator() {
    try { var s = MynelleAuth.getSession(); return s && s.account ? s.account.fullName || "" : ""; } catch (e) { return ""; }
  }

  function create(info) {
    var lines = cleanLines(info.lines);
    if (!lines.length) throw new Error("Add at least one product with a quantity.");
    var list = read();
    var o = {
      id: nextId(), supplier: String(info.supplier || "").trim(), status: "draft",
      createdAt: new Date().toISOString(), orderedAt: null, receivedAt: null,
      expected: info.expected || "", notes: String(info.notes || "").trim(), createdBy: creator(), lines: lines,
    };
    list.push(o);
    write(list);
    return o;
  }
  function update(id, patch) {
    var list = read();
    var o = list.filter(function (x) { return x.id === id; })[0];
    if (!o) throw new Error("Order not found.");
    if (o.status !== "draft" && (patch.lines)) throw new Error("Only a draft can have its items changed.");
    if (patch.lines) {
      var lines = cleanLines(patch.lines);
      if (!lines.length) throw new Error("Add at least one product with a quantity.");
      o.lines = lines;
    }
    ["supplier", "expected", "notes"].forEach(function (k) { if (patch[k] !== undefined) o[k] = String(patch[k] || "").trim(); });
    write(list);
    return o;
  }
  function place(id) {
    var list = read();
    var o = list.filter(function (x) { return x.id === id; })[0];
    if (!o) throw new Error("Order not found.");
    if (o.status !== "draft") throw new Error("Only a draft can be placed.");
    if (!o.supplier) throw new Error("Enter the supplier before placing the order.");
    o.status = "ordered";
    o.orderedAt = new Date().toISOString();
    write(list);
    return o;
  }
  function cancel(id) {
    var list = read();
    var o = list.filter(function (x) { return x.id === id; })[0];
    if (!o) throw new Error("Order not found.");
    if (o.status === "received") throw new Error("A received order can't be cancelled.");
    o.status = "cancelled";
    write(list);
    return o;
  }
  // Change an order's status directly (any status -> any status).
  // This only edits the order record. It never adds or removes inventory stock;
  // use receive() to book delivered goods into stock.
  function setStatus(id, status) {
    if (STATUSES.indexOf(status) === -1) throw new Error("Unknown status.");
    var list = read();
    var o = list.filter(function (x) { return x.id === id; })[0];
    if (!o) throw new Error("Order not found.");
    if (o.status === status) return o;
    var now = new Date().toISOString();
    if (status === "draft") {
      o.orderedAt = null; o.receivedAt = null;
    } else if (status === "ordered") {
      if (!o.supplier) throw new Error("Enter the supplier before placing the order.");
      o.orderedAt = o.orderedAt || now; o.receivedAt = null;
    } else if (status === "received") {
      o.orderedAt = o.orderedAt || now; o.receivedAt = o.receivedAt || now;
      o.lines.forEach(function (l) { l.receivedQty = l.qty; });
    }
    o.status = status;
    write(list);
    return o;
  }
  function remove(id) {
    var list = read();
    var o = list.filter(function (x) { return x.id === id; })[0];
    if (!o) return;
    if (o.status !== "draft" && o.status !== "cancelled") throw new Error("Cancel the order first.");
    write(list.filter(function (x) { return x.id !== id; }));
  }

  // receipts: [{ index, qty, lot, expiry }] -> adds stock to each product
  function receive(id, receipts) {
    var list = read();
    var o = list.filter(function (x) { return x.id === id; })[0];
    if (!o) throw new Error("Order not found.");
    if (o.status !== "ordered") throw new Error("Only an order that was placed can be received.");
    var todo = [];
    (receipts || []).forEach(function (r) {
      var line = o.lines[r.index];
      var qty = Math.floor(Number(r.qty));
      if (!line || !(qty > 0)) return;
      var left = line.qty - line.receivedQty;
      if (qty > left) throw new Error(line.name + ": only " + left + " left to receive.");
      if (!r.expiry) throw new Error(line.name + ": enter the expiry date of what arrived.");
      todo.push({ line: line, qty: qty, lot: r.lot, expiry: r.expiry });
    });
    if (!todo.length) throw new Error("Enter a quantity for at least one item.");
    todo.forEach(function (t) {
      S.receiveStock(t.line.productId, { qty: t.qty, lot: t.lot, expiry: t.expiry, reason: "Received on order " + o.id });
      t.line.receivedQty += t.qty;
    });
    var done = o.lines.every(function (l) { return l.receivedQty >= l.qty; });
    if (done) { o.status = "received"; o.receivedAt = new Date().toISOString(); }
    write(list);
    return o;
  }

  // ---- numbers ---------------------------------------------------------
  function total(o) {
    return o.lines.reduce(function (a, l) { return a + l.qty * l.unitCost; }, 0);
  }
  function openLeft(o) { // units still to arrive on a placed order
    return o.lines.reduce(function (a, l) { return a + Math.max(0, l.qty - l.receivedQty); }, 0);
  }
  function incomingMap() {
    var m = {};
    read().forEach(function (o) {
      if (o.status !== "ordered") return;
      o.lines.forEach(function (l) { m[l.productId] = (m[l.productId] || 0) + Math.max(0, l.qty - l.receivedQty); });
    });
    return m;
  }
  function incoming(productId) { return incomingMap()[productId] || 0; }
  function isOverdue(o) {
    if (o.status !== "ordered" || !o.expected) return false;
    var d = S.daysUntil(o.expected);
    return d !== null && d < 0;
  }
  function lastCost(productId) {
    var list = getOrders();
    for (var i = 0; i < list.length; i++) {
      if (list[i].status === "cancelled") continue;
      for (var j = 0; j < list[i].lines.length; j++) {
        if (list[i].lines[j].productId === productId && list[i].lines[j].unitCost > 0) return list[i].lines[j].unitCost;
      }
    }
    return 0;
  }
  // No purchase cost is kept on products, so: the last cost you paid, else 70% of the selling price.
  function estCost(p) {
    var c = lastCost(p.id);
    return c ? { cost: c, estimated: false } : { cost: Math.round(Number(p.price) * 0.7 * 100) / 100, estimated: true };
  }

  // units sold per day over the last 30 days, from the sales records
  function velocity() {
    var from = Date.now() - 30 * DAY, units = {};
    S.getSales().forEach(function (s) {
      if (new Date(s.at).getTime() < from) return;
      s.items.forEach(function (i) { units[i.productId] = (units[i.productId] || 0) + i.qty; });
    });
    var v = {};
    Object.keys(units).forEach(function (id) { v[id] = units[id] / 30; });
    return v;
  }
  function critical(p) {
    var inv = S.getSettings().inventory || {};
    return Number(p.criticalLevel || inv.criticalLevelUnits || inv.lowStockThresholdPcs) || 0;
  }

  // What to reorder, worked out from stock condition + sales speed - open orders.
  function suggestions() {
    var v = velocity(), inc = incomingMap(), out = [];
    S.getProducts().forEach(function (p) {
      var perDay = v[p.id] || 0, stock = Number(p.stock) || 0, crit = critical(p), onOrder = inc[p.id] || 0;
      var have = stock + onOrder;
      var cover = perDay > 0 ? stock / perDay : Infinity;
      var needs = have <= crit || (perDay > 0 && have / perDay < TIGHT_DAYS);
      if (!needs) return;
      var qty = Math.max(1, Math.ceil(perDay * COVER_DAYS + crit - have));
      var c = estCost(p);
      var pri = stock <= 0 || cover < 7 ? 1 : 2;
      var why = stock <= 0 ? "Out of stock"
        : stock <= crit ? "At or below its critical level"
        : "About " + Math.max(0, Math.floor(cover)) + " day" + (Math.floor(cover) === 1 ? "" : "s") + " of sales left";
      out.push({
        product: p, stock: stock, perDay: perDay, cover: cover, onOrder: onOrder, qty: qty,
        unitCost: c.cost, costEstimated: c.estimated, priority: pri, reason: why,
        sold30: perDay * 30,
      });
    });
    out.sort(function (a, b) { return a.priority - b.priority || a.cover - b.cover; });
    return out;
  }

  // Where a "Restock" button should go: the open order if one exists, else a new order for the product.
  function restockHref(productId) {
    var open = getOrders().filter(function (o) { return o.status === "ordered" && o.lines.some(function (l) { return l.productId === productId && l.qty > l.receivedQty; }); })[0];
    return open ? "orders.html?order=" + encodeURIComponent(open.id) : "orders.html?add=" + encodeURIComponent(productId);
  }
  function restockLabel(productId, base) { return incoming(productId) > 0 ? "On order" : (base || "Order"); }

  function clear() { try { localStorage.removeItem(KEY); } catch (e) { /* */ } }

  return {
    KEY: KEY, STATUSES: STATUSES, COVER_DAYS: COVER_DAYS,
    getOrders: getOrders, getOrder: getOrder, create: create, update: update, place: place,
    cancel: cancel, setStatus: setStatus, remove: remove, receive: receive,
    total: total, openLeft: openLeft, incoming: incoming, incomingMap: incomingMap, isOverdue: isOverdue,
    estCost: estCost, restockHref: restockHref, restockLabel: restockLabel, velocity: velocity, suggestions: suggestions, clear: clear,
  };
})();
