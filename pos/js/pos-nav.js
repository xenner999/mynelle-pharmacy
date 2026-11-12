// Shared by the POS and the Time Tracker pages.
//
// Who is "at the till" is a CASHIER who proved their identity with their
// password at the Time Tracker (or signed in to the app as a cashier). Admins
// and pharmacists are not employees of the till, so they are never signed in
// here automatically.
//
//   Time Tracker  -> enter Employee ID + password -> Check in -> Open POS
//   POS           -> only open for a cashier who is currently checked in
(function () {
  var MAIN = "../../main/html/";
  var KEY = "mynelle_pos_session";
  var onTracker = /timetracker\.html/.test(location.pathname);
  var onPerf = /performance\.html/.test(location.pathname); // open to any signed-in cashier, checked in or not

  function accounts() {
    try { return JSON.parse(localStorage.getItem(MynelleAuth.ACCOUNTS_KEY)) || []; } catch (e) { return []; }
  }
  // The stored account must still exist, be a cashier and be active.
  function stillValid(acc) {
    if (!acc) return false;
    var a = accounts().filter(function (x) { return x.id === acc.id; })[0];
    return !!a && a.role === "cashier" && String(a.status || "active").toLowerCase() === "active";
  }
  function readPos() {
    try { var s = JSON.parse(localStorage.getItem(KEY)); return s && s.account ? s.account : null; } catch (e) { return null; }
  }

  var main = MynelleAuth.getSession();
  var mainAcc = main && main.account ? main.account : null;
  var account = readPos();
  if (!stillValid(account)) account = null;
  if (!account && mainAcc && mainAcc.role === "cashier" && stillValid(mainAcc)) account = mainAcc;
  if (!account) { try { localStorage.removeItem(KEY); } catch (e) {} }

  window.PosSession = {
    account: account,
    mainAccount: mainAcc,
    set: function (acc) {
      try { localStorage.setItem(KEY, JSON.stringify({ account: acc, at: new Date().toISOString() })); } catch (e) {}
      this.account = acc;
    },
    // leave the till without touching the main session (used after an admin signs in)
    release: function () {
      try { localStorage.removeItem(KEY); } catch (e) {}
      this.account = null;
    },
    clear: function () {
      try { localStorage.removeItem(KEY); } catch (e) {}
      // a cashier who signed in through the main login is signed out too
      if (mainAcc && mainAcc.role === "cashier") MynelleAuth.logout();
      this.account = null;
    },
  };

  // Gate the POS: signed-in cashier who has checked in.
  if (!onTracker && !onPerf && (!account || !TimeStore.openShift(account.id))) {
    window.location.replace("timetracker.html");
    return;
  }

  // ---- Back to the dashboard: needs an admin/pharmacist sign-in ----
  var GATE_CSS =
    ".ag-overlay{position:fixed;inset:0;background:rgba(13, 13, 13,.55);display:none;align-items:center;justify-content:center;z-index:100;padding:16px}" +
    ".ag-overlay.open{display:flex}" +
    ".ag-card{background:#fff;border-radius:14px;width:100%;max-width:380px;padding:24px;box-shadow:0 24px 60px rgba(0, 0, 0,.3);font-family:inherit}" +
    ".ag-card h3{margin:0 0 4px;font-size:17px}.ag-card p{margin:0 0 16px;font-size:13px;color:#6b7280}" +
    ".ag-card input{width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid #d3d5d9;border-radius:8px;font:inherit;margin-bottom:10px}" +
    ".ag-err{color:#d90416;font-size:13px;margin:0 0 10px;min-height:0}" +
    ".ag-row{display:flex;gap:10px;margin-top:6px}.ag-row button{flex:1;padding:11px;border-radius:8px;border:1px solid #d3d5d9;background:#fff;font-weight:600;font-size:14px;font-family:inherit;cursor:pointer}" +
    ".ag-row .go{background:#032f8a;border-color:#032f8a;color:#fff}.ag-row button:disabled{opacity:.6;cursor:wait}";
  var gateStyle = document.createElement("style");
  gateStyle.textContent = GATE_CSS;
  document.head.appendChild(gateStyle);

  var gateEl = null;
  var gateTarget = MAIN + "dashboard.html";
  function buildGate() {
    gateEl = document.createElement("div");
    gateEl.className = "ag-overlay";
    gateEl.innerHTML =
      '<form class="ag-card" autocomplete="off">' +
      "<h3>Admin sign-in required</h3>" +
      "<p>Enter an admin account to leave the cashier terminal.</p>" +
      '<input id="agUser" placeholder="Admin username or email" autocomplete="username" />' +
      '<input id="agPass" type="password" placeholder="Password" autocomplete="current-password" />' +
      '<div class="ag-err" id="agErr"></div>' +
      '<div class="ag-row"><button type="button" id="agCancel">Cancel</button><button type="submit" class="go" id="agGo">Continue</button></div>' +
      "</form>";
    document.body.appendChild(gateEl);
    gateEl.addEventListener("click", function (e) { if (e.target === gateEl) closeGate(); });
    gateEl.querySelector("#agCancel").addEventListener("click", closeGate);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeGate(); });
    gateEl.querySelector("form").addEventListener("submit", async function (e) {
      e.preventDefault();
      var user = gateEl.querySelector("#agUser").value.trim();
      var pass = gateEl.querySelector("#agPass").value;
      var err = gateEl.querySelector("#agErr");
      var go = gateEl.querySelector("#agGo");
      err.textContent = "";
      if (!user || !pass) { err.textContent = "Enter the admin username and password."; return; }
      go.disabled = true;
      var previous = localStorage.getItem(MynelleAuth.SESSION_KEY); // restore if it isn't an admin
      try {
        var acct = await MynelleAuth.login({ identifier: user, password: pass });
        if (!acct || acct.role === "cashier") {
          MynelleAuth.logout();
          if (previous) localStorage.setItem(MynelleAuth.SESSION_KEY, previous);
          throw new Error("That is not an admin account.");
        }
        window.PosSession.release();
        window.location.href = gateTarget;
      } catch (ex) {
        err.textContent = (ex && ex.message) || "Could not sign in.";
        go.disabled = false;
      }
    });
  }
  function openGate(target) {
    if (!gateEl) buildGate();
    gateTarget = target || MAIN + "dashboard.html";
    gateEl.querySelector("#agUser").value = "";
    gateEl.querySelector("#agPass").value = "";
    gateEl.querySelector("#agErr").textContent = "";
    gateEl.querySelector("#agGo").disabled = false;
    gateEl.classList.add("open");
    setTimeout(function () { gateEl.querySelector("#agUser").focus(); }, 30);
  }
  function closeGate() { if (gateEl) gateEl.classList.remove("open"); }
  window.PosNav = { openAdminGate: openGate };

  var CSS =
    ".nav-wrap{position:relative}" +
    ".nav-menu{position:absolute;right:0;top:calc(100% + 10px);width:240px;background:#fff;border:1px solid #e3e6ed;border-radius:12px;box-shadow:0 18px 44px rgba(12, 12, 12,.2);overflow:hidden;z-index:50;display:none}" +
    ".nav-wrap.open .nav-menu{display:block}" +
    ".nav-head{background:#032f8a;color:#fff;padding:14px 16px}" +
    ".nav-head b{display:block;font-size:14px}" +
    ".nav-head span{font-size:11px;letter-spacing:.4px;text-transform:uppercase;opacity:.7}" +
    ".nav-item{display:block;width:100%;text-align:left;padding:12px 16px;border:none;background:none;font-weight:600;font-size:13.5px;font-family:inherit;color:#1a1a1a;cursor:pointer;text-decoration:none}" +
    ".nav-item:hover{background:#f2f4f7}" +
    ".nav-item.danger{color:#d90416;border-top:1px solid #f2f4f7}" +
    ".nav-item.current{color:#0442bf;background:#eef3ff}";
  var style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);

  function init() {
    var back = document.getElementById("termBack");
    if (back) back.addEventListener("click", function () { openGate(); });
    var btn = document.querySelector(".avatar-btn");
    if (!btn) return;
    var wrap = document.createElement("div");
    wrap.className = "nav-wrap";
    btn.parentNode.insertBefore(wrap, btn);
    wrap.appendChild(btn);
    btn.setAttribute("aria-label", "Profile");
    btn.title = account ? account.fullName || "Profile" : "Menu";

    var checkedIn = account && TimeStore.openShift(account.id);
    var items =
      (checkedIn ? '<a class="nav-item' + (onTracker || onPerf ? "" : " current") + '" href="pos.html">&#128722; Point of Sale</a>' : "") +
      (account ? '<a class="nav-item' + (onPerf ? " current" : "") + '" href="performance.html">&#128200; My Performance</a>' : "") +
      '<a class="nav-item' + (onTracker ? " current" : "") + '" href="timetracker.html">&#128339; Time Tracker (Check in / out)</a>' +
      '<button class="nav-item" type="button" id="navDash">&#128202; Back to Dashboard (admin)</button>' +
      (account ? '<button class="nav-item danger" type="button" id="navLogout">&#10162; Sign out</button>' : "");
    var menu = document.createElement("div");
    menu.className = "nav-menu";
    menu.innerHTML = '<div class="nav-head"><b></b><span></span></div>' + items;
    menu.querySelector("b").textContent = account ? account.fullName || "Signed in" : "Not signed in";
    menu.querySelector("span").textContent = account ? account.role || "" : "Cashier terminal";
    wrap.appendChild(menu);

    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      wrap.classList.toggle("open");
    });
    document.addEventListener("click", function (e) {
      if (!wrap.contains(e.target)) wrap.classList.remove("open");
    });
    menu.querySelector("#navDash").addEventListener("click", function () {
      wrap.classList.remove("open");
      openGate();
    });
    var out = menu.querySelector("#navLogout");
    if (out) out.addEventListener("click", function () {
      window.PosSession.clear();
      window.location.href = "timetracker.html";
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
