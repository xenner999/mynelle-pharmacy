/*
 * ui-assist.js  (loaded on every page, admin + POS)
 *
 *  1. Input restrictions  - every field only accepts the characters that make
 *     sense for it (numbers only for amounts/quantities, letters only for
 *     names, etc.). Typing, pasting and autofill are all filtered.
 *  2. Hover labels        - every button, link, field, icon and badge gets a
 *     tooltip (native `title`) that says what it is / what it accepts.
 *
 * It works through delegated listeners + a MutationObserver, so fields that
 * are built later by other scripts (modals, POS cart, etc.) are covered
 * automatically. To override a field, add data-allow="<rule>" or a title="".
 */
(function () {
  "use strict";

  /* ------------------------------------------------------------------ */
  /* 1. CHARACTER RESTRICTIONS                                           */
  /* ------------------------------------------------------------------ */

  // Each rule: `bad` matches characters that are NOT allowed.
  var RULES = {
    digits:      { bad: /[^0-9]/g,                               max: 12, hint: "numbers only" },
    person:      { bad: /[^A-Za-z\u00C0-\u024F .'\-]/g,          max: 60, hint: "letters, spaces, . ' - only" },
    username:    { bad: /[^A-Za-z0-9._\-]/g,                     max: 30, hint: "letters, numbers, . _ - only" },
    login:       { bad: /[^A-Za-z0-9._\-@+]/g,                   max: 80, hint: "no spaces" },
    email:       { bad: /[^A-Za-z0-9._%+\-@]/g,                  max: 80, hint: "valid email characters only" },
    phone:       { bad: /[^0-9+()\- ]/g,                         max: 20, hint: "numbers, + ( ) - only" },
    code:        { bad: /[^A-Za-z0-9\-_\/]/g,                    max: 30, hint: "letters, numbers, - _ / only" },
    prefix:      { bad: /[^A-Za-z0-9]/g,                         max: 6,  hint: "letters and numbers only" },
    productName: { bad: /[^A-Za-z0-9\u00C0-\u024F .,'&()\/+%\-]/g, max: 80, hint: "letters, numbers and common symbols" },
    drugName:    { bad: /[^A-Za-z0-9\u00C0-\u024F .,'&()\/+\-]/g, max: 60, lead: true, hint: "must start with letters; numbers only after (e.g. Vitamin B12)" },
    address:     { bad: /[^A-Za-z0-9\u00C0-\u024F .,#'\/\-()]/g, max: 150, hint: "letters, numbers and . , # - / ( ) only" },
    currency:    { bad: /[0-9\s]/g,                              max: 3,  hint: "symbol or letters, no numbers" },
    text:        { bad: /[<>\u0000-\u0009\u000B-\u001F]/g,       max: 120, hint: "" },
    notes:       { bad: /[<>\u0000-\u0009\u000B-\u001F]/g,       max: 300, hint: "" },
    pin:         { bad: /[^0-9]/g,                               max: 6,  hint: "numbers only (PIN)" },
    // numeric rules are handled separately (see sanitizeNumber)
    integer:     { numeric: true, dec: 0, hint: "whole numbers only" },
    decimal:     { numeric: true, dec: 2, hint: "numbers only (decimals allowed)" },
    tender:      { numeric: true, dec: 2, hint: "numbers only (decimals allowed)" },
    dose:        { numeric: true, dec: 3, hint: "numbers only (decimals allowed)" },
  };

  // Field id -> rule. Anything not listed falls back to its input type.
  var BY_ID = {
    // sign in / register / accounts
    fullName: "person", fFullName: "person", meFullName: "person",
    username: "login", agUser: "login",
    regUsername: "username", fUsername: "username", meUsername: "username",
    email: "email", fEmail: "email", meEmail: "email",
    idInput: "code", fEmployeeId: "code",
    // inventory
    fProductId: "code", fLot: "code", rLot: "code",
    fProductName: "drugName", fBrand: "drugName",
    fDoseNum: "dose",
    // settings
    bName: "productName", bAddress: "address", bContact: "phone", bLicense: "code",
    iIdPrefix: "prefix", pCurrency: "currency",
    // POS
    tenderedInput: "tender", notesInput: "notes",
  };

  var SKIP_TYPES = {
    file: 1, checkbox: 1, radio: 1, date: 1, time: 1, "datetime-local": 1,
    month: 1, week: 1, color: 1, range: 1, hidden: 1, button: 1, submit: 1,
    reset: 1, image: 1,
  };

  function ruleName(el) {
    if (!el || (el.tagName !== "INPUT" && el.tagName !== "TEXTAREA")) return null;
    if (el.readOnly) return null;
    var type = (el.getAttribute("data-orig-type") || el.type || "text").toLowerCase();
    if (SKIP_TYPES[type]) return null;

    var forced = el.getAttribute("data-allow");
    if (forced && RULES[forced]) return forced;
    if (el.id && BY_ID[el.id]) return BY_ID[el.id];
    if (el.classList && el.classList.contains("id-prefix-input")) return "prefix";

    if (type === "number") {
      var step = el.getAttribute("step");
      return step === "any" || (step && step.indexOf(".") > -1) ? "decimal" : "integer";
    }
    if (type === "email") return "email";
    if (type === "password") {
      // PIN fields are numeric; real passwords/access codes stay unrestricted
      // so nobody gets locked out of an existing password.
      return el.getAttribute("inputmode") === "numeric" ? "pin" : null;
    }
    if (el.tagName === "TEXTAREA") return "notes";
    return "text"; // plain text, search boxes, etc.
  }

  function allowsNegative(el) {
    var min = el.getAttribute("min");
    return min !== null && min !== "" && Number(min) < 0;
  }

  function sanitizeNumber(value, el, rule) {
    var neg = allowsNegative(el);
    var v = String(value).replace(/[^0-9.\-]/g, "");
    var negative = neg && v.charAt(0) === "-";
    v = v.replace(/-/g, "");
    if (rule.dec === 0) {
      v = v.replace(/\./g, "");
    } else {
      var i = v.indexOf(".");
      if (i !== -1) {
        v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, "").slice(0, rule.dec);
      }
    }
    // Cap the whole-number part so absurd values can't be typed.
    var parts = v.split(".");
    var max = el.getAttribute("max");
    var cap = max ? String(Math.floor(Math.abs(Number(max)))).length : 9;
    if (parts[0].length > cap) parts[0] = parts[0].slice(0, cap);
    v = parts.length > 1 ? parts[0] + "." + parts[1] : parts[0];
    return (negative ? "-" : "") + v;
  }

  function sanitize(value, el, name) {
    var rule = RULES[name];
    if (rule.numeric) return sanitizeNumber(value, el, rule);
    var v = String(value).replace(rule.bad, "");
    if (rule.lead) v = v.replace(/^[^A-Za-z\u00C0-\u024F]+/, ""); // must start with a letter
    if (name === "email" || name === "login" || name === "username" || name === "code") {
      v = v.replace(/\s/g, "");
    }
    var max = Number(el.getAttribute("maxlength")) || rule.max;
    return max && v.length > max ? v.slice(0, max) : v;
  }

  // Set up one field: numbers become text + numeric keypad (so letters and
  // 'e', '+', '-' can truly be blocked), plus sensible maxlength / keyboard.
  function prepare(el) {
    var name = ruleName(el);
    if (!name || el.getAttribute("data-guarded") === name) return;
    var rule = RULES[name];

    if (el.tagName === "INPUT" && el.type === "number") {
      el.setAttribute("data-orig-type", "number");
      try { el.type = "text"; } catch (e) { /* ignore */ }
    }
    if (rule.numeric) {
      if (!el.getAttribute("inputmode")) {
        el.setAttribute("inputmode", rule.dec ? "decimal" : "numeric");
      }
      if (!el.getAttribute("maxlength")) el.setAttribute("maxlength", "14");
    } else {
      if (!el.getAttribute("maxlength") && rule.max) {
        el.setAttribute("maxlength", String(rule.max));
      }
      if ((name === "digits" || name === "pin") && !el.getAttribute("inputmode")) {
        el.setAttribute("inputmode", "numeric");
      }
      if (name === "phone" && !el.getAttribute("inputmode")) {
        el.setAttribute("inputmode", "tel");
      }
    }
    el.setAttribute("data-guarded", name);

    // Clean any value that was already there before we got to it.
    if (el.value) {
      var clean = sanitize(el.value, el, name);
      if (clean !== el.value) el.value = clean;
    }
  }

  function cleanOnInput(e) {
    var el = e.target;
    var name = ruleName(el);
    if (!name) return;
    if (el.getAttribute("data-guarded") !== name) prepare(el);

    var raw = el.value;
    var clean = sanitize(raw, el, name);
    if (clean === raw) return;

    var caret = null;
    try { caret = el.selectionStart; } catch (err) { /* e.g. type=email */ }
    el.value = clean;
    if (caret !== null) {
      var before = sanitize(raw.slice(0, caret), el, name);
      var pos = Math.min(before.length, clean.length);
      try { el.setSelectionRange(pos, pos); } catch (err) { /* ignore */ }
    }
  }

  // Block the obvious wrong keys instantly (before they appear at all).
  function blockKeys(e) {
    var el = e.target;
    var name = ruleName(el);
    if (!name || e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
    var rule = RULES[name];
    var ch = e.key;
    var bad;
    if (rule.numeric) {
      if (/[0-9]/.test(ch)) return;
      if (ch === "." && rule.dec > 0 && el.value.indexOf(".") === -1) return;
      if (ch === "-" && allowsNegative(el) && el.value.indexOf("-") === -1) return;
      bad = true;
    } else {
      rule.bad.lastIndex = 0;
      bad = rule.bad.test(ch);
      rule.bad.lastIndex = 0;
      if (!bad && /\s/.test(ch) && (name === "email" || name === "login" || name === "username" || name === "code")) {
        bad = true;
      }
    }
    if (bad) e.preventDefault();
  }

  // On leaving a numeric field, honour its min / max.
  function clampNumber(e) {
    var el = e.target;
    var name = ruleName(el);
    if (!name || !RULES[name].numeric) return;
    var v = el.value;
    if (v === "") return;
    if (v === "." || v === "-") { el.value = ""; return; }
    var n = Number(v);
    if (isNaN(n)) { el.value = ""; return; }
    var min = el.getAttribute("min");
    var max = el.getAttribute("max");
    var c = n;
    if (min !== null && min !== "" && c < Number(min)) c = Number(min);
    if (max !== null && max !== "" && c > Number(max)) c = Number(max);
    if (c !== n) el.value = String(c);
    else if (/\.$/.test(v)) el.value = v.slice(0, -1);
  }

  /* ------------------------------------------------------------------ */
  /* 2. HOVER LABELS                                                     */
  /* ------------------------------------------------------------------ */

  var INTERACTIVE =
    "button, a[href], input, select, textarea, summary, [role=button], [role=tab], " +
    "[role=menuitem], [onclick], [data-tab], [data-key], [data-add], [data-remove], " +
    "[data-pick], [data-qty], [data-cat], [data-period], [data-toggle], label.switch";

  var PRESETS = {
    // ids
    pgFirst: "First page", pgPrev: "Previous page", pgNext: "Next page",
    pgLast: "Last page", pgMore: "Show more",
    exportBtn: "Export to a file", printBtn: "Print this page", periodBtn: "Choose a time period",
    togglePass: "Show or hide password", toggleRegPass: "Show or hide password",
    agGo: "Sign in as admin", agCancel: "Cancel", picChoose: "Choose a product photo",
    picRemove: "Remove the photo", btnAddLevel: "Add another package level",
    addProductSubmit: "Save this product", addProductCancel: "Close without saving",
    accountSubmit: "Save this account", accountCancel: "Close without saving",
    statusCancel: "Close without changing", statusConfirm: "Confirm the status change",
    slipCancel: "Close", slipPrint: "Print the pay slip",
    loginBtn: "Sign in", registerBtn: "Create the account",
  };

  var RESTRICT_NOTE = {
    integer: "numbers only", decimal: "numbers only, decimals allowed",
    tender: "numbers only, decimals allowed", dose: "numbers only, decimals allowed", digits: "numbers only", pin: "numbers only",
  };

  function clean(s, n) {
    s = String(s || "").replace(/\s+/g, " ").trim();
    n = n || 60;
    return s.length > n ? s.slice(0, n - 1) + "\u2026" : s;
  }

  function humanize(s) {
    s = String(s || "")
      .replace(/^(f|r|a|i|g|b|p|sec|me|reg)(?=[A-Z])/, "")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[-_]+/g, " ")
      .trim();
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
  }

  function hasLetters(s) { return /[A-Za-z\u00C0-\u024F]/.test(s || ""); }

  function fieldLabel(el) {
    var txt = "";
    if (el.id) {
      var lab = document.querySelector('label[for="' + (window.CSS && CSS.escape ? CSS.escape(el.id) : el.id) + '"]');
      if (lab) txt = lab.textContent;
    }
    if (!txt) {
      var wrap = el.closest("label");
      if (wrap) txt = wrap.textContent;
    }
    if (!txt) {
      var row = el.closest(".settings-field, .field-row, .form-row, .form-group");
      if (row) {
        var l = row.querySelector(".settings-field-label span, .settings-field-label, label");
        if (l && !l.contains(el)) txt = l.textContent;
      }
    }
    // keep just the main wording ("Default expiry warning (days)"), not trailing hints
    txt = txt.split(/\s*\u2014\s*|\s+\u2013\s+/)[0];
    return clean(txt.replace(/\*/g, ""), 50);
  }

  function describe(el) {
    var tag = el.tagName;
    var aria = el.getAttribute("aria-label");

    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") {
      var type = (el.getAttribute("data-orig-type") || el.type || "").toLowerCase();
      var label = aria || fieldLabel(el) || el.getAttribute("placeholder") ||
        humanize(el.id || el.name);
      label = clean(label, 50);
      if (type === "file") return (label || "Choose a file") + " (choose a file)";
      if (type === "checkbox") return label || "Turn on or off";
      if (type === "date") return (label || "Date") + " (pick a date)";
      if (tag === "SELECT") return (label || "Options") + " (choose one)";
      var name = ruleName(el);
      if (name === "prefix" && el.dataset && el.dataset.category) label = "ID prefix for " + label;
      var note = name ? (RESTRICT_NOTE[name] || (RULES[name] && RULES[name].hint)) : "";
      if (type === "password" && !note) note = "hidden as you type";
      if (/search/i.test(el.id || "") || /^search/i.test(el.getAttribute("placeholder") || "")) {
        return clean(el.getAttribute("placeholder") || "Search", 50);
      }
      return label + (note ? " \u2014 " + note : "");
    }

    if (el.id && PRESETS[el.id]) return PRESETS[el.id];
    if (aria) return aria;

    var ds = el.dataset || {};
    if (ds.qty !== undefined) return Number(ds.qty) < 0 ? "Decrease quantity" : "Increase quantity";
    if (ds.remove !== undefined || el.classList.contains("rm")) {
      return el.classList.contains("btn-link") ? "Remove this package level" : "Remove";
    }
    if (ds.pick !== undefined) return "Choose a photo for this product";
    if (ds.key === "exact") return "Exact amount";
    if (ds.key === "clear") return "Clear the amount";
    if (ds.key && ds.key.indexOf("q:") === 0) return "Quick amount " + ds.key.slice(2);
    if (el.classList.contains("avatar-btn")) return "Account menu";
    if (ds.svClose !== undefined) return "Close";

    var text = clean(el.textContent);
    if (hasLetters(text)) return text;
    if (/^[0-9.,\u20B1$\-+\s]+$/.test(text) && text) return text;

    var fallback = humanize(el.id || ds.tab || ds.value || ds.period || (el.getAttribute("class") || "").split(" ")[0]);
    return fallback;
  }

  function label(el) {
    if (!el || el.nodeType !== 1) return;
    var cur = el.getAttribute("title");
    if (cur && !el.hasAttribute("data-auto-title")) return; // hand-written, keep
    var t = describe(el);
    if (t && t !== cur) {
      el.setAttribute("title", t);
      el.setAttribute("data-auto-title", "1");
    }
  }

  function interactiveOf(node) {
    for (var el = node, i = 0; el && el.nodeType === 1 && i < 6; el = el.parentElement, i++) {
      if (el.matches && el.matches(INTERACTIVE)) return el;
    }
    return null;
  }

  function softTarget(node) {
    // Non-clickable things worth a label: pictures, badges, status chips.
    for (var el = node, i = 0; el && el.nodeType === 1 && i < 3; el = el.parentElement, i++) {
      if (el.tagName === "IMG" && el.getAttribute("alt")) return el;
      if (/(^|[\s_-])(badge|pill|chip|status|tag)([\s_-]|$)/i.test(el.className && el.className.toString())) return el;
      if (el.tagName === "TH") return el;
    }
    return null;
  }

  function onHover(e) {
    var el = interactiveOf(e.target);
    if (!el) {
      var soft = softTarget(e.target);
      if (!soft) return;
      if (!soft.getAttribute("title")) {
        var t = soft.tagName === "IMG" ? soft.getAttribute("alt") : clean(soft.textContent, 60);
        if (t) { soft.setAttribute("title", t); soft.setAttribute("data-auto-title", "1"); }
      }
      return;
    }
    // Icon-only things that are clickable by style rather than by tag.
    prepare(el);
    label(el);
  }

  function pass(root) {
    if (!root || root.nodeType !== 1) return;
    var list = root.matches && root.matches(INTERACTIVE) ? [root] : [];
    var found = root.querySelectorAll ? root.querySelectorAll(INTERACTIVE) : [];
    for (var i = 0; i < found.length; i++) list.push(found[i]);
    for (var j = 0; j < list.length; j++) {
      prepare(list[j]);
      label(list[j]);
    }
  }

  /* ------------------------------------------------------------------ */
  /* wiring                                                              */
  /* ------------------------------------------------------------------ */

  document.addEventListener("keydown", blockKeys, true);
  document.addEventListener("input", cleanOnInput, true);
  document.addEventListener("change", clampNumber, true);
  document.addEventListener("focusout", clampNumber, true);
  document.addEventListener("mouseover", onHover, true);
  document.addEventListener("focusin", function (e) {
    var el = interactiveOf(e.target);
    if (el) { prepare(el); label(el); }
  }, true);

  var queued = [];
  var scheduled = false;
  function flush() {
    scheduled = false;
    var nodes = queued;
    queued = [];
    for (var i = 0; i < nodes.length; i++) pass(nodes[i]);
  }

  function start() {
    pass(document.body);
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === "childList") {
          for (var j = 0; j < m.addedNodes.length; j++) {
            if (m.addedNodes[j].nodeType === 1) queued.push(m.addedNodes[j]);
          }
        } else if (m.type === "attributes" && m.target.hasAttribute("data-auto-title")) {
          // label text changed (e.g. Show password -> Hide password)
          m.target.removeAttribute("title");
          queued.push(m.target);
        }
      }
      if (queued.length && !scheduled) {
        scheduled = true;
        (window.requestAnimationFrame || setTimeout)(flush);
      }
    }).observe(document.body, {
      childList: true, subtree: true,
      attributes: true, attributeFilter: ["aria-label", "aria-pressed"],
    });
  }

  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start);
})();
