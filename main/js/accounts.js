// Manage accounts — admins create the other admin accounts and the cashier
// (POS) logins here. There is no public registration: the developer's first
// admin signs in, then adds everyone else from this page. Accounts are
// never deleted from here either — they're deactivated, so the employee
// record (and anything tied to it, like past sales) stays on file.
//
// All reads/writes go through MynelleAuth (auth-store.js), which tries the
// real API first and falls back to localStorage while no database is
// connected.

(function () {
  var STAFF_ROLE = "cashier";

  // Only admins may manage accounts.
  var session = MynelleAuth.getSession();
  var me = session && session.account;
  if (!me || me.role !== "admin") {
    window.location.replace("dashboard.html");
    return;
  }

  var accounts = [];
  var admins = [];
  var modalRole = STAFF_ROLE;
  var editingId = null;
  var pendingStatusId = null;

  var el = function (id) {
    return document.getElementById(id);
  };

  // -------------------------------------------------------------------
  // Toast
  // -------------------------------------------------------------------
  var toastEl = el("toast");
  var toastTimer = null;
  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove("show");
    }, 2600);
  }

  // -------------------------------------------------------------------
  // Table
  // -------------------------------------------------------------------
  var rowsEl = el("accountRows");
  var emptyEl = el("accountsEmpty");
  var searchEl = el("accSearch");

  function escapeHtml(text) {
    return String(text == null ? "" : text).replace(/[&<>"']/g, function (c) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c];
    });
  }

  var EDIT_ICON =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
  var DEACTIVATE_ICON =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="5.6" y1="5.6" x2="18.4" y2="18.4"/></svg>';
  var REACTIVATE_ICON =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="8.5 12.2 11 14.7 15.7 9.7"/></svg>';

  function statusOf(account) {
    var status = String(account.status || "active").toLowerCase();
    if (status === "disabled") status = "inactive";
    return status;
  }

  function render() {
    var query = searchEl.value.trim().toLowerCase();
    var list = accounts.filter(function (a) {
      if (!query) return true;
      return (
        a.id.toLowerCase().indexOf(query) !== -1 ||
        a.fullName.toLowerCase().indexOf(query) !== -1 ||
        a.username.toLowerCase().indexOf(query) !== -1 ||
        (a.email || "").toLowerCase().indexOf(query) !== -1 ||
        statusOf(a).indexOf(query) !== -1
      );
    });

    if (!list.length) {
      rowsEl.innerHTML = "";
      emptyEl.hidden = false;
      emptyEl.querySelector(".title").textContent = query
        ? "No cashiers match that search"
        : "No cashier accounts yet";
      emptyEl.querySelector(".sub").textContent = query
        ? "Try a different name, username or status."
        : "Add one so a cashier can sign in to the POS.";
      return;
    }

    emptyEl.hidden = true;
    rowsEl.innerHTML = list
      .map(function (a) {
        var status = statusOf(a);
        var isActive = status === "active";
        return (
          '<div class="table-row" data-id="' + escapeHtml(a.id) + '">' +
          '<span class="cell-muted">' + escapeHtml(a.id) + "</span>" +
          '<span class="cell-strong">' + escapeHtml(a.fullName) + "</span>" +
          '<span class="cell-muted">' + escapeHtml(a.username) + "</span>" +
          '<span class="cell-muted cell-ellipsis">' + escapeHtml(a.email) + "</span>" +
          '<span class="cell-muted">' + (a.hourlyRate ? escapeHtml(MynelleStore.formatCurrency(a.hourlyRate)) : "&mdash;") + "</span>" +
          '<span><span class="status-pill ' + status + '">' + status + "</span></span>" +
          '<span class="row-actions">' +
          '<button class="action-icon-btn" type="button" data-action="edit" title="Edit account" aria-label="Edit account">' +
          EDIT_ICON + "</button>" +
          (isActive
            ? '<button class="action-icon-btn danger" type="button" data-action="deactivate" title="Deactivate account" aria-label="Deactivate account">' +
              DEACTIVATE_ICON + "</button>"
            : '<button class="action-icon-btn success" type="button" data-action="reactivate" title="Reactivate account" aria-label="Reactivate account">' +
              REACTIVATE_ICON + "</button>") +
          "</span>" +
          "</div>"
        );
      })
      .join("");
  }

  function renderAdmins() {
    var box = el("adminRows");
    if (!box) return;
    box.innerHTML = admins
      .map(function (a) {
        var status = statusOf(a);
        var isActive = status === "active";
        var isMe = a.id === me.id;
        return (
          '<div class="table-row" data-id="' + escapeHtml(a.id) + '">' +
          '<span class="cell-muted">' + escapeHtml(a.id) + "</span>" +
          '<span class="cell-strong">' + escapeHtml(a.fullName) + (isMe ? " (you)" : "") + "</span>" +
          '<span class="cell-muted">' + escapeHtml(a.username) + "</span>" +
          '<span class="cell-muted cell-ellipsis">' + escapeHtml(a.email) + "</span>" +
          '<span class="cell-muted">Admin</span>' +
          '<span><span class="status-pill ' + status + '">' + status + "</span></span>" +
          '<span class="row-actions">' +
          '<button class="action-icon-btn" type="button" data-action="edit" title="Edit account" aria-label="Edit account">' +
          EDIT_ICON + "</button>" +
          (isMe
            ? ""
            : isActive
            ? '<button class="action-icon-btn danger" type="button" data-action="deactivate" title="Deactivate account" aria-label="Deactivate account">' +
              DEACTIVATE_ICON + "</button>"
            : '<button class="action-icon-btn success" type="button" data-action="reactivate" title="Reactivate account" aria-label="Reactivate account">' +
              REACTIVATE_ICON + "</button>") +
          "</span>" +
          "</div>"
        );
      })
      .join("");
  }

  function findAny(id) {
    return (
      accounts.concat(admins).filter(function (a) {
        return a.id === id;
      })[0] || null
    );
  }

  async function refresh() {
    try {
      var all = await MynelleAuth.listStaff();
      accounts = all.filter(function (a) {
        return a.role === STAFF_ROLE;
      });
      admins = all.filter(function (a) {
        return a.role === "admin";
      });
    } catch (e) {
      accounts = [];
      admins = [];
    }
    render();
    renderAdmins();
    if (typeof renderReport === "function") renderReport();
  }

  searchEl.addEventListener("input", render);

  function onRowClick(e) {
    var btn = e.target.closest("[data-action]");
    if (!btn) return;
    var id = btn.closest(".table-row").dataset.id;
    var acc = findAny(id);
    if (btn.dataset.action === "edit") openModal(id, acc && acc.role);
    else if (btn.dataset.action === "deactivate") openStatus(id, false);
    else openStatus(id, true);
  }
  rowsEl.addEventListener("click", onRowClick);

  // -------------------------------------------------------------------
  // Add / edit modal
  // -------------------------------------------------------------------
  var overlay = el("accountOverlay");
  var form = el("accountForm");

  function nextIdPreview(role) {
    return MynelleAuth.nextStaffId(accounts.concat(admins), role);
  }

  function clearErrors() {
    ["errFullName", "errUsername", "errEmail", "errRate", "errPassword", "errConfirm"].forEach(
      function (id) {
        el(id).textContent = "";
      }
    );
    el("accountError").textContent = "";
    form.querySelectorAll(".has-error").forEach(function (f) {
      f.classList.remove("has-error");
    });
  }

  function openModal(id, role) {
    clearErrors();
    editingId = id || null;
    var editing = !!id;
    var account = editing ? findAny(id) : null;
    modalRole = account ? account.role : role || STAFF_ROLE;
    var isAdmin = modalRole === "admin";
    var secret = isAdmin ? "password" : "PIN";

    el("accountModalTitle").textContent =
      (editing ? "Edit " : "Add ") + (isAdmin ? "admin" : "cashier") + " account";
    el("accountSubmit").textContent = editing
      ? "Save changes"
      : isAdmin
      ? "Add admin"
      : "Add account";
    el("fStatusField").style.display = editing && !(isAdmin && account.id === me.id) ? "flex" : "none";
    el("fRateField").style.display = isAdmin ? "none" : "";
    var pw = el("fPassword");
    var cf = el("fConfirm");
    [pw, cf].forEach(function (inp) {
      inp.removeAttribute("maxlength");
      inp.removeAttribute("pattern");
      if (isAdmin) {
        inp.setAttribute("inputmode", "text");
      } else {
        inp.setAttribute("inputmode", "numeric");
        inp.setAttribute("maxlength", "6");
        inp.setAttribute("pattern", "[0-9]*");
      }
    });
    el("fPasswordLabel").textContent = editing
      ? "New " + secret
      : isAdmin
      ? "Password (at least 8 characters) *"
      : "PIN (4\u20136 digits) *";
    el("fConfirmLabel").textContent = editing
      ? "Confirm new " + secret
      : "Confirm " + secret + " *";

    if (editing && account) {
      el("fEmployeeId").value = account.id;
      el("fFullName").value = account.fullName;
      el("fUsername").value = account.username;
      el("fEmail").value = account.email;
      el("fStatus").value = statusOf(account);
      el("fRate").value = account.hourlyRate || "";
      el("fPassword").value = "";
      el("fConfirm").value = "";
      el("fPassword").placeholder = "Leave blank to keep current " + secret;
      el("fConfirm").placeholder = "Leave blank to keep current";
    } else {
      form.reset();
      el("fEmployeeId").value = nextIdPreview(modalRole);
      el("fRate").value = "";
      el("fPassword").placeholder = "";
      el("fConfirm").placeholder = "";
    }

    overlay.classList.add("open");
    setTimeout(function () {
      el("fFullName").focus();
    }, 40);
  }

  function closeModal() {
    overlay.classList.remove("open");
    editingId = null;
  }

  el("addAccountBtn").addEventListener("click", function () {
    openModal(null, STAFF_ROLE);
  });
  el("accountClose").addEventListener("click", closeModal);
  el("accountCancel").addEventListener("click", closeModal);
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) closeModal();
  });

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    clearErrors();

    var fullName = el("fFullName").value.trim();
    var username = el("fUsername").value.trim();
    var email = el("fEmail").value.trim();
    var password = el("fPassword").value;
    var confirm = el("fConfirm").value;

    var ok = true;
    function fail(fieldId, errId, message) {
      el(errId).textContent = message;
      el(fieldId).classList.add("has-error");
      ok = false;
    }

    if (!fullName) fail("fFullName", "errFullName", "Full name is required.");
    if (username.length < 3)
      fail("fUsername", "errUsername", "At least 3 characters.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      fail("fEmail", "errEmail", "Enter a valid email address.");

    var isAdmin = modalRole === "admin";
    var rateRaw = isAdmin ? "" : el("fRate").value.trim();
    if (rateRaw !== "" && !(Number(rateRaw) >= 0))
      fail("fRate", "errRate", "Enter a valid hourly rate.");
    var hourlyRate = rateRaw === "" ? 0 : Number(rateRaw);

    var wantsPassword = !editingId || password || confirm;
    if (wantsPassword) {
      if (isAdmin) {
        if (password.length < 8)
          fail("fPassword", "errPassword", "Password must be at least 8 characters.");
        if (password !== confirm)
          fail("fConfirm", "errConfirm", "Passwords do not match.");
      } else {
        if (!/^\d{4,6}$/.test(password))
          fail("fPassword", "errPassword", "PIN must be 4 to 6 digits.");
        if (password !== confirm)
          fail("fConfirm", "errConfirm", "PINs do not match.");
      }
    }
    if (!ok) return;

    if (
      !MynelleConfirm.gate(form, {
        title: editingId
          ? "Save changes to this account?"
          : isAdmin
          ? "Create this admin account?"
          : "Create this cashier account?",
        details: [
          ["Name", fullName],
          ["Username", username],
          ["Email", email],
        ].concat(isAdmin ? [] : [["Hourly rate", hourlyRate]]),
        confirmText: editingId ? "Save changes" : "Create account",
        tone: "success",
      })
    )
      return;

    try {
      if (editingId) {
        var patch = {
          fullName: fullName,
          username: username,
          email: email,
          role: modalRole,
          hourlyRate: hourlyRate,
        };
        if (!(isAdmin && editingId === me.id)) patch.status = el("fStatus").value;
        if (password) patch.password = password;
        await MynelleAuth.updateStaff(editingId, patch);
        toast("Account updated");
      } else {
        await MynelleAuth.createStaff({
          fullName: fullName,
          username: username,
          email: email,
          role: modalRole,
          hourlyRate: hourlyRate,
          password: password,
          confirmPassword: confirm,
        });
        toast(
          isAdmin
            ? "Admin account created — they can sign in now"
            : "Cashier account created — they can sign in now"
        );
      }
      closeModal();
      await refresh();
    } catch (err) {
      el("accountError").textContent = err.message;
    }
  });

  // -------------------------------------------------------------------
  // Deactivate / reactivate (no deleting — the record stays)
  // -------------------------------------------------------------------
  var statusOverlay = el("statusOverlay");
  var reactivating = false;

  function openStatus(id, reactivate) {
    var account = findAny(id);
    if (!account) return;

    pendingStatusId = id;
    reactivating = !!reactivate;

    el("statusTitle").textContent = reactivate
      ? "Reactivate account"
      : "Deactivate account";
    el("statusReasonField").style.display = reactivate ? "none" : "flex";
    el("statusConfirm").textContent = reactivate ? "Reactivate" : "Deactivate";
    el("statusConfirm").className = reactivate ? "btn-primary" : "btn-danger";
    el("statusText").textContent = reactivate
      ? account.fullName +
        (account.role === "admin" ? " will be able to sign in to the dashboard again straight away." : " will be able to sign in to the POS again straight away.")
      : account.fullName +
        (account.role === "admin" ? " won't be able to sign in to the dashboard." : " won't be able to sign in to the POS.") + " The record stays on file and can be reactivated any time.";

    if (!reactivate) el("statusReason").value = "inactive";

    statusOverlay.classList.add("open");
  }

  function closeStatus() {
    statusOverlay.classList.remove("open");
    pendingStatusId = null;
  }

  el("statusClose").addEventListener("click", closeStatus);
  el("statusCancel").addEventListener("click", closeStatus);
  statusOverlay.addEventListener("click", function (e) {
    if (e.target === statusOverlay) closeStatus();
  });

  el("statusConfirm").addEventListener("click", async function () {
    if (!pendingStatusId) return;
    var status = reactivating ? "active" : el("statusReason").value;
    try {
      await MynelleAuth.updateStaff(pendingStatusId, { status: status });
      closeStatus();
      await refresh();
      toast(reactivating ? "Account reactivated" : "Account set to " + status);
    } catch (err) {
      closeStatus();
      toast(err.message);
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (overlay.classList.contains("open")) closeModal();
    if (statusOverlay.classList.contains("open")) closeStatus();
    if (slipOverlay.classList.contains("open")) closeSlip();
  });


  // -------------------------------------------------------------------
  // Attendance & pay report
  // -------------------------------------------------------------------
  var T = TimeStore;
  var money = function (n) {
    return MynelleStore.formatCurrency(n);
  };
  var periodEl = el("repPeriod");
  var fromEl = el("repFrom");
  var toEl = el("repTo");
  var cashierEl = el("repCashier");
  var hoursEl = el("ruleHours");
  var otEl = el("ruleOt");
  var slipOverlay = el("slipOverlay");
  var slipFor = null;

  function pad2(n) {
    return String(n).padStart(2, "0");
  }
  function ymd(d) {
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }
  function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  }
  function endOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  }

  // { from: Date, to: Date, label }
  function currentRange() {
    var now = new Date();
    var y = now.getFullYear();
    var m = now.getMonth();
    var p = periodEl.value;
    var from, to;
    if (p === "week" || p === "lastweek") {
      var mon = new Date(y, m, now.getDate() - ((now.getDay() + 6) % 7) - (p === "lastweek" ? 7 : 0));
      from = mon;
      to = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
    } else if (p === "first") {
      from = new Date(y, m, 1);
      to = new Date(y, m, 15);
    } else if (p === "second") {
      from = new Date(y, m, 16);
      to = new Date(y, m + 1, 0);
    } else if (p === "lastmonth") {
      from = new Date(y, m - 1, 1);
      to = new Date(y, m, 0);
    } else if (p === "custom") {
      from = fromEl.value ? new Date(fromEl.value + "T00:00:00") : new Date(y, m, 1);
      to = toEl.value ? new Date(toEl.value + "T00:00:00") : now;
    } else {
      from = new Date(y, m, 1);
      to = new Date(y, m + 1, 0);
    }
    return { from: startOfDay(from), to: endOfDay(to) };
  }

  function rangeLabel(r) {
    var f = function (d) {
      return MynelleStore.formatDateTime(d.toISOString()).split(",")[0];
    };
    return f(r.from) + " \u2013 " + f(r.to);
  }

  function fmtDate(iso) {
    return new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  }
  function fmtClock(iso) {
    return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  }

  function loadRules() {
    var s = T.getPaySettings();
    hoursEl.value = s.regularHours;
    otEl.value = s.otMultiplier;
  }

  function fillCashierFilter() {
    var prev = cashierEl.value;
    cashierEl.innerHTML =
      '<option value="">All cashiers</option>' +
      accounts
        .map(function (a) {
          return '<option value="' + escapeHtml(a.id) + '">' + escapeHtml(a.fullName) + " (" + escapeHtml(a.id) + ")</option>";
        })
        .join("");
    cashierEl.value = accounts.some(function (a) { return a.id === prev; }) ? prev : "";
  }

  function payRows(range) {
    var rules = T.getPaySettings();
    return accounts.map(function (a) {
      var logs = T.logsFor(a.id, range.from, range.to);
      return { account: a, logs: logs, pay: T.computePay(logs, a.hourlyRate, rules), open: !!T.openShift(a.id) };
    });
  }

  function renderReport() {
    if (!el("payTable")) return;
    fillCashierFilter();
    var range = currentRange();
    var rules = T.getPaySettings();
    var rows = payRows(range);

    // ---- pay summary ----
    var head =
      "<thead><tr><th>Cashier</th><th class=\"num\">Days</th><th class=\"num\">Regular hrs</th>" +
      "<th class=\"num\">Overtime hrs</th><th class=\"num\">Total hrs</th><th class=\"num\">Rate / hr</th>" +
      "<th class=\"num\">Gross pay</th><th></th></tr></thead>";
    if (!rows.length) {
      el("payTable").innerHTML = head + '<tbody><tr><td colspan="8" class="rep-empty">Add a cashier account to start tracking attendance and pay.</td></tr></tbody>';
    } else {
      var totals = { hours: 0, gross: 0 };
      var body = rows
        .map(function (r) {
          totals.hours += r.pay.hours;
          totals.gross += r.pay.gross;
          return (
            "<tr><td><b>" + escapeHtml(r.account.fullName) + "</b>" +
            '<span class="sub">' + escapeHtml(r.account.id) + (r.open ? " \u00B7 currently checked in" : "") + "</span></td>" +
            '<td class="num">' + r.pay.days + "</td>" +
            '<td class="num">' + T.formatHours(r.pay.regularHours) + "</td>" +
            '<td class="num">' + T.formatHours(r.pay.otHours) + "</td>" +
            '<td class="num">' + T.formatHours(r.pay.hours) + "</td>" +
            '<td class="num">' + (r.account.hourlyRate ? money(r.account.hourlyRate) : '<span class="muted">Not set</span>') + "</td>" +
            '<td class="num"><b>' + money(r.pay.gross) + "</b></td>" +
            '<td class="num"><button class="rep-link" type="button" data-slip="' + escapeHtml(r.account.id) + '">Payslip</button></td></tr>'
          );
        })
        .join("");
      el("payTable").innerHTML =
        head + "<tbody>" + body + "</tbody>" +
        '<tfoot><tr><td colspan="4">Total for ' + escapeHtml(rangeLabel(range)) + '</td><td class="num">' + T.formatHours(totals.hours) +
        '</td><td></td><td class="num">' + money(totals.gross) + "</td><td></td></tr></tfoot>";
    }

    // ---- check-in / check-out records ----
    var who = cashierEl.value;
    var names = {};
    accounts.forEach(function (a) { names[a.id] = a.fullName; });
    var logs = T.logsFor(who || null, range.from, range.to).filter(function (l) {
      return names[l.empId] !== undefined;
    });
    var lhead =
      "<thead><tr><th>Date</th><th>Cashier</th><th>Check in</th><th>Check out</th><th class=\"num\">Hours</th><th>Status</th></tr></thead>";
    el("logTable").innerHTML = logs.length
      ? lhead + "<tbody>" +
        logs.slice(0, 300).map(function (l) {
          return (
            "<tr><td>" + escapeHtml(fmtDate(l.in)) + "</td>" +
            "<td>" + escapeHtml(names[l.empId] || l.name) + "</td>" +
            "<td>" + escapeHtml(fmtClock(l.in)) + "</td>" +
            "<td>" + (l.out ? escapeHtml(fmtClock(l.out)) : '<span class="muted">&mdash;</span>') + "</td>" +
            '<td class="num">' + T.formatHours(T.hoursOf(l)) + "</td>" +
            '<td><span class="rep-pill' + (l.out ? "" : " open") + '">' + (l.out ? "Completed" : "In progress") + "</span></td></tr>"
          );
        }).join("") + "</tbody>"
      : lhead + '<tbody><tr><td colspan="6" class="rep-empty">No check-ins in this period.</td></tr></tbody>';
  }

  // ---- controls ----
  periodEl.addEventListener("change", function () {
    var custom = periodEl.value === "custom";
    el("repCustom").hidden = !custom;
    if (custom && !fromEl.value) {
      var r = currentRange();
      fromEl.value = ymd(r.from);
      toEl.value = ymd(new Date());
    }
    renderReport();
  });
  fromEl.addEventListener("change", renderReport);
  toEl.addEventListener("change", renderReport);
  cashierEl.addEventListener("change", renderReport);

  function saveRules() {
    var h = Number(hoursEl.value);
    var o = Number(otEl.value);
    if (!(h > 0) || !(o >= 1)) {
      loadRules();
      toast("Regular hours must be above 0 and the overtime rate at least 1.");
      return;
    }
    T.savePaySettings({ regularHours: h, otMultiplier: o });
    renderReport();
  }
  hoursEl.addEventListener("change", saveRules);
  otEl.addEventListener("change", saveRules);

  // ---- CSV export ----
  el("repExport").addEventListener("click", function () {
    var range = currentRange();
    var rules = T.getPaySettings();
    function q(v) {
      return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
    }
    var lines = [["Employee ID", "Name", "Days", "Regular hrs", "Overtime hrs", "Total hrs", "Rate per hr", "Gross pay"].map(q).join(",")];
    payRows(range).forEach(function (r) {
      lines.push([
        r.account.id, r.account.fullName, r.pay.days,
        r.pay.regularHours.toFixed(2), r.pay.otHours.toFixed(2), r.pay.hours.toFixed(2),
        Number(r.account.hourlyRate || 0).toFixed(2), r.pay.gross.toFixed(2),
      ].map(q).join(","));
    });
    lines.push("");
    lines.push(["Employee ID", "Name", "Check in", "Check out", "Hours"].map(q).join(","));
    T.logsFor(null, range.from, range.to).forEach(function (l) {
      lines.push([l.empId, l.name, l.in, l.out || "", l.out ? T.hoursOf(l).toFixed(2) : ""].map(q).join(","));
    });
    var blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "cashier-pay-" + ymd(range.from) + "_to_" + ymd(range.to) + ".csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast("Report exported");
  });

  el("repPrint").addEventListener("click", function () {
    document.body.classList.add("print-report");
    window.print();
    document.body.classList.remove("print-report");
  });

  // ---- payslip ----
  el("payTable").addEventListener("click", function (e) {
    var b = e.target.closest("[data-slip]");
    if (b) openSlip(b.dataset.slip);
  });

  function openSlip(id) {
    var acc = accounts.find(function (a) { return a.id === id; });
    if (!acc) return;
    var range = currentRange();
    var rules = T.getPaySettings();
    var logs = T.logsFor(id, range.from, range.to).slice().reverse();
    var pay = T.computePay(logs, acc.hourlyRate, rules);
    var biz = MynelleStore.getSettings().business.name || "Mynelle's Pharmacy";
    el("slipBody").innerHTML =
      '<div class="slip-head"><b>' + escapeHtml(biz) + "</b>Payslip &middot; " + escapeHtml(rangeLabel(range)) + "</div>" +
      '<div class="slip-meta"><div><span>Employee</span><br>' + escapeHtml(acc.fullName) + "</div>" +
      "<div><span>Employee ID</span><br>" + escapeHtml(acc.id) + "</div>" +
      "<div><span>Position</span><br>Cashier</div>" +
      "<div><span>Hourly rate</span><br>" + (acc.hourlyRate ? money(acc.hourlyRate) : "Not set") + "</div></div>" +
      '<div class="rep-wrap"><table class="rep-table"><thead><tr><th>Date</th><th>In</th><th>Out</th><th class="num">Hours</th></tr></thead><tbody>' +
      (logs.length
        ? logs.map(function (l) {
            return "<tr><td>" + escapeHtml(fmtDate(l.in)) + "</td><td>" + escapeHtml(fmtClock(l.in)) + "</td><td>" +
              (l.out ? escapeHtml(fmtClock(l.out)) : "In progress") + '</td><td class="num">' + T.formatHours(T.hoursOf(l)) + "</td></tr>";
          }).join("")
        : '<tr><td colspan="4" class="rep-empty">No attendance in this period.</td></tr>') +
      "</tbody></table></div>" +
      '<div class="slip-sum">' +
      "<div><span>Regular: " + T.formatHours(pay.regularHours) + " &times; " + money(pay.rate) + "</span><span>" + money(pay.regularPay) + "</span></div>" +
      "<div><span>Overtime: " + T.formatHours(pay.otHours) + " &times; " + money(pay.rate) + " &times; " + rules.otMultiplier + "</span><span>" + money(pay.otPay) + "</span></div>" +
      '<div class="total"><span>Gross pay</span><span>' + money(pay.gross) + "</span></div></div>" +
      '<p class="slip-note">Gross pay before deductions (SSS, PhilHealth, Pag-IBIG, withholding tax and any advances are not included). Unfinished shifts are excluded until checked out.</p>';
    slipOverlay.classList.add("open");
  }
  function closeSlip() {
    slipOverlay.classList.remove("open");
  }
  el("slipClose").addEventListener("click", closeSlip);
  el("slipCancel").addEventListener("click", closeSlip);
  slipOverlay.addEventListener("click", function (e) {
    if (e.target === slipOverlay) closeSlip();
  });
  el("slipPrint").addEventListener("click", function () {
    document.body.classList.add("print-slip");
    window.print();
    document.body.classList.remove("print-slip");
  });

  // Live: a cashier checking in/out at the POS updates this report.
  window.addEventListener("storage", function (e) {
    if (e.key === T.LOG_KEY || e.key === T.PAY_KEY || e.key === MynelleAuth.ACCOUNTS_KEY) refresh();
  });
  window.setInterval(function () {
    if (!document.hidden) renderReport();
  }, 30000);
  loadRules();

  // -------------------------------------------------------------------
  // Boot
  // -------------------------------------------------------------------
  refresh();
})();
