// My account — view and edit the signed-in user's own details.

(function () {
  var el = function (id) {
    return document.getElementById(id);
  };

  var toastEl = el("toast");
  var toastTimer = null;
  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove("show");
    }, 2400);
  }

  function initials(name) {
    var parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function currentAccount() {
    var session = MynelleAuth.getSession();
    return (session && session.account) || null;
  }

  function load() {
    var me = currentAccount();
    if (!me) {
      ["meFullName", "meUsername", "meEmail", "mePassword", "meSave"].forEach(
        function (id) {
          el(id).disabled = true;
        }
      );
      return;
    }
    el("meAvatar").textContent = initials(me.fullName);
    el("meName").textContent = me.fullName;
    el("meSub").textContent = me.email + " · " + me.username;

    var rolePill = el("meRole");
    rolePill.hidden = false;
    rolePill.className = "role-pill " + me.role;
    rolePill.textContent = me.role;

    el("meFullName").value = me.fullName;
    el("meUsername").value = me.username;
    el("meEmail").value = me.email;
    el("mePassword").value = "";
  }

  el("meSave").addEventListener("click", async function () {
    var me = currentAccount();
    if (!me) return;

    var error = el("meError");
    error.textContent = "";

    var patch = {
      fullName: el("meFullName").value.trim(),
      username: el("meUsername").value.trim(),
      email: el("meEmail").value.trim(),
    };
    var password = el("mePassword").value;
    if (password) patch.password = password;

    try {
      await MynelleAuth.updateStaff(me.id, patch);
      el("mePassword").value = "";
      load();
      var confirmEl = el("meConfirm");
      confirmEl.classList.add("show");
      setTimeout(function () {
        confirmEl.classList.remove("show");
      }, 1800);
      toast("Account updated");
    } catch (err) {
      error.textContent = err.message;
    }
  });

  load();
})();
