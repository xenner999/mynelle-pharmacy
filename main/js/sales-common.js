// Shared by the Sales page and the All transactions page.
var SalesView = (function () {
  var S = MynelleStore;

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function productsLabel(sale) {
    var first = sale.items[0] ? sale.items[0].name : "";
    var extra = sale.items.length - 1;
    return extra > 0 ? first + " +" + extra + " more" : first;
  }

  // sort: "newest" | "oldest" | "highest" | "lowest"
  function filter(period, query, sort) {
    var q = String(query || "").trim().toLowerCase();
    var rows = S.salesIn(period).filter(function (s) {
      if (!q) return true;
      return (
        s.id.toLowerCase().indexOf(q) !== -1 ||
        (s.payment || "").toLowerCase().indexOf(q) !== -1 ||
        s.items.some(function (i) {
          return i.name.toLowerCase().indexOf(q) !== -1;
        })
      );
    });
    var by = {
      newest: function (a, b) { return new Date(b.at) - new Date(a.at); },
      oldest: function (a, b) { return new Date(a.at) - new Date(b.at); },
      highest: function (a, b) { return S.saleTotal(b) - S.saleTotal(a); },
      lowest: function (a, b) { return S.saleTotal(a) - S.saleTotal(b); },
    }[sort || "newest"];
    return rows.sort(by);
  }

  function totalOf(rows) {
    return rows.reduce(function (sum, s) {
      return sum + S.saleTotal(s);
    }, 0);
  }

  function summaryHtml(rows) {
    return (
      "<strong>" + rows.length.toLocaleString("en-US") + "</strong> " +
      (rows.length === 1 ? "transaction" : "transactions") +
      " &nbsp; <strong>" + esc(S.formatCurrency(totalOf(rows))) + "</strong>"
    );
  }

  function rowEl(s) {
    var row = document.createElement("div");
    row.className = "table-row sv-clickable";
    row.setAttribute("role", "button");
    row.tabIndex = 0;
    row.title = "View transaction details";
    row.innerHTML =
      '<span class="txn-id">' + esc(s.id) + "</span>" +
      '<span class="sv-prod">' + esc(productsLabel(s)) + ' <em class="sv-view">View details &rsaquo;</em></span>' +
      "<span>" + S.saleQty(s) + "</span>" +
      '<span class="muted">' + esc(s.payment || "Cash") + "</span>" +
      "<span>" + esc(S.formatCurrency(S.saleTotal(s))) + "</span>" +
      '<span class="muted">' + esc(S.formatDateTime(s.at)) + "</span>";
    var go = function () { window.location.href = "transaction.html?id=" + encodeURIComponent(s.id); };
    row.addEventListener("click", go);
    row.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); }
    });
    return row;
  }

  // ---------------------------------------------------------------
  // Transaction details (full item list, payment, totals)
  // ---------------------------------------------------------------
  var detailEl = null;
  function ensureDetailStyles() {
    if (document.getElementById("svStyles")) return;
    var st = document.createElement("style");
    st.id = "svStyles";
    st.textContent =
      ".sv-clickable{cursor:pointer}.sv-clickable:hover{background:rgba(4, 66, 191,.06)}" +
      ".sv-clickable:focus-visible{outline:2px solid #0442bf;outline-offset:-2px}" +
      ".sv-view{font-style:normal;font-size:11.5px;font-weight:600;color:#0442bf;margin-left:6px;white-space:nowrap}" +
      ".sv-ov{position:fixed;inset:0;background:rgba(13, 13, 13,.55);display:none;align-items:center;justify-content:center;z-index:200;padding:16px}" +
      ".sv-ov.open{display:flex}" +
      ".sv-card{background:var(--card,#fff);color:var(--text,#0d0d0d);border-radius:16px;width:100%;max-width:620px;max-height:92vh;overflow:auto;box-shadow:0 28px 70px rgba(0, 0, 0,.3)}" +
      ".sv-head{display:flex;justify-content:space-between;align-items:flex-start;padding:20px 24px 12px}" +
      ".sv-head h3{margin:0;font-size:18px}.sv-head p{margin:3px 0 0;font-size:12.5px;color:var(--text-muted,#6b7280)}" +
      ".sv-x{border:none;background:none;font-size:24px;line-height:1;cursor:pointer;color:var(--text-muted,#6b7280)}" +
      ".sv-meta{display:grid;grid-template-columns:repeat(3,1fr);gap:12px 18px;padding:6px 24px 16px;font-size:13px;font-weight:600}" +
      ".sv-meta span{display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.4px;color:var(--text-muted,#6b7280);margin-bottom:2px}" +
      ".sv-body{padding:0 24px 8px}" +
      ".sv-table{width:100%;border-collapse:collapse;font-size:13px;border:1px solid var(--border,#e1e6f0);border-radius:10px;overflow:hidden}" +
      ".sv-table th{background:var(--bg,#f2f4f9);text-align:left;font-size:11.5px;color:var(--text-muted,#6b7280);padding:9px 12px}" +
      ".sv-table td{padding:10px 12px;border-top:1px solid var(--border,#e1e6f0);vertical-align:top}" +
      ".sv-table .n{text-align:right;white-space:nowrap}.sv-table small{display:block;color:var(--text-muted,#6b7280);font-size:11.5px;margin-top:2px}" +
      ".sv-sum{margin:14px 0 4px;font-size:13.5px}.sv-sum div{display:flex;justify-content:space-between;padding:4px 0}" +
      ".sv-sum .t{border-top:2px solid var(--border,#e1e6f0);margin-top:6px;padding-top:10px;font-size:17px;font-weight:700}" +
      ".sv-note{margin:10px 0 0;font-size:12.5px;color:var(--text-muted,#6b7280)}" +
      ".sv-foot{display:flex;justify-content:flex-end;gap:10px;padding:14px 24px 20px}" +
      ".sv-foot button{padding:10px 16px;border-radius:10px;border:1px solid var(--border,#e1e6f0);background:var(--card,#fff);color:inherit;font-weight:600;font-size:13.5px;font-family:inherit;cursor:pointer}" +
      ".sv-foot .p{background:var(--navy,#0d0d0d);border-color:var(--navy,#0d0d0d);color:#fff}" +
      "@media(max-width:560px){.sv-meta{grid-template-columns:1fr 1fr}}" +
      "@media print{body *{visibility:hidden}.sv-ov.open,.sv-ov.open *{visibility:visible}.sv-ov.open{position:absolute;background:#fff;display:block}.sv-foot,.sv-x{display:none}}";
    document.head.appendChild(st);
  }

  function closeDetails() {
    if (detailEl) detailEl.classList.remove("open");
  }

  function openDetails(sale) {
    ensureDetailStyles();
    if (!detailEl) {
      detailEl = document.createElement("div");
      detailEl.className = "sv-ov";
      document.body.appendChild(detailEl);
      detailEl.addEventListener("click", function (e) {
        if (e.target === detailEl || e.target.closest("[data-sv-close]")) closeDetails();
        else if (e.target.closest("[data-sv-print]")) window.print();
      });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") closeDetails();
      });
    }
    var money = function (n) { return S.formatCurrency(n); };
    var gross = sale.items.reduce(function (a, i) { return a + i.qty * i.price; }, 0);
    var discount = Number(sale.discount) || 0;
    var total = S.saleTotal(sale);
    var rate = Number(S.getSettings().pricing.vat) || 0;
    var vat = sale.vat != null ? Number(sale.vat) : (rate ? (total * rate) / (100 + rate) : 0);
    var units = S.saleQty(sale);

    var itemRows = sale.items.map(function (i) {
      var lots = (i.lots || []).map(function (l) {
        return "Lot " + (l.lot || "\u2014") + (l.expiry ? " \u00B7 exp " + l.expiry : "") + " \u00D7" + l.qty;
      }).join(", ");
      return (
        "<tr><td>" + esc(i.name) + (lots ? "<small>" + esc(lots) + "</small>" : "") + "</td>" +
        '<td class="n">' + i.qty + "</td>" +
        '<td class="n">' + esc(money(i.price)) + "</td>" +
        '<td class="n">' + esc(money(i.qty * i.price)) + "</td></tr>"
      );
    }).join("");

    var paid = Number(sale.tendered) || 0;
    detailEl.innerHTML =
      '<div class="sv-card" role="dialog" aria-modal="true" aria-label="Transaction details">' +
      '<div class="sv-head"><div><h3>' + esc(sale.id) + "</h3><p>" + esc(S.formatDateTime(sale.at)) + "</p></div>" +
      '<button class="sv-x" data-sv-close aria-label="Close">&times;</button></div>' +
      '<div class="sv-meta">' +
      "<div><span>Payment method</span>" + esc(sale.payment || "Cash") + "</div>" +
      "<div><span>Cashier</span>" + esc(sale.cashier || "\u2014") + "</div>" +
      "<div><span>Items</span>" + sale.items.length + " product" + (sale.items.length === 1 ? "" : "s") + " &middot; " + units + " unit" + (units === 1 ? "" : "s") + "</div></div>" +
      '<div class="sv-body"><table class="sv-table"><thead><tr><th>Product</th><th class="n">Qty</th><th class="n">Price</th><th class="n">Amount</th></tr></thead><tbody>' +
      itemRows + "</tbody></table>" +
      '<div class="sv-sum">' +
      "<div><span>Subtotal</span><span>" + esc(money(gross)) + "</span></div>" +
      (discount ? "<div><span>Discount</span><span>\u2212" + esc(money(discount)) + "</span></div>" : "") +
      "<div><span>VAT (" + rate + "%) included</span><span>" + esc(money(vat)) + "</span></div>" +
      '<div class="t"><span>Total</span><span>' + esc(money(total)) + "</span></div>" +
      (paid ? "<div><span>Amount tendered</span><span>" + esc(money(paid)) + "</span></div>" +
        "<div><span>Change</span><span>" + esc(money(Number(sale.change) || 0)) + "</span></div>" : "") +
      "</div>" +
      (sale.notes ? '<p class="sv-note"><b>Notes:</b> ' + esc(sale.notes) + "</p>" : "") +
      "</div>" +
      '<div class="sv-foot"><button data-sv-close>Close</button><button class="p" data-sv-print>Print</button></div></div>';
    detailEl.classList.add("open");
    var close = detailEl.querySelector(".sv-x");
    if (close) close.focus();
  }

  function emptyEl(title, sub) {
    var div = document.createElement("div");
    div.className = "empty-state";
    div.innerHTML =
      '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#e1e6f0" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<rect x="8" y="2" width="8" height="4" rx="1"/>' +
      '<path d="M9 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3"/>' +
      '<path d="M9 12h6M9 16h6"/></svg>' +
      '<p class="title">' + esc(title) + "</p>" +
      (sub ? '<p class="sub">' + esc(sub) + "</p>" : "");
    return div;
  }

  // Replaces every row after the table head.
  function clearRows(tableWrap) {
    var head = tableWrap.querySelector(".table-head");
    Array.prototype.slice.call(tableWrap.children).forEach(function (child) {
      if (child !== head) child.remove();
    });
  }

  function emptyFor(rows) {
    return S.getSales().length > 0
      ? emptyEl("No transactions found", "Try another period or search term.")
      : emptyEl("No transactions yet");
  }

  function wirePeriodMenu(onChange, initial) {
    var wrap = document.getElementById("periodSelect");
    var btn = document.getElementById("periodBtn");
    var menu = document.getElementById("periodMenu");
    var label = document.getElementById("periodLabel");
    function mark(period) {
      label.textContent = period;
      menu.querySelectorAll("button").forEach(function (el) {
        el.classList.toggle("selected", el.dataset.period === period);
      });
    }
    mark(initial);
    btn.addEventListener("click", function () {
      menu.classList.toggle("open");
    });
    menu.addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      mark(b.dataset.period);
      menu.classList.remove("open");
      onChange(b.dataset.period);
    });
    document.addEventListener("click", function (e) {
      if (!wrap.contains(e.target)) menu.classList.remove("open");
    });
  }

  function validPeriod(p) {
    return ["Today", "This week", "This month", "This year", "All time"].indexOf(p) !== -1;
  }

  function param(name) {
    var m = new RegExp("[?&]" + name + "=([^&]*)").exec(window.location.search);
    return m ? decodeURIComponent(m[1].replace(/\+/g, " ")) : "";
  }

  return {
    esc: esc,
    filter: filter,
    totalOf: totalOf,
    summaryHtml: summaryHtml,
    rowEl: rowEl,
    openDetails: openDetails,
    emptyFor: emptyFor,
    clearRows: clearRows,
    wirePeriodMenu: wirePeriodMenu,
    validPeriod: validPeriod,
    param: param,
  };
})();
