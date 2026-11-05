var searchInput = document.getElementById("searchInput");
var summaryEl = document.getElementById("salesSummary");
var tableWrap = document.querySelector(".table-wrap");

var PAGE = 50; // rows per step
var MAX_VISIBLE = 200; // never draw more than this on this page

var initialPeriod = SalesView.validPeriod(SalesView.param("period"))
  ? SalesView.param("period")
  : "This month";
var state = { period: initialPeriod, query: "", offset: 0, count: PAGE };

var pager = document.createElement("div");
pager.className = "pager";
tableWrap.insertAdjacentElement("afterend", pager);

function showAllHref() {
  var qs = "?period=" + encodeURIComponent(state.period);
  if (state.query.trim()) qs += "&q=" + encodeURIComponent(state.query.trim());
  return "sales-all.html" + qs;
}

function render() {
  var rows = SalesView.filter(state.period, state.query, "newest");
  summaryEl.innerHTML = SalesView.summaryHtml(rows);

  if (state.offset >= rows.length) state.offset = Math.max(0, Math.floor((rows.length - 1) / PAGE) * PAGE);
  var start = state.offset;
  var end = Math.min(rows.length, start + state.count);

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

  var canMore = end < rows.length && state.count < MAX_VISIBLE;
  pager.innerHTML =
    '<span class="pager-info">Showing ' + (start + 1) + "\u2013" + end + " of " + rows.length.toLocaleString("en-US") + "</span>" +
    '<div class="pager-actions">' +
    '<button type="button" class="pager-btn" id="pgPrev"' + (start === 0 ? " disabled" : "") + ">Previous</button>" +
    '<button type="button" class="pager-btn" id="pgNext"' + (end >= rows.length ? " disabled" : "") + ">Next</button>" +
    (canMore ? '<button type="button" class="pager-btn" id="pgMore">Show more</button>' : "") +
    '<a class="pager-btn primary" id="pgAll" href="' + SalesView.esc(showAllHref()) + '">Show all</a>' +
    "</div>";

  document.getElementById("pgPrev").addEventListener("click", function () {
    state.offset = Math.max(0, state.offset - PAGE);
    state.count = PAGE;
    render();
  });
  document.getElementById("pgNext").addEventListener("click", function () {
    state.offset = end;
    state.count = PAGE;
    render();
  });
  var more = document.getElementById("pgMore");
  if (more) {
    more.addEventListener("click", function () {
      state.count = Math.min(MAX_VISIBLE, state.count + PAGE);
      render();
    });
  }
}

SalesView.wirePeriodMenu(function (p) {
  state.period = p;
  state.offset = 0;
  state.count = PAGE;
  render();
}, state.period);

var searchTimer = null;
searchInput.addEventListener("input", function () {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(function () {
    state.query = searchInput.value;
    state.offset = 0;
    state.count = PAGE;
    render();
  }, 120);
});

window.addEventListener("storage", function (e) {
  if (e.key === MynelleStore.SALES_KEY) render();
});

render();
