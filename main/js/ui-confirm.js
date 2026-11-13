/*
 * ui-confirm.js — one confirmation pop-up used everywhere.
 *
 *   MynelleConfirm.ask({ title, message, details:[[label,value],...],
 *                        confirmText, cancelText, tone:'primary|success|danger' })
 *       -> Promise<boolean>
 *   MynelleConfirm.gate(formEl, opts)  -> true when the form may go ahead now.
 *       Put it AFTER validation in a submit handler:
 *       if (!MynelleConfirm.gate(form, {...})) return;
 *   MynelleConfirm.guardClick(selector, optsFn)  -> asks before any click on a
 *       matching element does its job (optsFn may return null to skip).
 *
 * Enter confirms, Esc / clicking outside cancels.
 */
(function () {
  "use strict";
  if (window.MynelleConfirm) return;

  var css =
    ".mc-overlay{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(12, 12, 12,.5);font-family:Inter,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif}" +
    ".mc-card{width:100%;max-width:420px;background:var(--card,#fff);color:var(--text,#0d0d0d);border:1px solid var(--border,#e1e6f0);border-radius:14px;box-shadow:0 18px 50px rgba(12, 12, 12,.35);padding:22px 22px 18px;animation:mc-in .14s ease-out}" +
    "@keyframes mc-in{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}" +
    ".mc-title{margin:0 0 6px;font-size:17px;font-weight:700;line-height:1.3}" +
    ".mc-msg{margin:0;font-size:13.5px;line-height:1.5;color:var(--text-muted,#6b7280)}" +
    ".mc-details{margin:14px 0 0;padding:10px 12px;border-radius:10px;background:var(--bg,#f2f4f9);font-size:13px;display:grid;grid-template-columns:auto 1fr;gap:6px 14px}" +
    ".mc-details dt{color:var(--text-muted,#6b7280)}.mc-details dd{margin:0;font-weight:600;text-align:right;word-break:break-word}" +
    ".mc-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:20px}" +
    ".mc-btn{font:inherit;font-size:14px;font-weight:600;border-radius:10px;padding:9px 18px;cursor:pointer;border:1px solid var(--border,#d3dae9);background:transparent;color:var(--text,#0d0d0d)}" +
    ".mc-btn:hover{background:rgba(131, 137, 149,.12)}" +
    ".mc-btn.mc-ok{border-color:transparent;color:#fff;background:var(--blue,#0442bf)}" +
    ".mc-btn.mc-ok.success{background:#17803d}.mc-btn.mc-ok.danger{background:#d90416}" +
    ".mc-btn.mc-ok:hover{filter:brightness(1.1)}" +
    ".mc-btn:focus-visible{outline:2px solid #5b8def;outline-offset:2px}";
  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  var open = false;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function ask(opts) {
    opts = opts || {};
    if (open) return Promise.resolve(false); // never stack two pop-ups
    open = true;
    var previousFocus = document.activeElement;

    return new Promise(function (resolve) {
      var overlay = el("div", "mc-overlay");
      var card = el("div", "mc-card");
      card.setAttribute("role", "alertdialog");
      card.setAttribute("aria-modal", "true");
      var title = el("h3", "mc-title", opts.title || "Are you sure?");
      title.id = "mcTitle";
      card.setAttribute("aria-labelledby", "mcTitle");
      card.appendChild(title);
      if (opts.message) card.appendChild(el("p", "mc-msg", opts.message));
      if (opts.details && opts.details.length) {
        var dl = el("dl", "mc-details");
        opts.details.forEach(function (row) {
          if (row[1] === "" || row[1] == null) return;
          dl.appendChild(el("dt", "", row[0]));
          dl.appendChild(el("dd", "", String(row[1])));
        });
        card.appendChild(dl);
      }
      var actions = el("div", "mc-actions");
      var cancel = el("button", "mc-btn", opts.cancelText || "Cancel");
      cancel.type = "button";
      var ok = el("button", "mc-btn mc-ok " + (opts.tone || "primary"), opts.confirmText || "Confirm");
      ok.type = "button";
      actions.appendChild(cancel);
      actions.appendChild(ok);
      card.appendChild(actions);
      overlay.appendChild(card);
      document.body.appendChild(overlay);
      ok.focus();

      function done(result) {
        document.removeEventListener("keydown", onKey, true);
        overlay.remove();
        open = false;
        try { if (previousFocus && previousFocus.focus) previousFocus.focus(); } catch (e) { /* ignore */ }
        resolve(result);
      }
      function onKey(e) {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done(false); }
        else if (e.key === "Enter") {
          // Enter on Cancel cancels; anywhere else confirms.
          e.preventDefault(); e.stopPropagation();
          done(document.activeElement === cancel ? false : true);
        } else if (e.key === "Tab") {
          e.preventDefault();
          (document.activeElement === ok ? cancel : ok).focus();
        } else if (/^F\d+$/.test(e.key)) {
          e.preventDefault(); e.stopPropagation(); // POS shortcuts stay quiet while asking
        }
      }
      document.addEventListener("keydown", onKey, true);
      ok.addEventListener("click", function () { done(true); });
      cancel.addEventListener("click", function () { done(false); });
      overlay.addEventListener("mousedown", function (e) { if (e.target === overlay) done(false); });
    });
  }

  function gate(form, opts) {
    if (form.__mcOk) { form.__mcOk = false; return true; }
    ask(opts).then(function (yes) {
      if (!yes) return;
      form.__mcOk = true;
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      form.__mcOk = false;
    });
    return false;
  }

  function guardClick(selector, optsFn) {
    document.addEventListener("click", function (e) {
      var target = e.target && e.target.closest ? e.target.closest(selector) : null;
      if (!target || target.disabled) return;
      if (target.__mcOk) { target.__mcOk = false; return; }
      var opts = optsFn(target);
      if (!opts) return; // nothing to confirm right now
      e.preventDefault();
      e.stopImmediatePropagation();
      ask(opts).then(function (yes) {
        if (!yes) return;
        target.__mcOk = true;
        target.click();
        target.__mcOk = false;
      });
    }, true);
  }

  window.MynelleConfirm = { ask: ask, gate: gate, guardClick: guardClick };
})();
