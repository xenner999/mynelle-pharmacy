// Topbar search that only filters the page you are on (reports, alerts,
// analytics...). It hides the rows, cards and panels that don't match.
//   <script src="../js/page-search.js" data-placeholder="Search alerts"></script>
(function () {
  var script = document.currentScript;
  var input = document.getElementById("searchInput");
  var main = document.querySelector("main");
  if (!input || !main) return;
  if (script && script.dataset.placeholder) input.placeholder = script.dataset.placeholder;

  var content = main.querySelector(".content") || main;
  var ROWS = "tbody tr, .table-row, .alert-row, .an-bar-row, .an-legend-row, .bar-row, .metric-bar-row, .link-chip";
  var BOXES = ".panel, .stat-card, .kpi, .stat-grid > *, .kpi-grid > *";
  var HEADING = ".an-panel-title, .panel-title, .panel-head-title, h2, h3, .stat-label, .kpi-label, .title";

  var style = document.createElement("style");
  style.textContent =
    ".ps-hide{display:none !important}" +
    ".ps-empty{padding:28px;text-align:center;color:#6b7280;font-size:14px;background:#fff;border:1px dashed #d1d5db;border-radius:14px;margin-bottom:16px}";
  document.head.appendChild(style);

  var empty = document.createElement("div");
  empty.className = "ps-empty ps-hide";
  content.insertBefore(empty, content.firstChild);

  function norm(t) {
    return String(t || "").toLowerCase().replace(/\s+/g, " ");
  }
  function hit(el, tokens) {
    var t = norm(el.textContent);
    return tokens.every(function (k) { return t.indexOf(k) !== -1; });
  }
  function setHidden(el, hide) {
    el.classList.toggle("ps-hide", hide);
  }

  function apply() {
    var q = norm(input.value).trim();
    var rows = Array.prototype.slice.call(content.querySelectorAll(ROWS));
    var boxes = Array.prototype.slice.call(content.querySelectorAll(BOXES));

    if (!q) {
      rows.concat(boxes).forEach(function (el) { setHidden(el, false); });
      setHidden(empty, true);
      return;
    }
    var tokens = q.split(" ");
    var visible = 0;
    var inBox = new Set();

    boxes.forEach(function (box) {
      var boxRows = rows.filter(function (r) { return box.contains(r); });
      boxRows.forEach(function (r) { inBox.add(r); });
      var headEl = box.querySelector(HEADING);
      var headMatch = headEl ? hit(headEl, tokens) : false;
      var show;
      if (boxRows.length) {
        if (headMatch) {
          boxRows.forEach(function (r) { setHidden(r, false); });
          show = true;
        } else {
          var n = 0;
          boxRows.forEach(function (r) {
            var ok = hit(r, tokens);
            setHidden(r, !ok);
            if (ok) n++;
          });
          show = n > 0;
        }
      } else {
        show = hit(box, tokens);
      }
      setHidden(box, !show);
      if (show) visible++;
    });

    rows.forEach(function (r) {
      if (inBox.has(r)) return;
      var ok = hit(r, tokens);
      setHidden(r, !ok);
      if (ok) visible++;
    });

    empty.textContent = 'Nothing on this page matches "' + input.value.trim() + '".';
    setHidden(empty, visible > 0);
  }

  input.addEventListener("input", apply);
  input.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { input.value = ""; apply(); }
  });

  // Charts and tables are drawn by the page script after load; keep the
  // filter applied when they re-render.
  var timer = null;
  new MutationObserver(function () {
    if (!input.value.trim()) return;
    clearTimeout(timer);
    timer = setTimeout(apply, 80);
  }).observe(content, { childList: true, subtree: true });

  var m = /[?&]q=([^&]*)/.exec(window.location.search);
  if (m) { input.value = decodeURIComponent(m[1].replace(/\+/g, " ")); apply(); }
})();
