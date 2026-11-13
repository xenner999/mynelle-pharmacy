// Dedicated page for one transaction: transaction.html?id=TXN-000123
(function () {
  var A = Analytics;
  var S = MynelleStore;
  var $ = function (id) { return document.getElementById(id); };
  A.wireBack();

  var id = A.param("id");
  var all = S.getSales().slice().sort(function (a, b) { return new Date(a.at) - new Date(b.at); });
  var idx = -1;
  all.forEach(function (s, i) { if (s.id === id) idx = i; });
  if (idx === -1) {
    A.missing("Transaction not found", "No transaction with the ID " + (id || "(none given)") + " exists on this device.", "sales-all.html", "View all transactions");
    return;
  }
  var sale = all[idx];

  function kv(rows) {
    return '<dl class="an-kv">' + rows.map(function (r) {
      var v = r.href ? '<a href="' + A.esc(r.href) + '">' + A.esc(r.value) + "</a>" : A.esc(r.value);
      return '<div class="' + (r.cls || "") + '"><dt>' + A.esc(r.label) + "</dt><dd>" + v + "</dd></div>";
    }).join("") + "</dl>";
  }
  function dayKey(d) { return d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate(); }

  var when = new Date(sale.at);
  var total = S.saleTotal(sale);
  var units = S.saleQty(sale);
  var gross = sale.items.reduce(function (a, i) { return a + i.qty * i.price; }, 0);
  var discount = Number(sale.discount) || 0;
  var rate = Number(S.getSettings().pricing.vat) || 0;
  var vat = sale.vat != null ? Number(sale.vat) : (rate ? (total * rate) / (100 + rate) : 0);
  var pay = sale.payment || "Cash";

  A.head(sale.id, S.formatDateTime(sale.at));

  // Previous / next / print
  var prev = all[idx - 1];
  var next = all[idx + 1];
  $("pageActions").innerHTML =
    (prev ? '<a class="an-btn" href="' + A.esc(A.links.transaction(prev.id)) + '">&lsaquo; Previous</a>' : '<span class="an-btn disabled">&lsaquo; Previous</span>') +
    (next ? '<a class="an-btn" href="' + A.esc(A.links.transaction(next.id)) + '">Next &rsaquo;</a>' : '<span class="an-btn disabled">Next &rsaquo;</span>') +
    '<button type="button" class="an-btn primary" id="printBtn">Print</button>';
  $("printBtn").addEventListener("click", function () { window.print(); });

  A.stats($("summary"), [
    { label: "Total", value: A.money(total), sub: discount ? "After " + A.money(discount) + " discount" : "VAT included", tone: "blue" },
    { label: "Items", value: sale.items.length + (sale.items.length === 1 ? " product" : " products"), sub: A.int(units) + (units === 1 ? " unit" : " units"), tone: "green" },
    { label: "Payment", value: pay, sub: "See all " + pay + " payments", tone: "teal", href: A.links.payment(pay, "All time") },
    { label: "Cashier", value: sale.cashier || "\u2014", sub: sale.source === "pos" ? "Recorded at the POS" : "Recorded in the app", tone: "navy" },
  ], true);

  // Items
  var cat = {};
  S.getProducts().forEach(function (p) { cat[p.id] = p.category || ""; });
  A.table($("itemsTable"), [
    {
      label: "Product", html: true,
      render: function (i) {
        var lots = (i.lots || []).map(function (l) {
          return "Lot " + (l.lot || "\u2014") + (l.expiry ? " \u00B7 exp " + l.expiry : "") + " \u00D7" + l.qty;
        }).join(", ");
        return A.esc(i.name) + (lots ? '<span class="an-sub">' + A.esc(lots) + "</span>" : "");
      },
    },
    { label: "Category", render: function (i) { return cat[i.productId] || "\u2014"; }, cls: "muted" },
    { label: "Qty", render: function (i) { return A.int(i.qty); }, cls: "num" },
    { label: "Price", render: function (i) { return A.money(i.price); }, cls: "num" },
    { label: "Amount", render: function (i) { return A.money(i.qty * i.price); }, cls: "num" },
  ], sale.items, { pageSize: 200, rowHref: function (i) { return A.links.product(i.productId); } });

  // Payment summary
  var rows = [{ label: "Subtotal", value: A.money(gross) }];
  if (discount) rows.push({ label: "Discount", value: "\u2212" + A.money(discount) });
  rows.push({ label: "VAT (" + rate + "%) included", value: A.money(vat) });
  rows.push({ label: "Total", value: A.money(total), cls: "total" });
  if (Number(sale.tendered)) {
    rows.push({ label: "Amount tendered", value: A.money(Number(sale.tendered)) });
    rows.push({ label: "Change", value: A.money(Number(sale.change) || 0) });
  }
  rows.push({ label: "Payment method", value: pay, href: A.links.payment(pay, "All time") });
  var html = kv(rows);
  if (sale.notes) html += '<p class="an-note"><b>Notes:</b> ' + A.esc(sale.notes) + "</p>";
  $("paySummary").innerHTML = html;

  // Comparison with the rest of the shop's sales
  var totals = all.map(function (s) { return S.saleTotal(s); });
  var avg = totals.reduce(function (a, b) { return a + b; }, 0) / (totals.length || 1);
  var rank = totals.filter(function (t) { return t > total; }).length + 1;
  var sameDay = all.filter(function (s) { return dayKey(new Date(s.at)) === dayKey(when); });
  var samePay = all.filter(function (s) { return (s.payment || "Cash") === pay; });
  var diff = avg ? ((total - avg) / avg) * 100 : 0;
  $("compare").innerHTML = kv([
    { label: "Size rank", value: "#" + rank + " of " + A.int(all.length) + " transactions" },
    { label: "Versus average sale", value: (diff >= 0 ? "+" : "") + diff.toFixed(1) + "% (avg " + A.money(avg) + ")" },
    { label: "Sales that day", value: A.int(sameDay.length) + " transactions", href: A.links.time("day", dayKey(when)) },
    { label: "Sales that hour", value: A.hourLabel(when.getHours()) + " hour", href: A.links.time("hour", dayKey(when) + "-" + when.getHours()) },
    { label: "Other " + pay + " sales", value: A.int(samePay.length - 1) + " more", href: A.links.payment(pay, "All time") },
  ]);
})();
