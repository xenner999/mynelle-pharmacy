// Fills the POS header with live date/time, cashier name and shift timer.
(function () {
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function init() {
    var inner = document.querySelector("header .header-inner");
    if (!inner || document.getElementById("posHeaderInfo")) return;

    var info = document.createElement("div");
    info.className = "header-info";
    info.id = "posHeaderInfo";
    info.innerHTML =
      '<div class="hi-chip hi-date"><i class="fi fi-rr-calendar"></i><div><span class="hi-main" id="hiDate"></span><span class="hi-sub" id="hiDay"></span></div></div>' +
      '<div class="hi-chip hi-time"><i class="fi fi-rr-clock"></i><div><span class="hi-main" id="hiTime"></span><span class="hi-sub">Local time</span></div></div>' +
      '<div class="hi-chip hi-shift"><span class="hi-dot" id="hiDot"></span><div><span class="hi-main" id="hiWho"></span><span class="hi-sub" id="hiShift"></span></div></div>';
    var brand = inner.querySelector(".brand");
    inner.insertBefore(info, brand ? brand.nextSibling : inner.firstChild);

    var acc = window.PosSession && window.PosSession.account;
    document.getElementById("hiWho").textContent = acc ? (acc.fullName || "Cashier") : "Not signed in";

    function tick() {
      var d = new Date();
      document.getElementById("hiDate").textContent = d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
      document.getElementById("hiDay").textContent = d.toLocaleDateString("en-US", { weekday: "long" });
      document.getElementById("hiTime").textContent = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });

      var shift = null;
      try { shift = acc && window.TimeStore ? TimeStore.openShift(acc.id) : null; } catch (e) {}
      var dot = document.getElementById("hiDot"), sub = document.getElementById("hiShift");
      if (shift && shift.in) {
        var ms = Math.max(0, d - new Date(shift.in)), s = Math.floor(ms / 1000);
        sub.textContent = "On shift \u00B7 " + pad(Math.floor(s / 3600)) + ":" + pad(Math.floor(s / 60) % 60) + ":" + pad(s % 60);
        dot.className = "hi-dot";
      } else {
        sub.textContent = acc ? "Not checked in" : "Cashier terminal";
        dot.className = "hi-dot off";
      }
    }
    tick();
    setInterval(tick, 1000);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
