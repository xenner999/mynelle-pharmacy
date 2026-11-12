// Phone/tablet helper: a sticky bar showing the running order, so the cashier can
// keep adding products and jump to the order + payment when ready.
(function () {
  "use strict";
  var mq = window.matchMedia("(max-width: 860px)");
  var bar = document.createElement("div");
  bar.className = "pos-bar";
  bar.id = "posBar";
  bar.hidden = true;
  bar.innerHTML =
    '<div><b id="posBarItems">0 items</b><span id="posBarTotal"></span></div>' +
    '<button type="button" id="posBarBtn" title="Go to the order and payment">Review &amp; pay \u2193</button>';
  document.body.appendChild(bar);

  var cartVisible = false;
  var observed = null;
  var io = "IntersectionObserver" in window
    ? new IntersectionObserver(function (entries) {
        cartVisible = entries.some(function (e) { return e.isIntersecting; });
        update();
      }, { threshold: 0.12 })
    : null;

  function update() {
    var s = window.PosSaleSummary ? window.PosSaleSummary() : null;
    var show = !!(s && s.count > 0 && mq.matches && !cartVisible);
    bar.hidden = !show;
    if (s) {
      document.getElementById("posBarItems").textContent = s.items;
      document.getElementById("posBarTotal").textContent = "Total " + s.total;
    }
  }
  function watchCart() {
    var cart = document.querySelector(".col-cart");
    if (io && cart && cart !== observed) {
      if (observed) io.unobserve(observed);
      observed = cart;
      io.observe(cart);
    }
    update();
  }

  var queued = false;
  new MutationObserver(function () {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; watchCart(); });
  }).observe(document.getElementById("app"), { childList: true, subtree: true });
  if (mq.addEventListener) mq.addEventListener("change", update);

  document.getElementById("posBarBtn").addEventListener("click", function () {
    var cart = document.querySelector(".col-cart");
    if (cart) cart.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  watchCart();
})();
