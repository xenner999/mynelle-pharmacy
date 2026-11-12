// Dashboard search: looks across the whole app (products, sales, stock
// records, cashiers, pages) and shows matches in a dropdown.
(function () {
  var input = document.getElementById("searchInput");
  var wrap = input && input.closest(".search-wrap");
  if (!input || !wrap) return;
  input.placeholder = "Search products, sales, records...";
  input.setAttribute("autocomplete", "off");

  var style = document.createElement("style");
  style.textContent =
    ".search-wrap{position:relative}" +
    ".gs-drop{position:absolute;left:0;top:calc(100% + 8px);width:min(520px,92vw);max-height:70vh;overflow:auto;background:#fff;border:1px solid #e3e6ed;border-radius:14px;box-shadow:0 18px 44px rgba(12, 12, 12,.18);z-index:80;display:none;padding:6px}" +
    ".gs-drop.open{display:block}" +
    ".gs-group{padding:8px 10px 4px;font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#9ea3ad}" +
    ".gs-item{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:9px 10px;border-radius:9px;color:#0d0d0d;text-decoration:none;font-size:13.5px;cursor:pointer}" +
    ".gs-item:hover,.gs-item.active{background:#f0f3fa}" +
    ".gs-main{min-width:0}.gs-main b{display:block;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    ".gs-main span{display:block;font-size:12px;color:#6b7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    ".gs-side{font-size:12px;color:#6b7280;white-space:nowrap}" +
    ".gs-none{padding:18px;text-align:center;color:#6b7280;font-size:13.5px}" +
    ":root[data-theme=dark] .gs-drop{background:#171717;border-color:#2a2a2a}:root[data-theme=dark] .gs-item{color:#e3e6ed}:root[data-theme=dark] .gs-item:hover,:root[data-theme=dark] .gs-item.active{background:#232323}";
  document.head.appendChild(style);

  var drop = document.createElement("div");
  drop.className = "gs-drop";
  wrap.appendChild(drop);

  var PAGES = [
    ["Dashboard", "dashboard.html", "overview home"],
    ["Inventory", "inventory.html", "products stock items medicines"],
    ["Sales", "sales.html", "transactions revenue"],
    ["Reports", "reports.html", "sales trend best selling"],
    ["Analytics", "analytics.html", "charts category payment expiry valuation"],
    ["Orders", "orders.html", "purchase order restock reorder supplier receive delivery"],
    ["Alerts", "alerts.html", "notifications low stock expiring out of stock"],
    ["Low stock", "low-stock.html", "reorder alerts"],
    ["Out of stock", "out-of-stock.html", "alerts"],
    ["Expiring soon", "expiring-soon.html", "expiry alerts"],
    ["Cashier accounts", "accounts.html", "manage accounts attendance payroll pay report check in"],
    ["Settings", "settings.html", "preferences vat business"],
  ];

  function esc(t) {
    return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function norm(t) { return String(t || "").toLowerCase().replace(/\s+/g, " "); }
  function all(hay, tokens) {
    var h = norm(hay);
    return tokens.every(function (k) { return h.indexOf(k) !== -1; });
  }
  var money = function (n) { return MynelleStore.formatCurrency(n); };

  function search(q) {
    var tokens = norm(q).trim().split(" ").filter(Boolean);
    var groups = [];
    if (!tokens.length) return groups;

    var products = MynelleStore.getProducts();
    var byId = {};
    products.forEach(function (p) { byId[p.id] = p; });

    var prod = products.filter(function (p) {
      var lots = (p.batches || []).map(function (b) { return b.lot; }).join(" ");
      return all([p.name, p.brand, p.genericName, p.category, p.id, lots].join(" "), tokens);
    }).slice(0, 5).map(function (p) {
      var stock = MynelleStore.sellableStock ? MynelleStore.sellableStock(p) : p.stock;
      return { title: p.name, sub: [p.brand, p.category].filter(Boolean).join(" \u00B7 "), side: stock + " in stock", href: "inventory.html?q=" + encodeURIComponent(p.name) };
    });
    groups.push(["Products", prod]);

    var sales = MynelleStore.getSales().slice().reverse().filter(function (s) {
      var items = (s.items || []).map(function (i) { return i.name || (byId[i.productId] || {}).name; }).join(" ");
      return all([s.id, s.payment, s.cashier, items, MynelleStore.formatDateTime(s.at)].join(" "), tokens);
    }).slice(0, 5).map(function (s) {
      var n = (s.items || []).reduce(function (a, i) { return a + i.qty; }, 0);
      return { title: s.id, sub: MynelleStore.formatDateTime(s.at) + " \u00B7 " + s.payment + " \u00B7 " + n + " item" + (n === 1 ? "" : "s"), side: money(MynelleStore.saleTotal(s)), href: "sales-all.html?period=All%20time&q=" + encodeURIComponent(s.id) };
    });
    groups.push(["Sales", sales]);

    var log = MynelleStore.getStockLog(null, 400).filter(function (m) {
      var p = byId[m.productId] || {};
      return all([p.name, m.type, m.lot, m.reason].join(" "), tokens);
    }).slice(0, 4).map(function (m) {
      var p = byId[m.productId] || {};
      return { title: (p.name || m.productId) + " \u2014 " + m.type, sub: [m.lot ? "Lot " + m.lot : "", m.reason].filter(Boolean).join(" \u00B7 "), side: (m.qty > 0 ? "+" : "") + m.qty, href: "inventory.html?q=" + encodeURIComponent(p.name || "") };
    });
    groups.push(["Stock records", log]);

    var staff = [];
    try { staff = JSON.parse(localStorage.getItem(MynelleAuth.ACCOUNTS_KEY)) || []; } catch (e) {}
    var people = staff.filter(function (a) {
      return all([a.fullName, a.username, a.email, a.id, a.role].join(" "), tokens);
    }).slice(0, 3).map(function (a) {
      return { title: a.fullName, sub: a.id + " \u00B7 " + a.username, side: a.role, href: "accounts.html" };
    });
    groups.push(["People", people]);

    var pages = PAGES.filter(function (p) { return all(p[0] + " " + p[2], tokens); }).slice(0, 4).map(function (p) {
      return { title: p[0], sub: "Open page", side: "", href: p[1] };
    });
    groups.push(["Pages", pages]);

    return groups.filter(function (g) { return g[1].length; });
  }

  var links = [];
  var active = -1;
  function setActive(i) {
    links.forEach(function (l, n) { l.classList.toggle("active", n === i); });
    active = i;
    if (links[i]) links[i].scrollIntoView({ block: "nearest" });
  }

  function render() {
    var q = input.value.trim();
    if (!q) { drop.classList.remove("open"); links = []; return; }
    var groups = search(q);
    drop.innerHTML = groups.length
      ? groups.map(function (g) {
          return '<div class="gs-group">' + esc(g[0]) + "</div>" + g[1].map(function (r) {
            return '<a class="gs-item" href="' + esc(r.href) + '"><div class="gs-main"><b>' + esc(r.title) + "</b><span>" + esc(r.sub) + '</span></div><div class="gs-side">' + esc(r.side) + "</div></a>";
          }).join("");
        }).join("")
      : '<div class="gs-none">No results for "' + esc(q) + '"</div>';
    links = Array.prototype.slice.call(drop.querySelectorAll(".gs-item"));
    active = -1;
    drop.classList.add("open");
  }

  input.addEventListener("input", render);
  input.addEventListener("focus", render);
  input.addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(Math.min(links.length - 1, active + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(Math.max(0, active - 1)); }
    else if (e.key === "Enter") {
      var target = links[active] || links[0];
      if (target) window.location.href = target.getAttribute("href");
    } else if (e.key === "Escape") { drop.classList.remove("open"); input.blur(); }
  });
  document.addEventListener("click", function (e) {
    if (!wrap.contains(e.target)) drop.classList.remove("open");
  });
})();
