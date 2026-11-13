// Orders page: suggested reorders (from stock + sales), purchase orders, receiving into inventory.
(function () {
  "use strict";
  var A = Analytics, S = MynelleStore, O = Orders;
  var $ = function (id) { return document.getElementById(id); };
  var esc = A.esc;
  var filter = "all";
  var query = "";
  var selected = {}; // productId -> true (suggestion checkboxes)
  var modal = null;  // state of the open order window

  var STATUS_LABEL = { draft: "Draft", ordered: "Ordered", received: "Received", cancelled: "Cancelled" };

  function fmtDate(v) {
    if (!v) return "\u2014";
    var d = new Date(v);
    return isNaN(d) ? "\u2014" : d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
  }
  function qtyText(p, n) { return S.formatQty(n, p ? p.unit : "piece"); }
  function productMap() { var m = {}; S.getAllProducts().forEach(function (p) { m[p.id] = p; }); return m; }
  function toast(msg) {
    var t = document.createElement("div");
    t.className = "mr-toast";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2800);
  }
  function statusPill(o) {
    var overdue = O.isOverdue(o);
    var partly = o.status === "ordered" && o.lines.some(function (l) { return l.receivedQty > 0; });
    var cls = overdue ? "overdue" : o.status;
    var label = overdue ? "Overdue" : partly ? "Partly received" : STATUS_LABEL[o.status];
    return '<span class="or-pill ' + cls + '">' + label + "</span>";
  }
  // Editable status: a dropdown styled like the pill, plus a small note when overdue / partly received.
  function statusSelect(o) {
    var overdue = O.isOverdue(o);
    var partly = o.status === "ordered" && o.lines.some(function (l) { return l.receivedQty > 0 && l.receivedQty < l.qty; });
    var note = overdue ? '<span class="or-pill overdue or-pill-note">Overdue</span>'
      : partly ? '<span class="or-pill ordered or-pill-note">Partly received</span>' : "";
    return '<select class="or-status-select or-pill ' + o.status + '" data-status="' + esc(o.id) + '" aria-label="Status of ' + esc(o.id) + '">' +
      O.STATUSES.map(function (st) { return '<option value="' + st + '"' + (st === o.status ? " selected" : "") + ">" + STATUS_LABEL[st] + "</option>"; }).join("") +
      "</select>" + note;
  }
  function draftMap() {
    var m = {};
    O.getOrders().forEach(function (o) {
      if (o.status === "draft") o.lines.forEach(function (l) { if (!m[l.productId]) m[l.productId] = o.id; });
    });
    return m;
  }

  // ---- KPIs --------------------------------------------------------------
  function renderKpis(sug, orders) {
    var open = orders.filter(function (o) { return o.status === "ordered"; });
    var overdue = open.filter(O.isOverdue).length;
    var openValue = open.reduce(function (a, o) {
      return a + o.lines.reduce(function (s, l) { return s + Math.max(0, l.qty - l.receivedQty) * l.unitCost; }, 0);
    }, 0);
    var from = Date.now() - 30 * 24 * 60 * 60 * 1000;
    var got = orders.filter(function (o) { return o.status === "received" && new Date(o.receivedAt).getTime() >= from; });
    var gotValue = got.reduce(function (a, o) { return a + O.total(o); }, 0);
    var urgent = sug.filter(function (s) { return s.priority === 1; }).length;
    A.stats($("orderKpis"), [
      { label: "Suggested reorders", value: A.int(sug.length), sub: urgent ? urgent + " urgent" : "nothing urgent", tone: urgent ? "red" : "green" },
      { label: "Open orders", value: A.int(open.length), sub: overdue ? overdue + " overdue" : "waiting for delivery", tone: overdue ? "red" : "blue" },
      { label: "On order (value)", value: A.money(openValue), sub: A.int(open.reduce(function (a, o) { return a + O.openLeft(o); }, 0)) + " units to arrive", tone: "teal" },
      { label: "Received, last 30 days", value: A.money(gotValue), sub: A.int(got.length) + " order" + (got.length === 1 ? "" : "s"), tone: "green" },
    ], true);
  }

  // ---- suggested reorders ------------------------------------------------
  function renderSuggestions(sug) {
    var el = $("sugTable");
    var drafts = draftMap();
    Object.keys(selected).forEach(function (id) { if (!sug.some(function (s) { return s.product.id === id; })) delete selected[id]; });
    if (!sug.length) {
      el.innerHTML = '<div class="or-empty"><b>Nothing to reorder right now.</b><span>Every product has enough stock for the next 2 weeks of sales.</span></div>';
      updateCreateBtn();
      return;
    }
    var rows = sug.map(function (s) {
      var p = s.product, inDraft = drafts[p.id];
      var st = s.stock <= 0 ? '<span class="or-pill overdue">Out of stock</span>' : s.priority === 1 ? '<span class="or-pill overdue">Urgent</span>' : '<span class="or-pill ordered">Running low</span>';
      return "<tr>" +
        '<td class="or-check"><input type="checkbox" data-sel="' + esc(p.id) + '"' + (selected[p.id] ? " checked" : "") + ' aria-label="Select ' + esc(p.name) + '" /></td>' +
        '<td><a class="or-link" href="' + esc(A.links.product(p.id, "This month")) + '">' + esc(p.name) + "</a>" +
        (inDraft ? '<span class="or-small" data-nx>In draft ' + esc(inDraft) + "</span>" : "") + "</td>" +
        "<td>" + st + '<span class="or-small">' + esc(s.reason) + "</span></td>" +
        '<td class="num">' + esc(qtyText(p, s.stock)) + "</td>" +
        '<td class="num">' + A.int(Math.round(s.sold30)) + "</td>" +
        '<td class="num">' + (s.perDay > 0 ? (s.cover < 1 ? "< 1" : Math.floor(s.cover)) : "\u2014") + "</td>" +
        '<td class="num">' + (s.onOrder ? esc(qtyText(p, s.onOrder)) : "\u2014") + "</td>" +
        '<td class="num"><b>' + esc(qtyText(p, s.qty)) + "</b></td>" +
        '<td class="num">' + A.money(s.qty * s.unitCost) + (s.costEstimated ? '<span class="or-small" data-nx>estimate</span>' : "") + "</td>" +
        '<td class="or-act"><button type="button" class="or-btn small" data-addone="' + esc(p.id) + '">Order</button></td></tr>';
    }).join("");
    el.innerHTML = '<div class="an-table-wrap"><table class="an-table or-table"><thead><tr>' +
      '<th class="or-check"><input type="checkbox" id="selAll" aria-label="Select all" /></th>' +
      "<th>Product</th><th>Condition</th><th class=\"num\">In stock</th><th class=\"num\">Sold (30 days)</th><th class=\"num\">Days left</th><th class=\"num\">Already on order</th><th class=\"num\">Suggested qty</th><th class=\"num\">Est. cost</th><th>Action</th>" +
      "</tr></thead><tbody>" + rows + "</tbody></table></div>";
    updateCreateBtn();
  }
  function updateCreateBtn() {
    var n = Object.keys(selected).length;
    var b = $("createFromSel");
    b.disabled = !n;
    b.textContent = n ? "Create order from " + n + " selected" : "Create order from selected";
    var all = $("selAll");
    if (all) {
      var boxes = document.querySelectorAll("[data-sel]");
      all.checked = boxes.length > 0 && n === boxes.length;
    }
  }

  // ---- all orders --------------------------------------------------------
  function renderTabs(orders) {
    var counts = { all: orders.length };
    O.STATUSES.forEach(function (s) { counts[s] = orders.filter(function (o) { return o.status === s; }).length; });
    var tabs = [["all", "All"]].concat(O.STATUSES.map(function (s) { return [s, STATUS_LABEL[s]]; }));
    $("statusTabs").innerHTML = tabs.map(function (t) {
      return '<button type="button" data-tab="' + t[0] + '" class="' + (filter === t[0] ? "active" : "") + '">' + t[1] + " <span>" + counts[t[0]] + "</span></button>";
    }).join("");
  }
  function renderOrders(orders) {
    var el = $("ordTable");
    var q = query.trim().toLowerCase();
    var list = orders.filter(function (o) {
      if (filter !== "all" && o.status !== filter) return false;
      if (!q) return true;
      return (o.id + " " + o.supplier + " " + o.lines.map(function (l) { return l.name; }).join(" ")).toLowerCase().indexOf(q) !== -1;
    });
    if (!list.length) {
      el.innerHTML = '<div class="or-empty"><b>' + (orders.length ? "No orders match." : "No orders yet.") + "</b><span>" +
        (orders.length ? "Try another status or search." : 'Create one from the suggestions above, or press "New order".') + "</span></div>";
      return;
    }
    el.innerHTML = '<div class="an-table-wrap"><table class="an-table or-table"><thead><tr>' +
      '<th>Order</th><th>Supplier</th><th>Created</th><th>Expected</th><th class="num">Items</th><th class="num">Total</th><th>Status</th><th>Action</th></tr></thead><tbody>' +
      list.map(function (o) {
        return '<tr class="an-clickable" data-order="' + esc(o.id) + '">' +
          "<td><b>" + esc(o.id) + "</b></td><td>" + esc(o.supplier || "\u2014") + "</td><td>" + fmtDate(o.createdAt) + "</td><td>" + fmtDate(o.expected) + "</td>" +
          '<td class="num">' + o.lines.length + '</td><td class="num">' + A.money(O.total(o)) + "</td><td>" + statusSelect(o) + "</td>" +
          '<td class="or-act"><button type="button" class="or-btn small" data-open="' + esc(o.id) + '">' + (o.status === "ordered" ? "Receive" : "View") + "</button></td></tr>";
      }).join("") + "</tbody></table></div>";
  }

  function render() {
    var sug = O.suggestions(), orders = O.getOrders();
    renderKpis(sug, orders);
    renderSuggestions(sug);
    renderTabs(orders);
    renderOrders(orders);
    window.dispatchEvent(new Event("mynelle:orders-rendered"));
  }

  // ---- order window ------------------------------------------------------
  function suggestedQty(id) {
    var s = O.suggestions().filter(function (x) { return x.product.id === id; })[0];
    return s ? s.qty : 1;
  }
  function newLine(p, qty) {
    return { productId: p.id, name: p.name, unit: p.unit, qty: qty || suggestedQty(p.id), unitCost: O.estCost(p).cost };
  }
  function openNew(productIds) {
    var pm = productMap(), sugMap = {};
    O.suggestions().forEach(function (s) { sugMap[s.product.id] = s; });
    var lines = [];
    (productIds || []).forEach(function (id) {
      var p = pm[id];
      if (p) lines.push(newLine(p, sugMap[id] ? sugMap[id].qty : 1));
    });
    modal = { mode: "new", id: null, supplier: "", expected: "", notes: "", lines: lines, receipts: {}, err: "" };
    drawModal();
  }
  function openOrder(id) {
    var o = O.getOrder(id);
    if (!o) return;
    var receipts = {};
    o.lines.forEach(function (l, i) { receipts[i] = { qty: Math.max(0, l.qty - l.receivedQty), lot: "", expiry: "" }; });
    modal = { mode: "order", id: o.id, supplier: o.supplier, expected: o.expected, notes: o.notes, lines: o.lines.map(function (l) { return Object.assign({}, l); }), receipts: receipts, err: "" };
    drawModal();
  }
  function closeModal() {
    modal = null;
    var m = $("orderModal");
    m.classList.remove("open");
    m.innerHTML = "";
    document.body.classList.remove("or-noscroll");
  }
  function modalTotal() {
    return modal.lines.reduce(function (a, l) { return a + (Number(l.qty) || 0) * (Number(l.unitCost) || 0); }, 0);
  }
  function supplierList() {
    var seen = {};
    O.getOrders().forEach(function (o) { if (o.supplier) seen[o.supplier] = true; });
    return Object.keys(seen);
  }

  function drawModal() {
    var m = modal, order = m.id ? O.getOrder(m.id) : null;
    var status = order ? order.status : "draft";
    var editable = status === "draft";
    var pm = productMap();
    var title = order ? order.id : "New order";
    var head = '<div class="or-card"><div class="or-card-head"><div><h2 id="orTitle">' + esc(title) + "</h2>" +
      (order ? "<p>" + statusSelect(order) + " Created " + fmtDate(order.createdAt) + (order.createdBy ? " by " + esc(order.createdBy) : "") +
        (order.orderedAt ? " \u00B7 Ordered " + fmtDate(order.orderedAt) : "") + (order.receivedAt ? " \u00B7 Received " + fmtDate(order.receivedAt) : "") + "</p>"
        : "<p>Choose what to buy, then save it as a draft or place it.</p>") +
      '</div><button type="button" class="or-x" data-act="close" aria-label="Close">&times;</button></div><div class="or-card-body">';

    var fields = '<div class="or-fields">' +
      '<label>Supplier<input type="text" data-f="supplier" list="orSuppliers" maxlength="80" value="' + esc(m.supplier) + '"' + (editable ? "" : " disabled") + ' placeholder="e.g. Unilab distributor" /></label>' +
      '<label>Expected delivery<input type="date" data-f="expected" value="' + esc(m.expected) + '"' + (status === "received" || status === "cancelled" ? " disabled" : "") + " /></label>" +
      '<label class="wide">Notes<input type="text" data-f="notes" maxlength="200" value="' + esc(m.notes) + '"' + (editable ? "" : " disabled") + ' placeholder="Optional" /></label></div>' +
      '<datalist id="orSuppliers">' + supplierList().map(function (s) { return '<option value="' + esc(s) + '">'; }).join("") + "</datalist>";

    var table;
    if (status === "ordered") {
      table = '<div class="an-table-wrap"><table class="an-table or-lines"><thead><tr><th>Product</th><th class="num">Ordered</th><th class="num">Received</th><th class="num">Arriving now</th><th>Lot no.</th><th>Expiry date</th></tr></thead><tbody>' +
        m.lines.map(function (l, i) {
          var left = Math.max(0, l.qty - l.receivedQty), r = m.receipts[i];
          return "<tr><td>" + esc(l.name) + '<span class="or-small">' + A.money(l.unitCost) + " each</span></td>" +
            '<td class="num">' + A.int(l.qty) + '</td><td class="num">' + A.int(l.receivedQty) + "</td>" +
            "<td class=\"num\">" + (left ? '<input type="number" class="or-in num" min="0" max="' + left + '" data-r="' + i + '" data-k="qty" value="' + r.qty + '" />' : "\u2014") + "</td>" +
            "<td>" + (left ? '<input type="text" class="or-in" maxlength="30" data-r="' + i + '" data-k="lot" value="' + esc(r.lot) + '" placeholder="Lot no." />' : "") + "</td>" +
            "<td>" + (left ? '<input type="date" class="or-in" data-r="' + i + '" data-k="expiry" value="' + esc(r.expiry) + '" />' : "") + "</td></tr>";
        }).join("") + "</tbody></table></div>";
    } else {
      table = '<div class="an-table-wrap"><table class="an-table or-lines"><thead><tr><th>Product</th><th class="num">In stock</th><th class="num">Quantity</th><th class="num">Unit cost</th><th class="num">Amount</th>' +
        (editable ? "<th></th>" : "") + "</tr></thead><tbody>" +
        (m.lines.length ? m.lines.map(function (l, i) {
          var p = pm[l.productId];
          return "<tr><td>" + esc(l.name) + '<span class="or-small">' + esc(p ? p.unit : l.unit) + "</span></td>" +
            '<td class="num">' + esc(p ? qtyText(p, p.stock) : "\u2014") + "</td>" +
            '<td class="num">' + (editable ? '<input type="number" class="or-in num" min="1" step="1" data-l="' + i + '" data-k="qty" value="' + l.qty + '" />' : A.int(l.qty)) + "</td>" +
            '<td class="num">' + (editable ? '<input type="number" class="or-in num" min="0" step="0.01" data-l="' + i + '" data-k="unitCost" value="' + l.unitCost + '" />' : A.money(l.unitCost)) + "</td>" +
            '<td class="num" data-amt="' + i + '">' + A.money((Number(l.qty) || 0) * (Number(l.unitCost) || 0)) + "</td>" +
            (editable ? '<td class="or-act"><button type="button" class="or-x small" data-rm="' + i + '" aria-label="Remove">&times;</button></td>' : "") + "</tr>";
        }).join("") : '<tr><td colspan="6" class="or-none">No products yet. Add one below.</td></tr>') + "</tbody></table></div>";
    }

    var adder = "";
    if (editable) {
      var used = {}; m.lines.forEach(function (l) { used[l.productId] = true; });
      var opts = S.getProducts().filter(function (p) { return !used[p.id]; })
        .sort(function (a, b) { return a.name.localeCompare(b.name); })
        .map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.name) + " (" + esc(qtyText(p, p.stock)) + " in stock)</option>"; }).join("");
      adder = '<div class="or-add"><select id="orAddSel"><option value="">Add a product\u2026</option>' + opts + '</select><button type="button" class="or-btn small" data-act="addline">Add</button></div>';
    }

    var foot = '<div class="or-total">Total <b id="orTotal">' + A.money(order && !editable ? O.total(order) : modalTotal()) + "</b>" +
      (m.lines.some(function (l) { return !l.unitCost; }) && editable ? '<span class="or-small">Unit costs are estimates (70% of the selling price) until you enter what you pay.</span>' : "") + "</div>" +
      '<p class="or-err" id="orErr">' + esc(m.err) + "</p>" +
      '<div class="or-actions">';
    if (order) {
      foot += '<button type="button" class="or-btn" data-act="print">Print order</button><button type="button" class="or-btn" data-act="export">Export</button>';
    }
    foot += '<span class="or-spacer"></span>';
    if (status === "draft") {
      if (order) foot += '<button type="button" class="or-btn danger" data-act="delete">Delete draft</button>';
      foot += '<button type="button" class="or-btn" data-act="save">Save draft</button><button type="button" class="or-btn primary" data-act="place">Place order</button>';
    } else if (status === "ordered") {
      foot += '<button type="button" class="or-btn danger" data-act="cancel">Cancel order</button><button type="button" class="or-btn" data-act="saveexp">Save delivery date</button><button type="button" class="or-btn primary" data-act="receive">Receive stock</button>';
    } else {
      foot += '<button type="button" class="or-btn" data-act="close">Close</button>';
    }
    foot += "</div></div></div>";
    var host = $("orderModal");
    host.innerHTML = head + fields + table + adder + foot;
    host.classList.add("open");
    document.body.classList.add("or-noscroll");
  }

  function readHeader() {
    var host = $("orderModal");
    ["supplier", "expected", "notes"].forEach(function (k) {
      var el = host.querySelector('[data-f="' + k + '"]');
      if (el) modal[k] = el.value;
    });
  }
  function fail(msg) { modal.err = msg; var e = $("orErr"); if (e) e.textContent = msg; }

  function saveDraft(thenPlace) {
    readHeader();
    var o;
    try {
      if (modal.id) o = O.update(modal.id, { supplier: modal.supplier, expected: modal.expected, notes: modal.notes, lines: modal.lines });
      else o = O.create({ supplier: modal.supplier, expected: modal.expected, notes: modal.notes, lines: modal.lines });
      if (thenPlace) o = O.place(o.id);
    } catch (e) {
      // created but couldn't be placed: keep it open as the saved draft, with the reason shown
      if (o && !modal.id) modal.id = o.id;
      modal.err = e.message;
      render(); drawModal(); return;
    }
    toast(thenPlace ? o.id + " placed. Stock is marked as incoming." : o.id + " saved as a draft.");
    closeModal(); selected = {}; render();
  }

  function orderSheet(o) {
    var pm = productMap(), b = {};
    try { b = S.getSettings().business || {}; } catch (e) { /* */ }
    return '<h2>Purchase order ' + esc(o.id) + "</h2>" +
      '<div class="or-sheet-meta"><div><b>From</b> ' + esc(b.name || "Mynelle's Pharmacy") + (b.address ? "<br>" + esc(b.address) : "") + (b.contact ? "<br>" + esc(b.contact) : "") + "</div>" +
      "<div><b>To (supplier)</b> " + esc(o.supplier || "\u2014") + "<br><b>Date</b> " + fmtDate(o.orderedAt || o.createdAt) + "<br><b>Expected</b> " + fmtDate(o.expected) + "<br><b>Status</b> " + STATUS_LABEL[o.status] + "</div></div>" +
      '<table><thead><tr><th>#</th><th>Product</th><th>Unit</th><th class="r">Qty</th><th class="r">Unit cost</th><th class="r">Amount</th></tr></thead><tbody>' +
      o.lines.map(function (l, i) {
        var p = pm[l.productId];
        return "<tr><td>" + (i + 1) + "</td><td>" + esc(l.name) + "</td><td>" + esc(p ? p.unit : l.unit) + '</td><td class="r">' + A.int(l.qty) + '</td><td class="r">' + A.money(l.unitCost) + '</td><td class="r">' + A.money(l.qty * l.unitCost) + "</td></tr>";
      }).join("") + '</tbody><tfoot><tr><td colspan="5" class="r"><b>Total</b></td><td class="r"><b>' + A.money(O.total(o)) + "</b></td></tr></tfoot></table>" +
      (o.notes ? "<p><b>Notes:</b> " + esc(o.notes) + "</p>" : "") +
      '<div class="or-sign"><div>Prepared by' + (o.createdBy ? ": " + esc(o.createdBy) : "") + '</div><div>Approved by</div><div>Received by</div></div>';
  }

  function changeStatus(sel) {
    var id = sel.getAttribute("data-status"), next = sel.value, o = O.getOrder(id);
    if (!o || o.status === next) return;
    var warn = {
      received: "Mark " + id + " as received?\n\nThis only changes the status. It does NOT add stock to inventory. To book delivered items into stock, leave it as Ordered and use \"Receive stock\".",
      cancelled: "Mark " + id + " as cancelled?\n\nIts items will no longer count as incoming stock. Stock already received is not removed.",
      draft: "Move " + id + " back to draft?",
    }[next];
    if (warn && !window.confirm(warn)) { sel.value = o.status; return; }
    try { O.setStatus(id, next); }
    catch (err) { sel.value = o.status; toast(err.message); return; }
    toast(id + " is now " + STATUS_LABEL[next] + ".");
    var reopen = modal && modal.id === id;
    if (reopen) closeModal();
    render();
    if (reopen) openOrder(id);
  }

  // ---- events ------------------------------------------------------------
  document.addEventListener("click", function (e) {
    var t = e.target;
    var el;
    if ((el = t.closest("[data-addone]"))) { openNew([el.getAttribute("data-addone")]); return; }
    if ((el = t.closest("[data-open]"))) { e.stopPropagation(); openOrder(el.getAttribute("data-open")); return; }
    if ((el = t.closest("tr[data-order]")) && !t.closest("a, input, button, select")) { openOrder(el.getAttribute("data-order")); return; }
    if ((el = t.closest("[data-tab]"))) { filter = el.getAttribute("data-tab"); var os = O.getOrders(); renderTabs(os); renderOrders(os); return; }
    if (t.closest("#newOrderBtn")) { openNew([]); return; }
    if (t.closest("#createFromSel")) { openNew(Object.keys(selected)); return; }
    if (t === $("orderModal")) { closeModal(); return; }
    if (!modal) return;
    if ((el = t.closest("[data-rm]"))) { readHeader(); modal.lines.splice(Number(el.getAttribute("data-rm")), 1); drawModal(); return; }
    var act = (el = t.closest("[data-act]")) && el.getAttribute("data-act");
    if (!act) return;
    if (act === "close") return closeModal();
    if (act === "addline") {
      var sel = $("orAddSel"), p = productMap()[sel.value];
      if (!p) { fail("Choose a product to add."); return; }
      readHeader(); modal.err = ""; modal.lines.push(newLine(p)); drawModal(); return;
    }
    if (act === "save") return saveDraft(false);
    if (act === "place") return saveDraft(true);
    if (act === "saveexp") {
      readHeader();
      try { O.update(modal.id, { expected: modal.expected }); toast("Delivery date saved."); render(); } catch (err) { fail(err.message); }
      return;
    }
    if (act === "delete") {
      if (!window.confirm("Delete draft " + modal.id + "?")) return;
      try { O.remove(modal.id); } catch (err) { return fail(err.message); }
      toast("Draft deleted."); closeModal(); render(); return;
    }
    if (act === "cancel") {
      if (!window.confirm("Cancel order " + modal.id + "? Its items will no longer count as incoming stock.")) return;
      try { O.cancel(modal.id); } catch (err) { return fail(err.message); }
      toast("Order cancelled."); closeModal(); render(); return;
    }
    if (act === "receive") {
      var rec = modal.lines.map(function (l, i) { return { index: i, qty: modal.receipts[i].qty, lot: modal.receipts[i].lot, expiry: modal.receipts[i].expiry }; });
      try { var o = O.receive(modal.id, rec); toast(o.status === "received" ? o.id + " received. Stock added to inventory." : "Partly received. Stock added to inventory."); }
      catch (err) { return fail(err.message); }
      var id = modal.id; closeModal(); render(); openOrder(id); return;
    }
    if (act === "print") {
      var order = O.getOrder(modal.id);
      var sheet = $("orderSheet");
      sheet.innerHTML = orderSheet(order);
      MynelleTools.print(sheet, "Purchase order " + order.id);
      return;
    }
    if (act === "export") {
      var od = O.getOrder(modal.id), pm = productMap();
      MynelleTools.exportCsv("purchase-order-" + od.id, ["Order", "Supplier", "Status", "Product", "Unit", "Quantity", "Received", "Unit cost", "Amount"],
        od.lines.map(function (l) { var p = pm[l.productId]; return [od.id, od.supplier, STATUS_LABEL[od.status], l.name, p ? p.unit : l.unit, l.qty, l.receivedQty, l.unitCost.toFixed(2), (l.qty * l.unitCost).toFixed(2)]; }));
      return;
    }
  });
  document.addEventListener("change", function (e) {
    var t = e.target, id;
    if (t.classList && t.classList.contains("or-status-select")) { changeStatus(t); return; }
    if ((id = t.getAttribute && t.getAttribute("data-sel"))) {
      if (t.checked) selected[id] = true; else delete selected[id];
      updateCreateBtn();
    } else if (t.id === "selAll") {
      document.querySelectorAll("[data-sel]").forEach(function (b) { b.checked = t.checked; if (t.checked) selected[b.getAttribute("data-sel")] = true; else delete selected[b.getAttribute("data-sel")]; });
      updateCreateBtn();
    }
  });
  document.addEventListener("input", function (e) {
    var t = e.target;
    if (t.id === "orderSearch") { query = t.value; renderOrders(O.getOrders()); return; }
    if (!modal) return;
    if (t.hasAttribute("data-l")) {
      var i = Number(t.getAttribute("data-l")), k = t.getAttribute("data-k");
      modal.lines[i][k] = k === "qty" ? Math.floor(Number(t.value) || 0) : Number(t.value) || 0;
      var amt = $("orderModal").querySelector('[data-amt="' + i + '"]');
      if (amt) amt.textContent = A.money((Number(modal.lines[i].qty) || 0) * (Number(modal.lines[i].unitCost) || 0));
      $("orTotal").textContent = A.money(modalTotal());
    } else if (t.hasAttribute("data-r")) {
      modal.receipts[Number(t.getAttribute("data-r"))][t.getAttribute("data-k")] = t.value;
    }
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && modal) closeModal(); });
  window.addEventListener("storage", render);

  // the printable order sheet lives inside .content so the print heading (pharmacy, date) sits above it
  var contentEl = document.querySelector(".content");
  if (contentEl && $("orderSheet")) contentEl.appendChild($("orderSheet"));

  render();
  var params = new URLSearchParams(location.search);
  if (params.get("order")) openOrder(params.get("order"));
  else if (params.get("add")) openNew(params.get("add").split(",").filter(Boolean));
})();
