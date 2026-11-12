/*
 * confirm-hooks.js — which buttons ask "are you sure?" first.
 * Selectors that don't exist on a page are simply ignored.
 */
(function () {
  "use strict";
  if (!window.MynelleConfirm) return;
  var C = window.MynelleConfirm;

  // ---- POS ----
  // Final step of a sale (Print receipt / Done) records the transaction.
  C.guardClick("#printReceiptBtn, #doneBtn", function () {
    var s = window.PosSaleSummary ? window.PosSaleSummary() : null;
    return {
      title: "Complete this transaction?",
      message: "Stock will be deducted and the sale recorded. This can't be undone from the POS.",
      details: s ? [["Items", s.items], ["Payment", s.method], ["Total", s.total], ["Change", s.change]] : [],
      confirmText: "Complete sale",
      tone: "success",
    };
  });
  C.guardClick("#clearCartBtn, #cancelSaleBtn", function () {
    var s = window.PosSaleSummary ? window.PosSaleSummary() : null;
    if (s && !s.count) return null; // nothing in the cart
    return {
      title: "Clear the cart?",
      message: "Every item in this order will be removed.",
      details: s ? [["Items", s.items], ["Total", s.total]] : [],
      confirmText: "Clear cart",
      tone: "danger",
    };
  });
  C.guardClick("#holdSaleBtn", function () {
    var s = window.PosSaleSummary ? window.PosSaleSummary() : null;
    if (s && !s.count) return null;
    return {
      title: "Hold this order?",
      message: "It will be set aside so you can serve the next customer.",
      details: s ? [["Items", s.items], ["Total", s.total]] : [],
      confirmText: "Hold order",
    };
  });

  // ---- Inventory ----
  C.guardClick('[data-action="archive"]', function (btn) {
    var name = "";
    if (window.MynelleStore) {
      var hit = MynelleStore.getProducts().filter(function (p) { return p.id === btn.dataset.id; })[0];
      if (hit) name = hit.name;
    }
    return {
      title: "Archive this product?",
      message: "It will be hidden from inventory and the POS. You can restore it later.",
      details: [["Product", (name || "").trim()]],
      confirmText: "Archive",
      tone: "danger",
    };
  });

  // ---- Settings: every Save + data tools ----
  C.guardClick("[data-save]", function (btn) {
    var section = btn.getAttribute("data-save");
    return {
      title: "Save changes?",
      message: "Update your " + section + " settings. This applies right away.",
      confirmText: "Save changes",
    };
  });

  // ---- Inventory: restore, product photo ----
  C.guardClick('.action-icon-btn[data-action="restore"]', function (btn) {
    var name = "";
    if (window.MynelleStore) {
      var hit = MynelleStore.getAllProducts
        ? MynelleStore.getAllProducts().filter(function (p) { return p.id === btn.dataset.id; })[0]
        : null;
      if (hit) name = hit.name;
    }
    return {
      title: "Restore this product?",
      message: "It will show up in inventory and the POS again.",
      details: [["Product", name]],
      confirmText: "Restore",
      tone: "success",
    };
  });
  C.guardClick("#picRemove", function () {
    return { title: "Remove this photo?", message: "The product will go back to having no picture.", confirmText: "Remove photo", tone: "danger" };
  });
  C.guardClick(".img-btn[data-remove]", function () {
    return { title: "Remove this photo?", message: "The product will go back to having no picture.", confirmText: "Remove photo", tone: "danger" };
  });

  // ---- Notifications ----
  C.guardClick("#dismissAllBtn", function () {
    return { title: "Dismiss all shown alerts?", message: "They'll be hidden from Notifications. You can show dismissed alerts again with the checkbox.", confirmText: "Dismiss all" };
  });
  C.guardClick('.alert-action-btn[data-action="restore"]', function () {
    return { title: "Restore this alert?", message: "It will show in your active notifications again.", confirmText: "Restore" };
  });
  C.guardClick('.alert-action-btn[data-action="dismiss"]', function () {
    return { title: "Dismiss this alert?", message: "It will be hidden until you show dismissed alerts.", confirmText: "Dismiss" };
  });

  // ---- Profile / PIN ----
  C.guardClick("#meSave", function () {
    return { title: "Save your profile?", message: "Your name, username and email will be updated.", confirmText: "Save profile", tone: "success" };
  });
  C.guardClick("#pwSaveBtn", function () {
    return { title: "Update your PIN?", message: "You'll use the new PIN the next time you sign in at the till.", confirmText: "Update PIN", tone: "danger" };
  });

  // ---- POS ----
  C.guardClick(".rm[data-remove]", function (btn) {
    var row = btn.closest(".cart-item, .cart-row, li, div");
    return { title: "Remove this item?", message: "It will be taken out of the current order.", confirmText: "Remove", tone: "danger" };
  });
  C.guardClick("#navLogout", function () {
    return { title: "Sign out of the till?", message: "You'll go back to the Time Tracker. Your shift stays open unless you check out.", confirmText: "Sign out", tone: "danger" };
  });
})();
