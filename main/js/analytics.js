// Analytics: one page with the pharmacy's stock figures and the insights worked out from its sales and stock
// (highlights, what changed, forecast, stock and expiry outlook, recommended actions).
// Needs analytics-lib.js, inventory-charts.js, insights.js and settings-store.js.
(function () {
  var A = Analytics;
  var $ = function (id) { return document.getElementById(id); };
  var period = A.initialPeriod("This month");

  function render() {
    Insights.highlights($("insHighlights"), period);
    Insights.why($("insWhy"), period);
    Insights.forecast($("insForecast"));
    Insights.risks($("insRisks"));
    Insights.actions($("insActions"), 10);
  }

  A.tabs($("periodTabs"), period, function (p) { period = p; render(); });
  A.onResize(render);
  render();
})();
