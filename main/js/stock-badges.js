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
    // One stacked badge: the most urgent type sits in front with its count,
    // and a "+" says more alert types are tucked behind it.
    var kinds = ["out", "low", "exp"].filter(function (k) { return c[k] > 0; });
    if (!kinds.length) { link.title = "Alerts"; return; }
    var summary = kinds
      .map(function (k) { return c[k] + " " + LABELS[k][c[k] === 1 ? 0 : 1]; })
      .join(" \u00B7 ");
    link.title = "Alerts \u2014 " + summary;
    wrap.setAttribute("aria-label", summary);
    // back-most first, front-most last (later siblings paint on top)
    kinds.slice(1).reverse().forEach(function (k) {
      var back = document.createElement("span");
      back.className = "nav-badge behind " + k;
      back.setAttribute("aria-hidden", "true");
      back.title = summary;
      wrap.appendChild(back);
    });
    var front = document.createElement("span");
    front.className = "nav-badge front " + kinds[0];
    front.title = summary;
    var n = c[kinds[0]] > 99 ? "99" : String(c[kinds[0]]);
    front.textContent = n;
    if (kinds.length > 1 || c[kinds[0]] > 99) {
      var plus = document.createElement("sup");
      plus.textContent = "+";
      front.appendChild(plus);
    }
    wrap.appendChild(front);
  }

  render();
  document.addEventListener("mynelle:products-changed", render);
  window.addEventListener("storage", render); // another tab / the POS changed stock
  window.addEventListener("focus", render);
  document.addEventListener("visibilitychange", render);
  setInterval(render, 60000); // also catches expiry dates rolling over
})();
