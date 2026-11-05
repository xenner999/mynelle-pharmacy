// Shared authentication store for Mynelle's Pharmacy.
//
// HOW THIS WORKS
// ----------------------------------------------------------------------
// Every function here (registerAdmin, login, logout, getSession) tries the
// real backend first, at the endpoints listed below. If that backend
// doesn't exist yet (no server, 404, network error), it automatically
// falls back to a localStorage simulation so the app keeps working today.
//
// Once you connect a database, just stand up these endpoints on your
// server. You will NOT need to change Login.js, Register.js, or this
// file — the fetch calls are already wired in and will start being used
// automatically the moment they stop 404'ing / failing.
//
//   POST /api/auth/register   { fullName, username, email, password, accessCode }
//        -> 201 { id, fullName, username, email, role }
//   POST /api/auth/login      { identifier, password }
//        -> 200 { id, fullName, username, email, role, token? }
//   POST /api/auth/access-code { currentCode, newCode }
//        -> 200 (change the admin setup code server-side too, if you keep
//           one there — see Settings -> Security in the app)
//   POST /api/auth/logout     (optional, only needed for server-side sessions)
//
//   Staff/cashier accounts (Profile -> Manage accounts):
//   GET    /api/accounts          -> 200 [ { id, fullName, username, email,
//                                            role, status, createdAt } ]
//   POST   /api/accounts          { fullName, username, email, role, password }
//                                 -> 201 { id, ... }
//   PATCH  /api/accounts/:id      { fullName?, username?, email?, role?,
//                                   status?, password? } -> 200 { id, ... }
//   DELETE /api/accounts/:id      -> 204
//
// Until then, accounts + sessions are kept in localStorage under the keys
// below. Passwords are hashed with SHA-256 before being stored so nothing
// is kept in plain text even in this fallback mode — but SHA-256 alone is
// NOT sufficient for a real production login. When the real backend is
// built, hash + salt passwords server-side (bcrypt/argon2) and stop
// sending raw passwords anywhere except over HTTPS to that endpoint.
// ----------------------------------------------------------------------

