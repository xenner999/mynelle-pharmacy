// Shared alert engine + topbar notifications dropdown.
//
// Include this on any page that has the standard topbar, after
// settings-store.js so MynelleStore is available:
//   <script src="settings-store.js"></script>
//   <script src="notifications.js"></script>
//
// This file does two things:
//  1. Exposes window.MynelleAlerts — turns live product data into a
//     prioritized alert list (see the scoring notes below) plus a small
//     "dismissed" store, shared by this dropdown AND the full
//     Notifications page (notifications.html / notifications-page.js) so
//     the two never disagree.
//  2. Mounts the bell dropdown itself.

(function () {
  var DISMISSED_KEY = "mynelle_dismissed_alerts";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function daysLeft(expiry) {
    var diff = (new Date(expiry) - new Date()) / (1000 * 60 * 60 * 24);
    return Math.max(0, Math.ceil(diff));
  }

  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }

  function tierFor(score) {
    if (score >= 85) return "Critical";
    if (score >= 65) return "High";
    if (score >= 40) return "Medium";
    return "Watch";
  }

  // ---- Dismissed-alert store (per browser, localStorage) ----
  function getDismissed() {
    try {
      var raw = localStorage.getItem(DISMISSED_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }
  function setDismissed(arr) {
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(arr));
    } catch (e) {}
    document.dispatchEvent(new CustomEvent("mynelle:products-changed"));
  }
  function isDismissed(key) {
    return getDismissed().indexOf(key) !== -1;
  }
  function dismiss(key) {
    var list = getDismissed();
    if (list.indexOf(key) === -1) list.push(key);
    setDismissed(list);
  }
  function undismiss(key) {
    setDismissed(getDismissed().filter(function (k) {
      return k !== key;
    }));
  }
  function clearDismissed() {
    setDismissed([]);
  }

  // ---- Priority scoring ----
  // Every alert gets a 0-100 urgency score so the dropdown and the
  // Notifications page can both rank "what needs attention first" the
  // same way, instead of just listing alerts in whatever order the
  // product table happens to be in.
  //
  //  • Out of stock        → always 100 (Critical)
  //  • Low stock            → 90 down to 40 as stock rises from empty
  //                           up to the critical-level threshold
  //  • Expiring soon        → 85 down to 15 as the expiry date moves
  //                           from today out to the edge of the
  //                           expiry window set in Settings
  //
  // Tiers: 85+ Critical, 65-84 High, 40-64 Medium, under 40 Watch.
  function scoreOut() {
    return 100;
  }
  function scoreLow(p) {
    var threshold = MynelleStore.criticalLevelFor(p) || 1;
    var ratio = clamp(Number(p.stock) / threshold, 0, 1);
    return Math.round(clamp(90 - ratio * 50, 40, 90));
  }
  function scoreExpiring(left) {
    return Math.round(clamp(85 - left * 4, 15, 85));
  }

  function buildAlerts(opts) {
    opts = opts || {};
    if (typeof MynelleStore === "undefined") return [];
    var settings = MynelleStore.getSettings();
    var products = MynelleStore.getProducts();
    var dismissed = getDismissed();
    var out = [];

    if (settings.general.lowStockAlerts) {
      products.forEach(function (p) {
        if (!MynelleStore.isLowStock(p)) return;
        var isOut = Number(p.stock) === 0;
        var type = isOut ? "out" : "low";
        var score = isOut ? scoreOut() : scoreLow(p);
        out.push({
          key: p.id + ":" + type,
          type: type,
          product: p,
          score: score,
          tier: tierFor(score),
          title: p.name + (isOut ? " is out of stock" : " is low on stock"),
          sub: isOut
            ? "Restock as soon as possible."
            : MynelleStore.formatQty(p.stock, p.unit) + " left.",
          detail: isOut
            ? "0 " + MynelleStore.pluralizeUnit(p.unit, 0) + " remaining"
            : MynelleStore.formatQty(p.stock, p.unit) +
              " remaining \u2014 threshold " +
              MynelleStore.formatQty(MynelleStore.criticalLevelFor(p), p.unit),
        });
      });
    }

    if (settings.general.expiryAlerts) {
      products.filter(MynelleStore.isExpiringSoon).forEach(function (p) {
        var left = daysLeft(p.expiry);
        var score = scoreExpiring(left);
        out.push({
          key: p.id + ":expiring",
          type: "expiring",
          product: p,
          score: score,
          tier: tierFor(score),
          daysLeft: left,
          title: p.name + " is expiring soon",
          sub:
            left === 0
              ? "Expires today."
              : "Expires in " + left + (left === 1 ? " day." : " days."),
          detail:
            "Expires " +
            new Date(p.expiry).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            }) +
            " \u2014 " +
            left +
            (left === 1 ? " day left" : " days left"),
        });
      });
    }

    out.sort(function (a, b) {
      return b.score - a.score;
    });

    out.forEach(function (a) {
      a.dismissed = dismissed.indexOf(a.key) !== -1;
    });

    if (!opts.includeDismissed) {
      out = out.filter(function (a) {
        return !a.dismissed;
      });
    }

    return out;
  }

  window.MynelleAlerts = {
    build: buildAlerts,
    tierFor: tierFor,
    isDismissed: isDismissed,
    dismiss: dismiss,
    undismiss: undismiss,
    clearDismissed: clearDismissed,
    DISMISSED_KEY: DISMISSED_KEY,
  };

  // =====================================================================
  // Topbar dropdown
  // =====================================================================

  var CSS = [
    ".notif-wrap{position:relative;display:inline-flex}",
    ".notif-dot{position:absolute;top:-2px;right:-2px;min-width:16px;height:16px;",
    "padding:0 4px;border-radius:999px;background:var(--red,#d90416);color:#fff;",
    "font-size:10px;font-weight:700;line-height:16px;text-align:center;",
    "border:2px solid var(--card,#fff);font-family:var(--font-sans,inherit)}",
    ".notif-menu{position:absolute;top:calc(100% + 10px);z-index:120;",
    "right:0;width:340px;max-width:calc(100vw - 32px);",
    "background:var(--card,#fff);border:1px solid var(--border,#e1e6f0);border-radius:14px;",
    "box-shadow:0 18px 44px rgba(12, 12, 12,.22);overflow:hidden;",
    "opacity:0;visibility:hidden;transform:translateY(-6px);",
    "transition:opacity .14s ease,transform .14s ease,visibility .14s}",
    ".notif-wrap.open .notif-menu{opacity:1;visibility:visible;transform:none}",
    ".notif-head{display:flex;align-items:center;justify-content:space-between;",
    "padding:14px 16px;border-bottom:1px solid var(--border,#e1e6f0)}",
    ".notif-head h3{margin:0;font-size:14px;font-weight:700;color:var(--text,#0d0d0d);",
    "font-family:var(--font-sans,inherit)}",
    ".notif-head span{font-size:11.5px;font-weight:600;color:var(--text-muted,#6b7280);",
    "font-family:var(--font-sans,inherit)}",
    ".notif-list{max-height:360px;overflow-y:auto}",
    ".notif-item{display:flex;gap:12px;align-items:flex-start;width:100%;",
    "padding:12px 16px;border:none;background:none;cursor:pointer;text-align:left;",
    "text-decoration:none;border-bottom:1px solid var(--border,#e1e6f0)}",
    ".notif-item:last-child{border-bottom:none}",
    ".notif-item:hover{background:var(--bg,#f2f4f9)}",
    ".notif-icon{width:32px;height:32px;border-radius:9px;flex-shrink:0;",
    "display:flex;align-items:center;justify-content:center;color:#fff}",
    ".notif-icon.red{background:var(--red,#d90416)}",
    ".notif-icon.gold{background:var(--gold,#b4740e)}",
    ".notif-body{min-width:0;display:flex;flex-direction:column;flex:1}",
    ".notif-title{font-size:13px;font-weight:600;color:var(--text,#0d0d0d);",
    "line-height:1.35;font-family:var(--font-sans,inherit)}",
    ".notif-sub{font-size:12px;color:var(--text-muted,#6b7280);margin-top:2px;",
    "font-family:var(--font-sans,inherit)}",
    ".notif-empty{padding:40px 20px;text-align:center;color:var(--text-muted,#6b7280)}",
    ".notif-empty svg{margin-bottom:10px;color:#22a06b}",
    ".notif-empty p{margin:0;font-size:13px;font-weight:600;color:var(--text,#0d0d0d);",
    "font-family:var(--font-sans,inherit)}",
    ".notif-empty p.sub{margin-top:4px;font-size:12px;font-weight:400;",
    "color:var(--text-muted,#6b7280)}",
    ".notif-foot{display:block;padding:11px 16px;text-align:center;font-size:12.5px;",
    "font-weight:600;color:var(--blue,#0442bf);text-decoration:none;",
    "border-top:1px solid var(--border,#e1e6f0);font-family:var(--font-sans,inherit)}",
    ".notif-foot:hover{background:var(--bg,#f2f4f9)}",
  ].join("");

  var ICON_OUT =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
  var ICON_LOW =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>';
  var ICON_EXP =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
  var ICON_CHECK =
    '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.5"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/></svg>';

  var ICON_BY_TYPE = { out: ICON_OUT, low: ICON_LOW, expiring: ICON_EXP };
  var COLOR_BY_TYPE = { out: "red", low: "gold", expiring: "gold" };

  function build() {
    var btn = document.querySelector(
      '.topbar-actions [aria-label="Notifications"]'
    );
    if (!btn || btn.dataset.notifMenu === "on") return;
    btn.dataset.notifMenu = "on";

    var style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);

    var wrap = document.createElement("div");
    wrap.className = "notif-wrap";
    btn.parentNode.insertBefore(wrap, btn);
    wrap.appendChild(btn);

    var dot = document.createElement("span");
    dot.className = "notif-dot";
    dot.style.display = "none";
    wrap.appendChild(dot);

    var menu = document.createElement("div");
    menu.className = "notif-menu";
    menu.setAttribute("role", "menu");
    wrap.appendChild(menu);

    btn.setAttribute("aria-haspopup", "true");
    btn.setAttribute("aria-expanded", "false");

    function render() {
      var items = buildAlerts();

      if (items.length === 0) {
        dot.style.display = "none";
      } else {
        dot.style.display = "block";
        dot.textContent = items.length > 9 ? "9+" : String(items.length);
      }

      var bodyHtml;
      if (items.length === 0) {
        bodyHtml =
          '<div class="notif-empty">' +
          ICON_CHECK +
          "<p>You're all caught up</p>" +
          '<p class="sub">No stock or expiry alerts right now.</p>' +
          "</div>";
      } else {
        bodyHtml =
          '<div class="notif-list">' +
          items
            .slice(0, 8)
            .map(function (it) {
              return (
                '<a class="notif-item" role="menuitem" href="notifications.html">' +
                '<span class="notif-icon ' +
                COLOR_BY_TYPE[it.type] +
                '">' +
                ICON_BY_TYPE[it.type] +
                "</span>" +
                '<span class="notif-body">' +
                '<span class="notif-title">' +
                esc(it.title) +
                "</span>" +
                '<span class="notif-sub">' +
                esc(it.sub) +
                "</span>" +
                "</span>" +
                "</a>"
              );
            })
            .join("") +
          "</div>";
      }

      menu.innerHTML =
        '<div class="notif-head"><h3>Notifications</h3>' +
        (items.length ? "<span>" + items.length + " active</span>" : "") +
        "</div>" +
        bodyHtml +
        '<a class="notif-foot" href="notifications.html">View all notifications</a>';
    }

    render();

    function close() {
      wrap.classList.remove("open");
      btn.setAttribute("aria-expanded", "false");
    }

    btn.addEventListener("click", function (e) {
      var open = wrap.classList.toggle("open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) render();
    });
    document.addEventListener("click", function (e) {
      if (!wrap.contains(e.target)) close();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") close();
    });

    // Keep the badge in sync if products/settings/dismissals change in
    // another tab (or after Add product / Settings save / a dismiss
    // action in this one).
    window.addEventListener("storage", function (e) {
      if (
        e.key === MynelleStore.PRODUCTS_KEY ||
        e.key === MynelleStore.SETTINGS_KEY ||
        e.key === DISMISSED_KEY
      ) {
        render();
      }
    });
    document.addEventListener("mynelle:products-changed", render);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }
})();
