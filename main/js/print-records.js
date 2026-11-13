/*
 * print-records.js — Print and Export on every table.
 *   - Each table / record list gets a "Print" and an "Export" (CSV) button,
 *     placed in that table's own header (or just above it). There is no
 *     whole-page print button.
 *   - Print shows only that table, under a clean heading (pharmacy, report
 *     name, date, who printed it). Ctrl/Cmd+P still prints the whole page.
 *   - Export downloads the rows as a .csv that opens in Excel. Peso columns
 *     are exported as plain numbers so they can be summed.
 *   - Long lists are expanded first ("Show more" buttons are clicked), and
 *     pages can listen for "mynelle:beforeprint" / "mynelle:afterprint".
 *   - Other scripts can call window.MynelleTools.print(el, title) and
 *     window.MynelleTools.exportCsv(name, headers, rows).
 */
(function () {
  "use strict";
  var path = location.pathname.split("/").pop();
  // These pages have their own print (receipts, pay slips) or nothing to print.
  if (/^(Login|Register|account|accounts|settings|transaction)\.html$/i.test(path)) return;

  var PRINT_ICON =
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>';
  var EXPORT_ICON =
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';

  var SKIP = ".modal-overlay, .mcf-overlay, .sv-card, [data-mr-skip], .mr-print-header";
  var target = null; // element being printed, or null for the whole page
  var targetTitle = "";
  var hidden = [];
  var prepared = false;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function business() {
    try {
      var b = MynelleStore.getSettings().business || {};
      return { name: b.name || "Mynelle's Pharmacy", line: [b.address, b.contact].filter(Boolean).join("  \u00B7  ") };
    } catch (e) { return { name: "Mynelle's Pharmacy", line: "" }; }
  }
  function printedBy() {
    try { var s = MynelleAuth.getSession(); return s && s.account ? s.account.fullName || "" : ""; } catch (e) { return ""; }
  }
  function pageTitle() {
    var h = document.getElementById("pageTitle") || document.querySelector(".detail-page-head h1, .content h1");
    var t = h && h.textContent.trim() && !/^loading/i.test(h.textContent.trim()) ? h.textContent.trim() : "";
    if (!t) t = (document.title || "").replace(/^Mynelle'?s Pharmacy\s*[\u2014\-\u2013]\s*/i, "").trim();
    return t || "Report";
  }
  function clean(t) { return String(t || "").replace(/\s+/g, " ").trim(); }
  function panelTitle(panel) {
    if (!panel) return "";
    var h = panel.querySelector(".panel-head h2, .panel-head h3, .panel-head-title, .an-panel-head h2, h2, h3");
    return h ? clean(h.textContent) : "";
  }

  // ---------------------------------------------------------------- printing
  function buildHeader() {
    var old = document.querySelector(".mr-print-header");
    if (old) old.remove();
    var b = business();
    var title = pageTitle();
    var sub = targetTitle;
    var when = new Date().toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
    var by = printedBy();
    var el = document.createElement("div");
    el.className = "mr-print-header";
    el.innerHTML =
      '<div class="mr-ph-name">' + esc(b.name) + "</div>" +
      (b.line ? '<div class="mr-ph-line">' + esc(b.line) + "</div>" : "") +
      '<div class="mr-ph-title">' + esc(sub && sub !== title ? title + " \u2014 " + sub : title) + "</div>" +
      '<div class="mr-ph-meta">Printed ' + esc(when) + (by ? " by " + esc(by) : "") + "</div>";
    var host = document.querySelector(".content") || document.querySelector("main") || document.body;
    host.insertBefore(el, host.firstChild);
  }

  // Hide everything that isn't the target or one of its ancestors.
  function isolate(el) {
    var node = el;
    while (node && node !== document.body) {
      var parent = node.parentElement;
      if (!parent) break;
      Array.prototype.forEach.call(parent.children, function (sib) {
        if (sib === node || sib.classList.contains("mr-print-header")) return;
        if (sib.tagName === "SCRIPT" || sib.tagName === "STYLE" || sib.tagName === "LINK") return;
        sib.classList.add("mr-np");
        hidden.push(sib);
      });
      node = parent;
    }
  }

  function expandAll() {
    var more, guard = 0;
    while ((more = document.getElementById("pgMore") || document.querySelector(".an-more")) && guard++ < 200) more.click();
  }

  function prepare() {
    if (prepared) return;
    prepared = true;
    document.dispatchEvent(new CustomEvent("mynelle:beforeprint"));
    expandAll();
    buildHeader();
    document.body.classList.add("mr-printing");
    if (target) isolate(target);
  }
  function cleanup() {
    if (!prepared) return;
    prepared = false;
    document.body.classList.remove("mr-printing");
    hidden.forEach(function (n) { n.classList.remove("mr-np"); });
    hidden = [];
    var h = document.querySelector(".mr-print-header");
    if (h) h.remove();
    target = null;
    targetTitle = "";
    document.dispatchEvent(new CustomEvent("mynelle:afterprint"));
  }
  function printNow(el, title) {
    if (prepared) cleanup();
    target = el || null;
    targetTitle = title || "";
    prepare();
    window.print();
  }
  window.addEventListener("beforeprint", prepare); // Ctrl/Cmd+P
  window.addEventListener("afterprint", cleanup);

  // ------------------------------------------------------------- table data
  function visible(el) {
    return !el.hidden && el.style.display !== "none" && !el.closest("[hidden]");
  }
  // Text of a cell. Anything marked data-nx (small notes) is left out.
  function cellText(el) {
    var skip = Array.prototype.slice.call(el.querySelectorAll("[data-nx]"));
    var old = skip.map(function (n) { return n.style.display; });
    skip.forEach(function (n) { n.style.display = "none"; });
    var t = (el.innerText != null ? el.innerText : el.textContent) || "";
    skip.forEach(function (n, i) { n.style.display = old[i]; });
    return t.replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, " \u00B7 ").trim();
  }
  function isActionHeader(h) { return !h || /^(actions?|select|#)$/i.test(h.trim()); }

  // The table-like thing inside `scope`: a real <table> or a grid of
  // .table-head + .table-row / .detail-table-head + .detail-row.
  function findTable(scope) {
    if (scope.tagName === "TABLE") return { kind: "table", el: scope };
    var t = scope.querySelector("table");
    if (t) return { kind: "table", el: t };
    var head = scope.querySelector(".table-head, .detail-table-head");
    if (head) return { kind: "grid", head: head, scope: scope };
    return null;
  }

  function extract(scope) {
    var found = findTable(scope);
    if (!found) return null;
    var headers = [], rows = [];
    if (found.kind === "table") {
      var ths = found.el.querySelectorAll("thead th");
      if (!ths.length) ths = found.el.querySelectorAll("tr:first-child th, tr:first-child td");
      headers = Array.prototype.map.call(ths, cellText);
      Array.prototype.forEach.call(found.el.querySelectorAll("tbody tr"), function (tr) {
        if (!visible(tr)) return;
        var tds = tr.children;
        if (tds.length === 1 && tds[0].colSpan > 1) return; // "no results" row
        rows.push(Array.prototype.map.call(tds, cellText));
      });
    } else {
      headers = Array.prototype.map.call(found.head.children, cellText);
      Array.prototype.forEach.call(found.scope.querySelectorAll(".table-row, .detail-row"), function (r) {
        if (!visible(r)) return;
        rows.push(Array.prototype.map.call(r.children, cellText));
      });
    }
    // Drop Action / checkbox columns.
    var keep = [];
    headers.forEach(function (h, i) { if (!isActionHeader(h)) keep.push(i); });
    headers = keep.map(function (i) { return headers[i]; });
    rows = rows.map(function (r) { return keep.map(function (i) { return r[i] == null ? "" : r[i]; }); });
    return { headers: headers, rows: rows };
  }

  // ------------------------------------------------------------------ export
  var PESO = /^[-\u2212]?\u20B1\s?[\d,]+(\.\d+)?$/;
  function pesoNumber(v) {
    var neg = /^[-\u2212]/.test(v);
    var n = parseFloat(v.replace(/[^\d.]/g, ""));
    return (neg ? -n : n).toFixed(2);
  }
  function csvCell(v) {
    var s = String(v == null ? "" : v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function slug(s) { return clean(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "export"; }

  function exportCsv(name, headers, rows) {
    headers = headers.slice();
    rows = rows.map(function (r) { return r.slice(); });
    headers.forEach(function (h, c) { // peso columns -> plain numbers
      var vals = rows.map(function (r) { return r[c]; }).filter(function (v) { return v !== "" && v != null; });
      if (vals.length && vals.every(function (v) { return PESO.test(v); })) {
        rows.forEach(function (r) { if (r[c] !== "" && r[c] != null) r[c] = pesoNumber(r[c]); });
        headers[c] = h + " (\u20B1)";
      }
    });
    var lines = [headers].concat(rows).map(function (r) { return r.map(csvCell).join(","); });
    var blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = slug(name) + "-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function toast(msg) {
    var t = document.createElement("div");
    t.className = "mr-toast";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2600);
  }

  // ------------------------------------------------------------ the buttons
  function button(cls, icon, label, title) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = cls;
    b.title = title;
    b.innerHTML = icon + "<span>" + label + "</span>";
    return b;
  }

  function makeTools(info) {
    var wrap = document.createElement("span");
    wrap.className = "mr-tools";
    var name = info.name;
    var p = button("mr-print-btn", PRINT_ICON, "Print", "Print " + (name ? "\u201C" + name + "\u201D" : "this table"));
    var e = button("mr-export-btn", EXPORT_ICON, "Export", "Export " + (name ? "\u201C" + name + "\u201D" : "this table") + " as CSV (opens in Excel)");
    p.setAttribute("data-mr-print", "table");
    e.setAttribute("data-mr-export", "table");
    p.addEventListener("click", function () {
      var el = info.panelOnly ? info.panel : info.anchor;
      printNow(el, name);
    });
    e.addEventListener("click", function () {
      // let paged lists show every row while we read them
      document.dispatchEvent(new CustomEvent("mynelle:beforeprint"));
      expandAll();
      var data = extract(info.scope());
      document.dispatchEvent(new CustomEvent("mynelle:afterprint"));
      if (!data || !data.rows.length) { toast("Nothing to export yet."); return; }
      exportCsv(pageTitle() + (name && name !== pageTitle() ? "-" + name : ""), data.headers, data.rows);
    });
    wrap.appendChild(p);
    wrap.appendChild(e);
    return wrap;
  }

  // Finds every table-like thing inside root and gives it a Print/Export pair.
  function decorate(root) {
    var found = [];
    Array.prototype.forEach.call(root.querySelectorAll ? root.querySelectorAll("table, .table-head, .detail-table-head") : [], function (el) {
      if (el.closest(SKIP) || el.closest("table") && el.tagName !== "TABLE") return;
      var panel = el.closest(".panel");
      if (!panel || panel.closest(SKIP)) return;
      found.push({ el: el, panel: panel });
    });
    found.forEach(function (f) {
      var panel = f.panel;
      // direct child of the panel that holds this table (re-rendered content stays inside it)
      var anchor = f.el;
      while (anchor.parentElement && anchor.parentElement !== panel) anchor = anchor.parentElement;
      if (anchor.getAttribute("data-mr-tools")) return;
      var tablesInPanel = panel.querySelectorAll("table, .table-head, .detail-table-head").length;
      var isGrid = f.el.tagName !== "TABLE";
      var info = {
        anchor: anchor,
        panel: panel,
        panelOnly: tablesInPanel === 1,
        name: panelTitle(panel),
        scope: function () { return isGrid ? panel : (anchor.tagName === "TABLE" ? anchor : anchor); },
      };
      anchor.setAttribute("data-mr-tools", "1");
      var tools = makeTools(info);
      var head = panel.querySelector(":scope > .panel-head, :scope > .an-panel-head, :scope > .detail-toolbar");
      if (head && tablesInPanel === 1) {
        var slot = head.querySelector(".panel-head-actions, .panel-head-right") || head;
        slot.appendChild(tools);
      } else {
        tools.classList.add("mr-tools-bar");
        panel.classList.add("mr-has-tools");
        anchor.parentElement.insertBefore(tools, anchor);
      }
    });
  }

  var queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    setTimeout(function () { queued = false; decorate(document); }, 80);
  }

  function start() {
    decorate(document);
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        if (muts[i].addedNodes.length && !(muts[i].target.classList && muts[i].target.classList.contains("mr-tools"))) { schedule(); return; }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  window.MynelleTools = {
    print: function (el, title) { printNow(el, title); },
    exportCsv: exportCsv,
    extract: extract,
  };
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start);
})();