var MynelleAuth = (function () {
  var ACCOUNTS_KEY = "mynelle_accounts";
  var SESSION_KEY = "mynelle_session";
  var ACCESS_CODE_KEY = "mynelle_access_code_hash";

  // Starting value for the admin access code, used only the very first
  // time the app runs (before anyone has changed it from Settings ->
  // Security). Change it here if you want a different out-of-the-box
  // default, but the real way admins are meant to rotate it is the
  // Settings page, not this file.
  var DEFAULT_ACCESS_CODE = "MYNELLE-ADMIN-2025";

  // ---------- helpers ----------

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  async function sha256(text) {
    try {
      var data = new TextEncoder().encode(text);
      var hashBuffer = await crypto.subtle.digest("SHA-256", data);
      var bytes = Array.from(new Uint8Array(hashBuffer));
      return bytes.map(function (b) {
        return b.toString(16).padStart(2, "0");
      }).join("");
    } catch (e) {
      // Extremely old browser without SubtleCrypto — last-resort fallback
      // so registration/login still function locally.
      var hash = 0;
      for (var i = 0; i < text.length; i++) {
        hash = (hash << 5) - hash + text.charCodeAt(i);
        hash |= 0;
      }
      return "fallback-" + hash;
    }
  }

  function getAccounts() {
    try {
      var raw = localStorage.getItem(ACCOUNTS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveAccounts(list) {
    try {
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list));
    } catch (e) {
      /* storage unavailable */
    }
  }

  function publicAccount(account) {
    if (!account) return null;
    return {
      id: account.id,
      fullName: account.fullName,
      username: account.username,
      email: account.email,
      role: account.role,
      status: normalizeStatus(account.status),
      hourlyRate: Number(account.hourlyRate) || 0,
      createdAt: account.createdAt || null,
    };
  }

  function findAccount(identifier) {
    identifier = String(identifier || "").trim().toLowerCase();
    return getAccounts().find(function (a) {
      return (
        a.username.toLowerCase() === identifier ||
        a.email.toLowerCase() === identifier
      );
    });
  }

  // ---------- admin access code (the "auth" gate for Register.html) ----------
  //
  // Lazily initialized on first use so existing installs still work: if
  // nothing has been saved yet, it hashes DEFAULT_ACCESS_CODE and stores
  // that hash. From then on, Settings -> Security can change it and this
  // stored hash is always the source of truth (never the constant above).

  async function getAccessCodeHash() {
    var stored = null;
    try {
      stored = localStorage.getItem(ACCESS_CODE_KEY);
    } catch (e) {
      /* storage unavailable */
    }
    if (stored) return stored;

    var initial = await sha256(DEFAULT_ACCESS_CODE);
    try {
      localStorage.setItem(ACCESS_CODE_KEY, initial);
    } catch (e) {
      /* storage unavailable */
    }
    return initial;
  }

  async function verifyAccessCode(code) {
    var hash = await sha256(String(code || ""));
    var stored = await getAccessCodeHash();
    return hash === stored;
  }

  async function changeAccessCode(payload) {
    var currentCode = payload.currentCode;
    var newCode = payload.newCode;
    var confirmCode = payload.confirmCode;

    if (!currentCode || !newCode || !confirmCode) {
      throw new Error("Please fill in every field.");
    }
    if (newCode.length < 8) {
      throw new Error("New access code must be at least 8 characters.");
    }
    if (newCode !== confirmCode) {
      throw new Error("New access code and confirmation do not match.");
    }

    var ok = await verifyAccessCode(currentCode);
    if (!ok) {
      throw new Error("Current access code is incorrect.");
    }

    var result = await callApi("/api/auth/access-code", {
      currentCode: currentCode,
      newCode: newCode,
    });

    var newHash = await sha256(newCode);
    try {
      localStorage.setItem(ACCESS_CODE_KEY, newHash);
    } catch (e) {
      /* storage unavailable — local change won't persist, but backend
         (if connected) already has it */
    }

    return true;
  }

  // Distinguishes "no backend yet, use local fallback" from "backend
  // exists but returned an actual error the user should see".
  // GitHub Pages (and any plain static host) has no /api, so skip the backend
  // entirely there. That also stops credentials being POSTed to a host that
  // can't use them. Set window.MYNELLE_BACKEND = true before this file loads
  // if you later add a real backend on a *.github.io address.
  var HAS_BACKEND =
    window.MYNELLE_BACKEND === true ||
    !/(^|\.)github\.io$/i.test(window.location.hostname);

  async function callApi(path, payload) {
    if (!HAS_BACKEND) return { backendAvailable: false };
    var res;
    try {
      res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (networkErr) {
      // Server not reachable at all -> no backend/DB connected yet.
      return { backendAvailable: false };
    }

    if (res.status === 404 || res.status === 405 || res.status === 501) {
      // Route not implemented yet -> no backend/DB connected yet.
      return { backendAvailable: false };
    }

    var body = null;
    try {
      body = await res.json();
    } catch (e) {
      /* empty/non-JSON body */
    }

    // A real API answers with JSON. An HTML/empty reply means a plain file
    // server is in the way, so use the local fallback.
    if (body === null) return { backendAvailable: false };

    if (!res.ok) {
      var message =
        (body && body.message) || "Something went wrong. Please try again.";
      throw new Error(message);
    }

    return { backendAvailable: true, data: body };
  }

  // ---------- local (no-database-yet) fallback implementations ----------

  async function localRegister(payload) {
    var accounts = getAccounts();
    var username = payload.username.trim();
    var email = payload.email.trim();

    var usernameTaken = accounts.some(function (a) {
      return a.username.toLowerCase() === username.toLowerCase();
    });
    if (usernameTaken) throw new Error("That username is already taken.");

    var emailTaken = accounts.some(function (a) {
      return a.email.toLowerCase() === email.toLowerCase();
    });
    if (emailTaken) throw new Error("An account with that email already exists.");

    if (!(await verifyAccessCode(payload.accessCode))) {
      throw new Error("Invalid admin access code.");
    }

    var passwordHash = await sha256(payload.password);
    var account = {
      id: "ADM-" + Date.now(),
      fullName: payload.fullName.trim(),
      username: username,
      email: email,
      passwordHash: passwordHash,
      role: "admin",
      createdAt: new Date().toISOString(),
    };

    accounts.push(account);
    saveAccounts(accounts);
    return publicAccount(account);
  }

  async function localLogin(payload) {
    var account = findAccount(payload.identifier);
    if (!account) throw new Error("Invalid username/email or password.");

    var passwordHash = await sha256(payload.password);
    if (passwordHash !== account.passwordHash) {
      throw new Error("Invalid username/email or password.");
    }

    var status = account.status || "active";
    if (status !== "active") {
      throw new Error(
        "This account is " + status + ". Ask an admin to reactivate it."
      );
    }

    return publicAccount(account);
  }

  // ---------- staff / cashier accounts ----------
  //
  // These power Profile -> Manage accounts. Cashier accounts created here
  // go into the SAME account list the login page reads, so a cashier can
  // sign in to the POS the moment an admin creates them.

  var ROLES = ["admin", "pharmacist", "cashier"];

  // Employment status. Only "active" can sign in — the rest keep the record
  // on file (and in past sales history) without allowing a login, which is
  // why accounts are deactivated rather than deleted.
  var STATUSES = ["active", "inactive", "suspended", "resigned", "retired"];

  function normalizeStatus(value) {
    var status = String(value || "active").toLowerCase();
    // "disabled" was the old two-state value — map it onto the new list.
    if (status === "disabled") status = "inactive";
    return STATUSES.indexOf(status) === -1 ? "active" : status;
  }

  function nextStaffId(accounts, role) {
    var prefix = role === "admin" ? "ADM" : role === "pharmacist" ? "PHM" : "CSH";
    var used = accounts.filter(function (a) {
      return String(a.id).indexOf(prefix + "-") === 0;
    }).length;
    return prefix + "-" + String(used + 1).padStart(4, "0");
  }

  function validateStaff(payload, accounts, ignoreId) {
    var fullName = String(payload.fullName || "").trim();
    var username = String(payload.username || "").trim();
    var email = String(payload.email || "").trim();
    var role = String(payload.role || "cashier");

    if (!fullName) throw new Error("Full name is required.");
    if (username.length < 3)
      throw new Error("Username must be at least 3 characters.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new Error("Enter a valid email address.");
    if (ROLES.indexOf(role) === -1) throw new Error("Pick a valid role.");

    var clash = accounts.find(function (a) {
      return (
        a.id !== ignoreId &&
        (a.username.toLowerCase() === username.toLowerCase() ||
          a.email.toLowerCase() === email.toLowerCase())
      );
    });
    if (clash) {
      throw new Error(
        clash.username.toLowerCase() === username.toLowerCase()
          ? "That username is already taken."
          : "An account with that email already exists."
      );
    }

    return { fullName: fullName, username: username, email: email, role: role };
  }

  async function listStaff() {
    var res;
    try {
      if (!HAS_BACKEND) throw new Error("static host");
      res = await fetch("/api/accounts");
      if (res.ok) {
        var body = await res.json();
        if (Array.isArray(body)) return body.map(publicAccount);
      }
    } catch (e) {
      /* no backend yet — fall through to local */
    }
    return getAccounts().map(publicAccount);
  }

  // Cashiers sign in to the POS with a numeric PIN (4-6 digits); admins and
  // pharmacists keep a normal password.
  var PIN_RE = /^\d{4,6}$/;
  function checkSecret(role, value) {
    if (role === "cashier") {
      if (!PIN_RE.test(String(value))) throw new Error("PIN must be 4 to 6 digits.");
    } else if (String(value).length < 8) {
      throw new Error("Password must be at least 8 characters.");
    }
  }

  async function createStaff(payload) {
    var password = String(payload.password || "");
    checkSecret(payload.role, password);
    if (payload.confirmPassword !== undefined &&
        password !== payload.confirmPassword) {
      throw new Error(payload.role === "cashier" ? "PINs do not match." : "Passwords do not match.");
    }

    var result = await callApi("/api/accounts", {
      fullName: payload.fullName,
      username: payload.username,
      email: payload.email,
      role: payload.role,
      hourlyRate: payload.hourlyRate,
      password: password,
    });
    if (result.backendAvailable) return publicAccount(result.data);

    var accounts = getAccounts();
    var clean = validateStaff(payload, accounts, null);
    var account = {
      id: nextStaffId(accounts, clean.role),
      fullName: clean.fullName,
      username: clean.username,
      email: clean.email,
      passwordHash: await sha256(password),
      role: clean.role,
      status: "active",
      hourlyRate: Math.max(0, Number(payload.hourlyRate) || 0),
      createdAt: new Date().toISOString(),
    };
    accounts.push(account);
    saveAccounts(accounts);
    return publicAccount(account);
  }

  async function updateStaff(id, patch) {
    if (patch.password !== undefined) {
      var target = getAccounts().filter(function (a) { return a.id === id; })[0];
      checkSecret(patch.role || (target && target.role), patch.password);
    }

    var result = await callApi("/api/accounts/" + encodeURIComponent(id), patch);
    if (result.backendAvailable) return publicAccount(result.data);

    var accounts = getAccounts();
    var account = accounts.find(function (a) {
      return a.id === id;
    });
    if (!account) throw new Error("Account not found.");

    if (
      patch.fullName !== undefined ||
      patch.username !== undefined ||
      patch.email !== undefined ||
      patch.role !== undefined
    ) {
      var merged = {
        fullName: patch.fullName !== undefined ? patch.fullName : account.fullName,
        username: patch.username !== undefined ? patch.username : account.username,
        email: patch.email !== undefined ? patch.email : account.email,
        role: patch.role !== undefined ? patch.role : account.role,
      };
      var clean = validateStaff(merged, accounts, id);
      account.fullName = clean.fullName;
      account.username = clean.username;
      account.email = clean.email;
      account.role = clean.role;
    }

    if (patch.status !== undefined) {
      account.status = normalizeStatus(patch.status);
    }
    if (patch.hourlyRate !== undefined) {
      account.hourlyRate = Math.max(0, Number(patch.hourlyRate) || 0);
    }
    if (patch.password) {
      account.passwordHash = await sha256(String(patch.password));
    }

    saveAccounts(accounts);

    // Keep the live session in sync if the admin edited themselves.
    var session = getSession();
    if (session && session.account && session.account.id === id) {
      session.account = publicAccount(account);
      try {
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      } catch (e) {
        /* storage unavailable */
      }
    }

    return publicAccount(account);
  }

  async function deleteStaff(id) {
    try {
      if (!HAS_BACKEND) throw new Error("static host");
      var res = await fetch("/api/accounts/" + encodeURIComponent(id), {
        method: "DELETE",
      });
      if (res.ok) return true;
    } catch (e) {
      /* no backend yet — fall through to local */
    }

    var accounts = getAccounts();
    var remaining = accounts.filter(function (a) {
      return a.id !== id;
    });
    if (remaining.length === accounts.length) throw new Error("Account not found.");

    var removed = accounts.find(function (a) {
      return a.id === id;
    });
    var admins = remaining.filter(function (a) {
      return a.role === "admin";
    });
    if (removed.role === "admin" && admins.length === 0) {
      throw new Error("You can't delete the last admin account.");
    }

    saveAccounts(remaining);
    return true;
  }


  // ---------- POS / time-tracker terminal ----------
  // The POS is for cashier accounts only, and every cashier has to prove who
  // they are with their password. This checks credentials WITHOUT touching
  // the main app session (an admin can stay signed in to the dashboard).
  // identifier: Employee ID (e.g. CSH-0001), username or email.
  async function verifyCashier(identifier, password) {
    var ident = String(identifier || "").trim();
    if (!ident || !password) throw new Error("Enter your Employee ID and PIN.");
    var byId = getAccounts().find(function (a) {
      return String(a.id).toLowerCase() === ident.toLowerCase();
    });
    var loginId = byId ? byId.username : ident;
    var result = await callApi("/api/auth/login", { identifier: loginId, password: password });
    var account;
    try {
      account = result.backendAvailable
        ? publicAccount(result.data)
        : await localLogin({ identifier: loginId, password: password });
    } catch (e) {
      // keep the wording about the PIN, and don't reveal which part was wrong
      if (/inactive|suspended|resigned|terminated|account is/i.test(e.message)) throw e;
      throw new Error("Invalid Employee ID or PIN.");
    }
    if (account.role !== "cashier") {
      throw new Error("Invalid Employee ID or PIN.");
    }
    return account;
  }

  function hasCashiers() {
    return getAccounts().some(function (a) {
      return a.role === "cashier";
    });
  }

  // A signed-in person changing their own password (must know the current one).
  async function changeOwnPassword(id, currentPassword, newPassword) {
    var account = getAccounts().find(function (a) {
      return a.id === id;
    });
    if (!account) throw new Error("Account not found.");
    var noun = account.role === "cashier" ? "PIN" : "password";
    checkSecret(account.role, newPassword);
    if ((await sha256(currentPassword)) !== account.passwordHash)
      throw new Error("Current " + noun + " is incorrect.");
    await updateStaff(id, { password: newPassword });
    return true;
  }

  // ---------- public API (tries backend, falls back to local) ----------

  async function registerAdmin(payload) {
    var result = await callApi("/api/auth/register", {
      fullName: payload.fullName,
      username: payload.username,
      email: payload.email,
      password: payload.password,
      accessCode: payload.accessCode,
    });

    var account = result.backendAvailable
      ? publicAccount(result.data)
      : await localRegister(payload);

    startSession(account, result.backendAvailable);
    return account;
  }

  async function login(payload) {
    var result = await callApi("/api/auth/login", {
      identifier: payload.identifier,
      password: payload.password,
    });

    var account = result.backendAvailable
      ? publicAccount(result.data)
      : await localLogin(payload);

    startSession(account, result.backendAvailable);
    return account;
  }

  function startSession(account, fromBackend) {
    var session = {
      account: account,
      loginAt: new Date().toISOString(),
      source: fromBackend ? "database" : "local-only",
    };
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch (e) {
      /* storage unavailable */
    }
  }

  function getSession() {
    try {
      var raw = localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function logout() {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch (e) {
      /* storage unavailable */
    }
    // If/when a real backend session (cookie/token) is added, also call
    // POST /api/auth/logout here to invalidate it server-side.
  }

  return {
    registerAdmin: registerAdmin,
    login: login,
    logout: logout,
    getSession: getSession,
    changeAccessCode: changeAccessCode,
    verifyCashier: verifyCashier,
    hasCashiers: hasCashiers,
    changeOwnPassword: changeOwnPassword,
    listStaff: listStaff,
    createStaff: createStaff,
    updateStaff: updateStaff,
    deleteStaff: deleteStaff,
    ROLES: ROLES,
    STATUSES: STATUSES,
    ACCOUNTS_KEY: ACCOUNTS_KEY,
    SESSION_KEY: SESSION_KEY,
    ACCESS_CODE_KEY: ACCESS_CODE_KEY,
  };
})();
