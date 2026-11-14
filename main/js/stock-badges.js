/*
 * Sidebar count badges beside "Alerts".
 *   red    = out of stock
 *   orange = low stock (not yet zero)
 *   purple = expiring soon
 * Counts come straight from live inventory, NOT from notification read/dismiss
 * state, so viewing a page never clears them — they only drop when stock is
 * refilled (or the expiring batch is dealt with).
 */
(function () {
  "use strict";

  function counts() {
    if (typeof MynelleStore === "undefined") return null;
    var out = 0, low = 0, exp = 0;
    MynelleStore.getProducts().forEach(function (p) {
      if (Number(p.stock) === 0) out++;
      else if (MynelleStore.isLowStock(p)) low++;
      if (MynelleStore.isExpiringSoon(p)) exp++;
    });
    return { out: out, low: low, exp: exp };
  }

  var LABELS = {
    out: ["item out of stock", "items out of stock"],
    low: ["item low on stock", "items low on stock"],
    exp: ["item expiring soon", "items expiring soon"],
  };

  function render() {
    var link = document.querySelector('.nav-item[data-key="alerts"]');
    var c = counts();
    if (!link || !c) return;
    var wrap = link.querySelector(".nav-badges");
    if (!wrap) {
      wrap = document.createElement("span");
      wrap.className = "nav-badges";
      link.appendChild(wrap);
    }
    wrap.innerHTML = "";
    var kinds = ["out", "low", "exp"].filter(function (k) { return c[k] > 0; });
    if (!kinds.length) { link.title = "Alerts"; return; }
    var summary = kinds
      .map(function (k) { return c[k] + " " + LABELS[k][c[k] === 1 ? 0 : 1]; })
      .join(" \u00B7 ");
    link.title = "Alerts \u2014 " + summary;
    wrap.setAttribute("aria-label", summary);
    // One stack: the highest-priority type (out > low > expiring) sits in
    // front on the left with its count; the others peek out from behind it.
    kinds.forEach(function (k, i) {
      var b = document.createElement("span");
      b.className = "nav-badge " + (i === 0 ? "front " : "behind ") + k;
      b.style.zIndex = String(kinds.length - i); // front = highest
      b.title = summary;
      if (i === 0) b.textContent = c[k] > 99 ? "99+" : String(c[k]);
      else b.setAttribute("aria-hidden", "true");
      wrap.appendChild(b);
    });
  }

  render();
  document.addEventListener("mynelle:products-changed", render);
  window.addEventListener("storage", render); // another tab / the POS changed stock
  window.addEventListener("focus", render);
  document.addEventListener("visibilitychange", render);
  setInterval(render, 60000); // also catches expiry dates rolling over
})();
