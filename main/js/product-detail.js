// Dedicated page for one product: product-detail.html?id=P001&period=This+month
(function () {
  var A = Analytics;
  var S = MynelleStore;
  var $ = function (id) { return document.getElementById(id); };
  A.wireBack();

  var id = A.param("id");
  var period = A.initialPeriod("This month");
  var p = S.getProducts().filter(function (x) { return x.id === id; })[0];
  if (!p) {
    A.missing("Product not found", "No product with the ID " + (id || "(none given)") + " is in inventory. It may have been removed.", "products-overview.html", "View all products");
    return;
  }
  A.head(p.name, (p.category || "Uncategorised") + " \u00B7 " + p.id);

  function status() {
    var stock = Number(p.stock);
    if (stock === 0) return { text: "Out of stock", tag: "red" };
    if (S.isLowStock(p)) return { text: "Low stock", tag: "gold" };
    return { text: "Healthy", tag: "green" };
  }
  function kv(rows) {
    return '<dl class="an-kv">' + rows.map(function (r) {
      var v = r.html ? r.value : r.href ? '<a href="' + A.esc(r.href) + '">' + A.esc(r.value) + "</a>" : A.esc(r.value);
      return "<div><dt>" + A.esc(r.label) + "</dt><dd>" + v + "</dd></div>";
    }).join("") + "</dl>";
  }
  function lineOf(s) {
    return s.items.filter(function (i) { return i.productId === id; });
  }

  function render() {
    var sales = S.salesIn(period);
    var withProduct = sales.filter(function (s) { return lineOf(s).length; });
    var mine = A.narrow(sales, function (i) { return i.productId === id; });
    var cur = A.totals(mine);
    var pr = A.previousRange(period);
    var prev = pr ? A.totals(A.narrow(A.salesBetween(pr.from, pr.to), function (i) { return i.productId === id; })) : null;
    var st = status();

    A.stats($("summary"), [
      { label: "In stock", value: S.formatQty(p.stock, p.unit), sub: st.text + " \u00B7 critical level " + S.criticalLevelFor(p), tone: "blue" },
      { label: "Revenue", value: A.money(cur.revenue), sub: prev ? A.changeText(cur.revenue, prev.revenue, A.previousLabel(period)) : A.int(withProduct.length) + " transactions", tone: "green" },
      { label: "Units sold", value: A.int(cur.units), sub: A.int(withProduct.length) + (withProduct.length === 1 ? " transaction" : " transactions"), tone: "teal" },
      { label: "Stock value", value: A.money(A.stockValue(p)), sub: A.money(Number(p.price)) + " each", tone: "navy" },
    ], true);

    var b = A.buckets(period, mine);
    A.line($("trendChart"), b.map(function (x) {
      return { label: x.label, title: x.title, value: x.revenue, href: A.bucketHref(period, x) };
    }), { label: "Product revenue trend", empty: "This product had no sales in this period" });

    var start = period === "All time" && sales.length
      ? new Date(Math.min.apply(null, sales.map(function (s) { return new Date(s.at); })))
      : S.periodStart(period);
    var days = Math.max(1, (new Date() - start) / 86400000);
    var perDay = cur.units / days;
    $("info").innerHTML = kv([
      { label: "Product ID", value: p.id },
      { label: "Status", html: true, value: '<span class="tag ' + st.tag + '">' + A.esc(st.text) + "</span>" },
      { label: "Category", value: p.category || "Uncategorised", href: p.category ? A.links.category(p.category, period) : "" },
      { label: "Unit price", value: A.money(Number(p.price)) },
      { label: "Critical level", value: S.formatQty(S.criticalLevelFor(p), p.unit) },
      { label: "Expiry warning", value: S.windowLabel(S.expiryWindowFor(p)) + " before expiry" },
      { label: "Sold per day", value: perDay.toFixed(1) },
      { label: "Days of stock left", value: perDay > 0 ? String(Math.round(Number(p.stock) / perDay)) : "\u2014" },
    ]);

    A.table($("batchTable"), [
      { label: "Lot", render: function (x) { return x.lot || "\u2014"; } },
      { label: "Expiry", render: function (x) { return x.expiry || "No expiry"; }, cls: "muted" },
      {
        label: "Status", html: true,
        render: function (x) {
          var d = A.daysUntil(x.expiry);
          if (d === null) return '<span class="tag">No date</span>';
          if (d < 0) return '<span class="tag red">Expired</span>';
          if (d <= S.expiryWindowFor(p)) return '<span class="tag gold">' + d + " days left</span>";
          return '<span class="tag green">' + d + " days left</span>";
        },
      },
      { label: "Qty", render: function (x) { return S.formatQty(x.qty, p.unit); }, cls: "num" },
      { label: "Value", render: function (x) { return A.money(x.qty * Number(p.price)); }, cls: "num" },
    ], p.batches, { empty: "No batches in stock", pageSize: 8 });

    A.txnTable($("txnTable"), A.newest(withProduct), {
      amountLabel: "This product",
      amount: function (s) { return lineOf(s).reduce(function (a, i) { return a + i.qty * i.price; }, 0); },
      empty: "No transactions with this product in this period",
    });

    var typeText = { receive: "Received", adjust: "Adjusted", sale: "Sold" };
    A.table($("moveTable"), [
      { label: "Date and time", render: function (m) { return S.formatDateTime(m.at); }, cls: "muted" },
      { label: "Type", render: function (m) { return typeText[m.type] || m.type; } },
      { label: "Lot", render: function (m) { return m.lot || "\u2014"; }, cls: "muted" },
      { label: "Change", render: function (m) { return (m.qty > 0 ? "+" : "") + m.qty; }, cls: "num" },
      { label: "Reference", render: function (m) { return m.reason || ""; }, cls: "muted" },
    ], S.getStockLog(id, 40), {
      empty: "No stock movements recorded yet",
      rowHref: function (m) { return /^TXN-/.test(m.reason || "") ? A.links.transaction(m.reason) : ""; },
    });
  }

  A.tabs($("periodTabs"), period, function (x) { period = x; render(); });
  A.onResize(render);
  render();
})();
