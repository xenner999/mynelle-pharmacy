// Menu button for narrow screens: opens and closes the sidebar.
(function () {
  var sidebar = document.querySelector(".sidebar");
  var topbar = document.querySelector("header.topbar");
  if (!sidebar || !topbar) return;

  var btn = document.createElement("button");
  btn.type = "button";
  btn.className = "nav-toggle";
  btn.setAttribute("aria-label", "Open menu");
  btn.setAttribute("aria-expanded", "false");
  btn.innerHTML =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>';
  topbar.insertBefore(btn, topbar.firstChild);

  var backdrop = document.createElement("div");
  backdrop.className = "nav-backdrop";
  document.body.appendChild(backdrop);

  function set(open) {
    document.body.classList.toggle("nav-open", open);
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    btn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  }

  btn.addEventListener("click", function () {
    set(!document.body.classList.contains("nav-open"));
  });
  backdrop.addEventListener("click", function () {
    set(false);
  });
  sidebar.addEventListener("click", function (e) {
    if (e.target.closest("a")) set(false);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") set(false);
  });
  window.addEventListener("resize", function () {
    if (window.innerWidth > 960) set(false);
  });
})();
