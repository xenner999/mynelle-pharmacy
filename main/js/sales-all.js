var searchInput = document.getElementById("searchInput");
var summaryEl = document.getElementById("salesSummary");
var tableWrap = document.querySelector(".table-wrap");
var pager = document.getElementById("allPager");
var sortSelect = document.getElementById("sortSelect");
var sizeSelect = document.getElementById("sizeSelect");

var state = {
  period: SalesView.validPeriod(SalesView.param("period")) ? SalesView.param("period") : "This month",
  query: SalesView.param("q"),
  sort: ["newest", "oldest", "highest", "lowest"].indexOf(SalesView.param("sort")) !== -1 ? SalesView.param("sort") : "newest",
  size: 100,
  page: 0,
};
searchInput.value = state.query;
sortSelect.value = state.sort;

function csvCell(v) {
  var s = String(v == null ? "" : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function render() {
  var rows = SalesView.filter(state.period, state.query, state.sort);
  summaryEl.innerHTML = SalesView.summaryHtml(rows);

  var pages = Math.max(1, Math.ceil(rows.length / state.size));
  if (state.page > pages - 1) state.page = pages - 1;
  var start = state.page * state.size;
  var end = Math.min(rows.length, start + state.size);

  SalesView.clearRows(tableWrap);
  if (!rows.length) {
    tableWrap.appendChild(SalesView.emptyFor(rows));
    pager.innerHTML = "";
    return;
  }
  var frag = document.createDocumentFragment();
  rows.slice(start, end).forEach(function (s) {
    frag.appendChild(SalesView.rowEl(s));
  });
  tableWrap.appendChild(frag);

  pager.innerHTML =
    '<span class="pager-info">Showing ' + (start + 1) + "\u2013" + end + " of " + rows.length.toLocaleString("en-US") + "</span>" +
    '<div class="pager-actions">' +
    '<button type="button" class="pager-btn" id="pgFirst"' + (state.page === 0 ? " disabled" : "") + ">First</button>" +
    '<button type="button" class="pager-btn" id="pgPrev"' + (state.page === 0 ? " disabled" : "") + ">Previous</button>" +
    '<span class="pager-page">Page ' + (state.page + 1) + " of " + pages + "</span>" +
    '<button type="button" class="pager-btn" id="pgNext"' + (state.page >= pages - 1 ? " disabled" : "") + ">Next</button>" +
    '<button type="button" class="pager-btn" id="pgLast"' + (state.page >= pages - 1 ? " disabled" : "") + ">Last</button>" +
    "</div>";

  function go(page) {
    state.page = page;
    render();
    tableWrap.scrollIntoView({ block: "start" });
  }
  document.getElementById("pgFirst").addEventListener("click", function () { go(0); });
  document.getElementById("pgPrev").addEventListener("click", function () { go(state.page - 1); });
  document.getElementById("pgNext").addEventListener("click", function () { go(state.page + 1); });
  document.getElementById("pgLast").addEventListener("click", function () { go(pages - 1); });
}

SalesView.wirePeriodMenu(function (p) {
  state.period = p;
  state.page = 0;
  render();
}, state.period);

sortSelect.addEventListener("change", function () {
  state.sort = sortSelect.value;
  state.page = 0;
  render();
});
sizeSelect.addEventListener("change", function () {
  state.size = Number(sizeSelect.value);
  state.page = 0;
  render();
});

var searchTimer = null;
searchInput.addEventListener("input", function () {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(function () {
    state.query = searchInput.value;
    state.page = 0;
    render();
  }, 150);
});

// Exports every transaction matching the current filters, not only this page.
document.getElementById("exportBtn").addEventListener("click", function () {
  var rows = SalesView.filter(state.period, state.query, state.sort);
  var lines = [["Transaction ID", "Date and time", "Payment", "Products", "Quantity", "Total"].join(",")];
  rows.forEach(function (s) {
    lines.push(
      [
        s.id,
        MynelleStore.formatDateTime(s.at),
        s.payment || "Cash",
        s.items.map(function (i) { return i.name + " x" + i.qty; }).join("; "),
        MynelleStore.saleQty(s),
        MynelleStore.saleTotal(s).toFixed(2),
      ].map(csvCell).join(",")
    );
  });
  var blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = "transactions.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

window.addEventListener("storage", function (e) {
  if (e.key === MynelleStore.SALES_KEY) render();
});

render();
