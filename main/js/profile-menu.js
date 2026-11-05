// Shared profile dropdown for the topbar avatar button.
//
// Include this on any page that has the standard topbar:
//   <script src="auth-store.js"></script>
//   <script src="profile-menu.js"></script>
//
// It finds the profile icon button, wraps it, and hangs a menu off it with
// My account / Manage accounts / Logout. "Manage accounts" is only shown to
// admins, since that page creates and disables cashier logins.

(function () {
  var CSS = [
    ".profile-wrap{position:relative;display:inline-flex}",
    ".profile-menu{position:absolute;top:calc(100% + 10px);right:0;width:250px;",
    "background:var(--card,#fff);border:1px solid var(--border,#e3e6ee);border-radius:14px;",
    "box-shadow:0 18px 44px rgba(15,20,40,.22);overflow:hidden;z-index:120;",
    "opacity:0;visibility:hidden;transform:translateY(-6px);",
    "transition:opacity .14s ease,transform .14s ease,visibility .14s}",
    ".profile-wrap.open .profile-menu{opacity:1;visibility:visible;transform:none}",
    ".profile-menu-head{background:var(--ink,#16213e);color:#fff;padding:18px 16px 16px;",
    "display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center}",
    ".profile-avatar{width:52px;height:52px;border-radius:50%;background:#2f6fed;color:#fff;",
    "display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;",
    "letter-spacing:.5px;border:2px solid rgba(255,255,255,.35)}",
    ".profile-name{font-size:14px;font-weight:700;line-height:1.2;word-break:break-word}",
    ".profile-role{font-size:11px;font-weight:600;letter-spacing:.4px;text-transform:uppercase;",
    "color:rgba(255,255,255,.65)}",
    ".profile-menu-body{padding:8px}",
    ".profile-menu-item{display:flex;align-items:center;gap:12px;width:100%;",
    "padding:11px 12px;border:none;background:none;border-radius:10px;cursor:pointer;",
    "font-family:inherit;font-size:13.5px;font-weight:600;color:var(--text,#1b2333);",
    "text-align:left;text-decoration:none}",
    ".profile-menu-item:hover{background:var(--bg,#eef0f5)}",
    ".profile-menu-item svg{flex-shrink:0;color:var(--text-muted,#7a8299)}",
    ".profile-menu-sep{height:1px;background:var(--border,#e3e6ee);margin:6px 8px}",
    ".profile-menu-item.danger{color:#d14343}",
    ".profile-menu-item.danger svg{color:#d14343}",
  ].join("");

  var ICONS = {
    account:
      '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
    manage:
      '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.4"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17.5" cy="7" r="2.6"/><path d="M16 13.2a5.4 5.4 0 0 1 5.5 5.3"/></svg>',
    pos:
      '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.6 11.4a2 2 0 0 0 2 1.6h8.1a2 2 0 0 0 2-1.5L21.5 8H6"/></svg>',
    logout:
      '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
  };

  function initials(name) {
    var parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function build() {
    var btn = document.querySelector('.topbar-actions [aria-label="Profile"]');
    if (!btn || btn.dataset.profileMenu === "on") return;
    btn.dataset.profileMenu = "on";

    var style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);

    var wrap = document.createElement("div");
    wrap.className = "profile-wrap";
    btn.parentNode.insertBefore(wrap, btn);
    wrap.appendChild(btn);

    var session =
      typeof MynelleAuth !== "undefined" ? MynelleAuth.getSession() : null;
    var account = (session && session.account) || null;
    var name = (account && account.fullName) || "Name";
    var role = (account && account.role) || "";
    var isAdmin = !account || role === "admin";

    var menu = document.createElement("div");
    menu.className = "profile-menu";
    menu.setAttribute("role", "menu");
    menu.innerHTML =
      '<div class="profile-menu-head">' +
      '<div class="profile-avatar">' + initials(name) + "</div>" +
      '<div class="profile-name">' + name + "</div>" +
      (role ? '<div class="profile-role">' + role + "</div>" : "") +
      "</div>" +
      '<div class="profile-menu-body">' +
      '<a class="profile-menu-item" role="menuitem" href="account.html">' +
      ICONS.account + "My account</a>" +
      '<a class="profile-menu-item" role="menuitem" href="../../pos/html/pos.html">' +
      ICONS.pos + "Cashier terminal (POS)</a>" +
      (isAdmin
        ? '<a class="profile-menu-item" role="menuitem" href="accounts.html">' +
          ICONS.manage + "Manage accounts</a>"
        : "") +
      '<div class="profile-menu-sep"></div>' +
      '<button class="profile-menu-item danger" role="menuitem" type="button" id="profileLogout">' +
      ICONS.logout + "Logout</button>" +
      "</div>";
    wrap.appendChild(menu);

    btn.setAttribute("aria-haspopup", "true");
    btn.setAttribute("aria-expanded", "false");

    function close() {
      wrap.classList.remove("open");
      btn.setAttribute("aria-expanded", "false");
    }

    btn.addEventListener("click", function (e) {
      var open = wrap.classList.toggle("open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
    document.addEventListener("click", function (e) {
      if (!wrap.contains(e.target)) close();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") close();
    });

    var logoutBtn = menu.querySelector("#profileLogout");
    logoutBtn.addEventListener("click", function () {
      MynelleConfirm.ask({
        title: "Sign out?",
        message: "You'll need to sign in again to continue.",
        confirmText: "Sign out",
        tone: "danger",
      }).then(function (yes) {
        if (!yes) return;
        if (typeof MynelleAuth !== "undefined") MynelleAuth.logout();
        window.location.href = "Login.html";
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }
})();
