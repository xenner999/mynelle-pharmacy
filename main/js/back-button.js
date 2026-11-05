// Adds a "Back" button to the top of a page's content area.
// Goes to the previous page; if the page was opened directly (no history),
// falls back to the dashboard.
(function () {
  function init() {
    var content = document.querySelector(".content");
    if (!content || content.querySelector(".page-back-btn")) return;
    var btn = document.createElement("a");
    btn.className = "page-back-btn";
    btn.href = "dashboard.html";
    btn.innerHTML = '<i class="fi fi-rr-arrow-small-left"></i> Back';
    btn.addEventListener("click", function (e) {
      if (window.history.length > 1) {
        e.preventDefault();
        window.history.back();
      }
    });
    content.insertBefore(btn, content.firstChild);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
