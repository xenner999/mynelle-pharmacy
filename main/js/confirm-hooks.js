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
  C.guardClick("#secSaveBtn", function () {
    return {
      title: "Change the access code?",
      message: "You'll need the new code the next time you unlock protected areas.",
      confirmText: "Change code",
      tone: "danger",
    };
  });
})();
