// Topbar search on pages without a list of their own: Enter opens the
// Inventory page filtered by the search term.
(function () {
  var input = document.getElementById("searchInput");
  if (!input) return;
  input.addEventListener("keydown", function (e) {
    if (e.key !== "Enter") return;
    var q = input.value.trim();
    window.location.href = "inventory.html" + (q ? "?q=" + encodeURIComponent(q) : "");
  });
})();
