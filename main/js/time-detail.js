// Dedicated page for a slice of time.
//   time-detail.html?kind=hour&key=2026-9-28-14       one hour of one day
//   time-detail.html?kind=day&key=2026-9-28            one day
//   time-detail.html?kind=month&key=2026-9             one month
//   time-detail.html?kind=hourofday&key=14&period=..   an hour of day, across a period
//   time-detail.html?kind=weekday&key=1&period=..      a weekday, across a period
(function () {
  var A = Analytics;
  var S = MynelleStore;
  var $ = function (id) { return document.getElementById(id); };
  A.wireBack();

  var kind = A.param("kind");
  var key = A.param("key");
  var period = A.initialPeriod("This month");
  var MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var DAYS_LONG = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];
  var n = (key || "").split("-").map(Number);
  var title = "";
  var sub = "";
  var match = null;

  if (kind === "hour" && n.length === 4) {
    match = function (t) { return t.getFullYear() === n[0] && t.getMonth() === n[1] && t.getDate() === n[2] && t.getHours() === n[3]; };
    title = A.hourLabel(n[3]) + " hour, " + A.MONTHS[n[1]] + " " + n[2] + ", " + n[0];
    sub = "Every sale in this hour";
  } else if (kind === "day" && n.length === 3) {
    match = function (t) { return t.getFullYear() === n[0] && t.getMonth() === n[1] && t.getDate() === n[2]; };
    title = A.WEEKDAYS[new Date(n[0], n[1], n[2]).getDay()] + ", " + A.MONTHS[n[1]] + " " + n[2] + ", " + n[0];
    sub = "Every sale on this day";
  } else if (kind === "month" && n.length === 2) {
    match = function (t) { return t.getFullYear() === n[0] && t.getMonth() === n[1]; };
    title = MONTHS_LONG[n[1]] + " " + n[0];
    sub = "Every sale in this month";
  } else if (kind === "hourofday" && n.length === 1 && !isNaN(n[0])) {
    match = function (t) { return t.getHours() === n[0]; };
    title = A.hourLabel(n[0]) + " hour of the day";
    sub = "Sales at this hour, " + period.toLowerCase();
  } else if (kind === "weekday" && n.length === 1 && !isNaN(n[0]) && n[0] >= 0 && n[0] <= 6) {
    match = function (t) { return t.getDay() === n[0]; };
    title = DAYS_LONG[n[0]];
    sub = "Sales on this day of the week, " + period.toLowerCase();
  }
  if (!match) {
    A.missing("Time period not found", "That time period could not be read from the link.", "analytics.html", "Back to analytics");
    return;
  }
  A.head(title, sub);

  var inPeriod = kind === "hourofday" || kind === "weekday";
  var sales = S.getSales().filter(function (s) {
    var t = new Date(s.at);
    if (inPeriod && t < S.periodStart(period)) return false;
    return match(t);
  });
  var cur = A.totals(sales);

  A.stats($("summary"), [
    { label: "Revenue", value: A.money(cur.revenue), sub: "", tone: "blue" },
    { label: "Transactions", value: A.int(cur.count), sub: "", tone: "green" },
    { label: "Average sale", value: A.money(cur.avg), sub: "", tone: "teal" },
    { label: "Units sold", value: A.int(cur.units), sub: "", tone: "navy" },
  ], true);

  // Chart: the next level down, each point opens its own page
  var points = null;
  var chartTitle = "Revenue";
  var tip = null;
  if (kind === "day") {
    chartTitle = "Revenue by hour";
    points = [];
    for (var h = 0; h < 24; h++) points.push({ label: A.hourLabel(h), title: A.hourLabel(h) + " hour", value: 0, href: A.links.time("hour", key + "-" + h) });
    sales.forEach(function (s) { points[new Date(s.at).getHours()].value += S.saleTotal(s); });
    points = points.slice(6, 23);
    A.columns($("trendChart"), points, { height: 220, label: chartTitle, empty: "No sales on this day" });
  } else if (kind === "month") {
    chartTitle = "Revenue by day";
    var days = new Date(n[0], n[1] + 1, 0).getDate();
    points = [];
    for (var d = 1; d <= days; d++) points.push({ label: String(d), title: A.MONTHS[n[1]] + " " + d, value: 0, href: A.links.time("day", n[0] + "-" + n[1] + "-" + d) });
    sales.forEach(function (s) { points[new Date(s.at).getDate() - 1].value += S.saleTotal(s); });
    A.columns($("trendChart"), points, { height: 220, label: chartTitle, empty: "No sales in this month" });
  } else if (inPeriod) {
    chartTitle = kind === "weekday" ? "Revenue on each " + DAYS_LONG[n[0]].slice(0, -1) : "Revenue at " + A.hourLabel(n[0]) + " each day";
    A.line($("trendChart"), A.buckets(period, sales).map(function (x) {
      return { label: x.label, title: x.title, value: x.revenue, href: A.bucketHref(period, x) };
    }), { label: chartTitle, empty: "No sales for this period" });
  } else {
    $("trendPanel").hidden = true; // a single hour: the table below is the detail
  }
  $("trendTitle").textContent = chartTitle;

  var pay = {};
  var sold = {};
  var names = {};
  sales.forEach(function (s) {
    var k = s.payment || "Cash";
    pay[k] = (pay[k] || 0) + S.saleTotal(s);
    s.items.forEach(function (i) {
      sold[i.productId] = (sold[i.productId] || 0) + i.qty * i.price;
      names[i.productId] = i.name;
    });
  });
  A.donut($("payChart"), Object.keys(pay).sort(function (a, b) { return pay[b] - pay[a]; }).map(function (k) {
    return { label: k, value: pay[k], href: A.links.payment(k, inPeriod ? period : "All time") };
  }), { center: A.money(cur.revenue), centerLabel: "Revenue", label: "Revenue by payment method", empty: "No sales in this period" });
  A.bars($("topBars"), Object.keys(sold).sort(function (a, b) { return sold[b] - sold[a]; }).slice(0, 8).map(function (id) {
    return { name: names[id], value: sold[id], href: A.links.product(id, inPeriod ? period : "All time") };
  }), { empty: "No sales in this period" });

  A.txnTable($("txnTable"), A.newest(sales), { empty: "No transactions in this time period", pageSize: 15 });
})();
