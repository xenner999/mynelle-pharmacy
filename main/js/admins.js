// Manage admin accounts - admins only. The developer's first admin signs in,
// then creates every other admin here. Accounts are deactivated, never deleted.
(function () {
  var session = MynelleAuth.getSession();
  var me = session && session.account;
  if (!me || me.role !== "admin") {
    window.location.replace("dashboard.html");
    return;
  }

  var admins = [];
  var editingId = null;
  var pendingStatusId = null;
  var reactivating = false;
  var el = function (id) { return document.getElementById(id); };

  var toastEl = el("toast"), toastTimer = null;
  function toast(m) {
    toastEl.textContent = m;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, 2600);
  }
  function esc(t) {
    return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  var EDIT_ICON =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
  var DEACTIVATE_ICON =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="5.6" y1="5.6" x2="18.4" y2="18.4"/></svg>';
  var REACTIVATE_ICON =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="8.5 12.2 11 14.7 15.7 9.7"/></svg>';

  function statusOf(a) {
    var s = String(a.status || "active").toLowerCase();
    return s === "disabled" ? "inactive" : s;
  }

  var rowsEl = el("adminRows"), emptyEl = el("adminEmpty"), searchEl = el("adSearch");

  function render() {
    var q = searchEl.value.trim().toLowerCase();
    var list = admins.filter(function (a) {
      return !q || [a.id, a.fullName, a.username, a.email, statusOf(a)].join(" ").toLowerCase().indexOf(q) !== -1;
    });
    emptyEl.hidden = list.length > 0;
    rowsEl.innerHTML = list.map(function (a) {
      var st = statusOf(a), isMe = a.id === me.id;
      return '<div class="table-row" data-id="' + esc(a.id) + '">' +
        '<span class="cell-muted">' + esc(a.id) + "</span>" +
        '<span class="cell-strong">' + esc(a.fullName) + (isMe ? " (you)" : "") + "</span>" +
        '<span class="cell-muted">' + esc(a.username) + "</span>" +
        '<span class="cell-muted cell-ellipsis">' + esc(a.email) + "</span>" +
        '<span class="cell-muted">Admin</span>' +
        '<span><span class="status-pill ' + st + '">' + st + "</span></span>" +
        '<span class="row-actions">' +
        '<button class="action-icon-btn" type="button" data-action="edit" title="Edit account" aria-label="Edit account">' + EDIT_ICON + "</button>" +
        (isMe ? "" : st === "active"
          ? '<button class="action-icon-btn danger" type="button" data-action="deactivate" title="Deactivate account" aria-label="Deactivate account">' + DEACTIVATE_ICON + "</button>"
          : '<button class="action-icon-btn success" type="button" data-action="reactivate" title="Reactivate account" aria-label="Reactivate account">' + REACTIVATE_ICON + "</button>") +
        "</span></div>";
    }).join("");
  }

  async function refresh() {
    try {
      admins = (await MynelleAuth.listStaff()).filter(function (a) { return a.role === "admin"; });
    } catch (e) { admins = []; }
    render();
  }
  searchEl.addEventListener("input", render);
  rowsEl.addEventListener("click", function (e) {
    var b = e.target.closest("[data-action]");
    if (!b) return;
    var id = b.closest(".table-row").dataset.id;
    if (b.dataset.action === "edit") openModal(id);
    else openStatus(id, b.dataset.action === "reactivate");
  });

  // ---- add / edit modal ----
  var overlay = el("accountOverlay"), form = el("accountForm");
  function clearErrors() {
    ["errFullName", "errUsername", "errEmail", "errPassword", "errConfirm"].forEach(function (i) { el(i).textContent = ""; });
    el("accountError").textContent = "";
    form.querySelectorAll(".has-error").forEach(function (f) { f.classList.remove("has-error"); });
  }
  function openModal(id) {
    clearErrors();
    editingId = id || null;
    var acc = id ? admins.filter(function (a) { return a.id === id; })[0] : null;
    el("accountModalTitle").textContent = acc ? "Edit admin account" : "Add admin account";
    el("accountSubmit").textContent = acc ? "Save changes" : "Add admin";
    el("fStatusField").style.display = acc && acc.id !== me.id ? "flex" : "none";
    el("fPasswordLabel").textContent = acc ? "New password" : "Password (at least 8 characters) *";
    el("fConfirmLabel").textContent = acc ? "Confirm new password" : "Confirm password *";
    form.reset();
    if (acc) {
      el("fEmployeeId").value = acc.id;
      el("fFullName").value = acc.fullName;
      el("fUsername").value = acc.username;
      el("fEmail").value = acc.email;
      el("fStatus").value = statusOf(acc);
      el("fPassword").placeholder = "Leave blank to keep current password";
    } else {
      el("fEmployeeId").value = MynelleAuth.nextStaffId(admins, "admin");
      el("fPassword").placeholder = "";
    }
    overlay.classList.add("open");
    setTimeout(function () { el("fFullName").focus(); }, 40);
  }
  function closeModal() { overlay.classList.remove("open"); editingId = null; }
  el("addAdminBtn").addEventListener("click", function () { openModal(null); });
  el("accountClose").addEventListener("click", closeModal);
  el("accountCancel").addEventListener("click", closeModal);
  overlay.addEventListener("click", function (e) { if (e.target === overlay) closeModal(); });

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    clearErrors();
    var fullName = el("fFullName").value.trim(), username = el("fUsername").value.trim();
    var email = el("fEmail").value.trim(), pw = el("fPassword").value, cf = el("fConfirm").value;
    var ok = true;
    function fail(f, er, m) { el(er).textContent = m; el(f).classList.add("has-error"); ok = false; }
    if (!fullName) fail("fFullName", "errFullName", "Full name is required.");
    if (username.length < 3) fail("fUsername", "errUsername", "At least 3 characters.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("fEmail", "errEmail", "Enter a valid email address.");
    if (!editingId || pw || cf) {
      if (pw.length < 8) fail("fPassword", "errPassword", "Password must be at least 8 characters.");
      if (pw !== cf) fail("fConfirm", "errConfirm", "Passwords do not match.");
    }
    if (!ok) return;
    if (!MynelleConfirm.gate(form, {
      title: editingId ? "Save changes to this account?" : "Create this admin account?",
      details: [["Name", fullName], ["Username", username], ["Email", email]],
      confirmText: editingId ? "Save changes" : "Create admin",
      tone: "success",
    })) return;
    try {
      if (editingId) {
        var patch = { fullName: fullName, username: username, email: email, role: "admin" };
        if (editingId !== me.id) patch.status = el("fStatus").value;
        if (pw) patch.password = pw;
        await MynelleAuth.updateStaff(editingId, patch);
        toast("Account updated");
      } else {
        await MynelleAuth.createStaff({ fullName: fullName, username: username, email: email, role: "admin", hourlyRate: 0, password: pw, confirmPassword: cf });
        toast("Admin account created - they can sign in now");
      }
      closeModal();
      await refresh();
    } catch (err) { el("accountError").textContent = err.message; }
  });

  // ---- deactivate / reactivate ----
  var statusOverlay = el("statusOverlay");
  function openStatus(id, reactivate) {
    var acc = admins.filter(function (a) { return a.id === id; })[0];
    if (!acc) return;
    pendingStatusId = id; reactivating = reactivate;
    el("statusTitle").textContent = reactivate ? "Reactivate account" : "Deactivate account";
    el("statusConfirm").textContent = reactivate ? "Reactivate" : "Deactivate";
    el("statusConfirm").className = reactivate ? "btn-primary" : "btn-danger";
    el("statusText").textContent = acc.fullName + (reactivate
      ? " will be able to sign in to the dashboard again straight away."
      : " won't be able to sign in. The record stays on file and can be reactivated any time.");
    statusOverlay.classList.add("open");
  }
  function closeStatus() { statusOverlay.classList.remove("open"); pendingStatusId = null; }
  el("statusClose").addEventListener("click", closeStatus);
  el("statusCancel").addEventListener("click", closeStatus);
  statusOverlay.addEventListener("click", function (e) { if (e.target === statusOverlay) closeStatus(); });
  el("statusConfirm").addEventListener("click", async function () {
    if (!pendingStatusId) return;
    try {
      await MynelleAuth.updateStaff(pendingStatusId, { status: reactivating ? "active" : "inactive" });
      closeStatus();
      await refresh();
      toast(reactivating ? "Account reactivated" : "Account deactivated");
    } catch (err) { closeStatus(); toast(err.message); }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    closeModal(); closeStatus();
  });
  window.addEventListener("storage", function (e) { if (e.key === MynelleAuth.ACCOUNTS_KEY) refresh(); });

  refresh();
})();
