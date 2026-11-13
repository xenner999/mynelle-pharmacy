// Supabase sync layer for Mynelle's Pharmacy.
// Keeps the app's existing localStorage code working, but mirrors the shared
// data to a Supabase table (public.app_kv) so every device sees the same data.
//
//  1. On page load the shared keys are pulled from Supabase into localStorage
//     (synchronously, before any other script runs).
//  2. Every write to a shared key is pushed to Supabase in the background.
//  3. Every few seconds changes made on other devices are pulled in.
//
// If Supabase is unreachable the app keeps working from local data and
// re-syncs on the next write.
(function () {
  // ===== CONFIG: paste your project URL (Supabase -> Project Settings -> API) =====
  var SUPABASE_URL = "https://fxiwkhkgbhbwzlbxbitd.supabase.co";
  var SUPABASE_KEY = "sb_publishable_SGaFx66seurEdlKbesNOlQ_YUd9tgZV";
  // ===============================================================================

  var TABLE = "app_kv";
  var POLL_MS = 8000;
  // Shared across devices. Sessions / held carts / per-cashier goals stay per-device.
  var SHARED = [
    "mynelle_settings", "mynelle_products", "mynelle_sales", "mynelle_seeded",
    "mynelle_product_images", "mynelle_dismissed_alerts", "mynelle_stock_log",
    "mynelle_orders", "mynelle_accounts", "mynelle_timelogs", "mynelle_pay_settings"
  ];
  // Append-only lists: merged by id on conflict so two cashiers can't overwrite each other.
  var MERGE_BY_ID = ["mynelle_sales", "mynelle_timelogs", "mynelle_stock_log"];

  var configured = SUPABASE_URL.indexOf("YOUR-PROJECT-REF") === -1;
  window.MynelleSync = { configured: configured, status: configured ? "starting" : "not-configured" };
  if (!configured) {
    console.warn("[Mynelle] Supabase URL not set in main/js/supabase-sync.js - running on local storage only.");
    return;
  }

  var REST = SUPABASE_URL.replace(/\/+$/, "") + "/rest/v1/" + TABLE;
  var HEAD = { apikey: SUPABASE_KEY, "Content-Type": "application/json" };
  // Legacy anon keys are JWTs (start with "eyJ") and go in Authorization too.
  // New "sb_publishable_..." keys are NOT JWTs and must only be sent as apikey.
  if (SUPABASE_KEY.indexOf("eyJ") === 0) HEAD.Authorization = "Bearer " + SUPABASE_KEY;
  var rawSet = Storage.prototype.setItem;
  var rawRemove = Storage.prototype.removeItem;
  var rawGet = Storage.prototype.getItem;
  var versions = {};   // key -> updated_at last seen from server
  var pending = {};    // key -> true while a push is queued
  var timers = {};
  var applying = false;

  function isShared(k) { return SHARED.indexOf(k) !== -1; }

  // ---------- 1. blocking initial pull ----------
  try {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", REST + "?select=key,value,updated_at", false);
    Object.keys(HEAD).forEach(function (h) { xhr.setRequestHeader(h, HEAD[h]); });
    xhr.send();
    if (xhr.status === 200) {
      var rows = JSON.parse(xhr.responseText);
      var remoteKeys = {};
      rows.forEach(function (r) {
        remoteKeys[r.key] = true;
        if (!isShared(r.key)) return;
        versions[r.key] = r.updated_at;
        rawSet.call(localStorage, r.key, r.value);
      });
      // First run: Supabase is empty for a key but this browser has data -> upload it.
      SHARED.forEach(function (k) {
        if (!remoteKeys[k] && rawGet.call(localStorage, k) !== null) schedulePush(k, true);
      });
      window.MynelleSync.status = "connected";
    } else {
      window.MynelleSync.status = "error";
      console.warn("[Mynelle] Supabase read failed:", xhr.status, xhr.responseText);
    }
  } catch (e) {
    window.MynelleSync.status = "offline";
    console.warn("[Mynelle] Supabase unreachable, using local data.", e);
  }

  // ---------- 2. push on write ----------
  function parse(s) { try { return JSON.parse(s); } catch (e) { return null; } }

  function mergeLists(remote, local) {
    var out = remote.slice(), seen = {};
    remote.forEach(function (x) { if (x && x.id != null) seen[x.id] = true; });
    local.forEach(function (x) { if (x && x.id != null && !seen[x.id]) out.push(x); });
    return out;
  }

  function upsert(key, value) {
    return fetch(REST + "?on_conflict=key", {
      method: "POST",
      headers: Object.assign({}, HEAD, { Prefer: "resolution=merge-duplicates,return=representation" }),
      body: JSON.stringify({ key: key, value: value, updated_at: new Date().toISOString() })
    }).then(function (r) { return r.ok ? r.json() : r.text().then(function (t) { throw new Error(r.status + " " + t); }); })
      .then(function (rows) { if (rows && rows[0]) versions[key] = rows[0].updated_at; });
  }

  function doPush(key) {
    delete pending[key];
    var local = rawGet.call(localStorage, key);
    if (local === null) {
      return fetch(REST + "?key=eq." + encodeURIComponent(key), { method: "DELETE", headers: HEAD })
        .catch(function (e) { console.warn("[Mynelle] delete failed", e); });
    }
    var p = Promise.resolve(local);
    if (MERGE_BY_ID.indexOf(key) !== -1) {
      p = fetch(REST + "?select=value&key=eq." + encodeURIComponent(key), { headers: HEAD })
        .then(function (r) { return r.ok ? r.json() : []; })
        .then(function (rows) {
          var rl = rows[0] && parse(rows[0].value), ll = parse(local);
          if (Array.isArray(rl) && Array.isArray(ll) && rl.length) {
            var merged = JSON.stringify(mergeLists(rl, ll));
            if (merged !== local) { applying = true; rawSet.call(localStorage, key, merged); applying = false; notify(key); }
            return merged;
          }
          return local;
        }).catch(function () { return local; });
    }
    return p.then(function (val) { return upsert(key, val); })
      .catch(function (e) { window.MynelleSync.status = "error"; console.warn("[Mynelle] push failed for " + key, e); schedulePush(key); });
  }

  function schedulePush(key, immediate) {
    if (pending[key]) return;
    pending[key] = true;
    timers[key] = setTimeout(function () { doPush(key); }, immediate ? 0 : 400);
  }

  Storage.prototype.setItem = function (k, v) {
    rawSet.call(this, k, v);
    if (this === window.localStorage && !applying && isShared(k)) schedulePush(k);
  };
  Storage.prototype.removeItem = function (k) {
    rawRemove.call(this, k);
    if (this === window.localStorage && !applying && isShared(k)) schedulePush(k);
  };

  // Flush queued writes if the tab closes.
  window.addEventListener("pagehide", function () {
    Object.keys(pending).forEach(function (k) {
      var v = rawGet.call(localStorage, k);
      if (v === null) return;
      try {
        fetch(REST + "?on_conflict=key", { method: "POST", keepalive: v.length < 60000,
          headers: Object.assign({}, HEAD, { Prefer: "resolution=merge-duplicates" }),
          body: JSON.stringify({ key: k, value: v, updated_at: new Date().toISOString() }) });
      } catch (e) {}
    });
  });

  // ---------- 3. poll for changes from other devices ----------
  function notify(key) {
    try { window.dispatchEvent(new StorageEvent("storage", { key: key, storageArea: localStorage })); } catch (e) {}
  }

  function poll() {
    if (document.hidden) return;
    fetch(REST + "?select=key,value,updated_at", { headers: HEAD })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (rows) {
        window.MynelleSync.status = "connected";
        rows.forEach(function (r) {
          if (!isShared(r.key) || pending[r.key] || versions[r.key] === r.updated_at) return;
          versions[r.key] = r.updated_at;
          if (rawGet.call(localStorage, r.key) === r.value) return;
          applying = true; rawSet.call(localStorage, r.key, r.value); applying = false;
          notify(r.key);
        });
      })
      .catch(function () { window.MynelleSync.status = "offline"; });
  }
  setInterval(poll, POLL_MS);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) poll(); });
})();
