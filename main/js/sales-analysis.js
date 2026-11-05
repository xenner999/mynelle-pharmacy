(function () {
  var A = Analytics;
  var S = MynelleStore;
  var $ = function (id) { return document.getElementById(id); };
  var period = A.initialPeriod("This month");
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  function hourLabel(h) {
    return (h % 12 || 12) + (h >= 12 ? "p" : "a");
  }

  function trendPoints(sales) {
    var start = S.periodStart(period);
    var now = new Date();
    var buckets = [];
    var keyOf;
    var i;
    if (period === "Today") {
      for (i = 0; i <= now.getHours(); i++) {
        buckets.push({ key: i, label: hourLabel(i), title: hourLabel(i) + " hour", value: 0 });
      }
      keyOf = function (d) { return d.getHours(); };
    } else if (period === "This week" || period === "This month") {
      var d = new Date(start);
      while (d <= now) {
        buckets.push({
          key: d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate(),
          label: period === "This week" ? DAYS[d.getDay()] : String(d.getDate()),
          title: DAYS[d.getDay()] + ", " + MONTHS[d.getMonth()] + " " + d.getDate(),
          value: 0,
        });
        d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
      }
      keyOf = function (t) { return t.getFullYear() + "-" + t.getMonth() + "-" + t.getDate(); };
    } else {
      var first = period === "This year" || !sales.length
        ? start
        : new Date(Math.min.apply(null, sales.map(function (s) { return new Date(s.at); })));
      var m = new Date(first.getFullYear(), first.getMonth(), 1);
      while (m <= now) {
        buckets.push({
          key: m.getFullYear() + "-" + m.getMonth(),
          label: MONTHS[m.getMonth()] + (period === "All time" ? " " + String(m.getFullYear()).slice(2) : ""),
          title: MONTHS[m.getMonth()] + " " + m.getFullYear(),
          value: 0,
        });
        m = new Date(m.getFullYear(), m.getMonth() + 1, 1);
      }
      keyOf = function (t) { return t.getFullYear() + "-" + t.getMonth(); };
    }
    var map = {};
    buckets.forEach(function (b) { map[b.key] = b; });
    sales.forEach(function (s) {
      var b = map[keyOf(new Date(s.at))];
      if (b) b.value += S.saleTotal(s);
    });
    return buckets;
  }

  function render() {
    var sales = S.salesIn(period);
    var cur = A.totals(sales);
    var prevR = A.previousRange(period);
    var prev = prevR ? A.totals(A.salesBetween(prevR.from, prevR.to)) : null;
    var vs = A.previousLabel(period);

    A.stats($("summary"), [
      { label: "Revenue", value: A.money(cur.revenue), sub: prev ? A.changeText(cur.revenue, prev.revenue, vs) : "", tone: "blue" },
      { label: "Transactions", value: A.int(cur.count), sub: prev ? A.changeText(cur.count, prev.count, vs) : "", tone: "green" },
      { label: "Average sale", value: A.money(cur.avg), sub: prev ? A.changeText(cur.avg, prev.avg, vs) : "", tone: "teal" },
      { label: "Units sold", value: A.int(cur.units), sub: prev ? A.changeText(cur.units, prev.units, vs) : "", tone: "navy" },
    ], true);

    $("trendTitle").textContent = period === "Today" ? "Revenue by hour" : period === "This year" || period === "All time" ? "Revenue by month" : "Revenue by day";
    A.line($("trendChart"), trendPoints(sales).map(function (b) { b.href = A.bucketHref(period, b); return b; }), { label: "Revenue trend" });

    var hours = [];
    var h;
    for (h = 0; h < 24; h++) hours.push({ label: hourLabel(h), title: hourLabel(h) + " hour", value: 0, href: A.links.time("hourofday", h, period) });
    var week = [1, 2, 3, 4, 5, 6, 0].map(function (d) { return { label: DAYS[d], title: DAYS[d], value: 0, dow: d, href: A.links.time("weekday", d, period) }; });
    var pay = {};
    sales.forEach(function (s) {
      var t = new Date(s.at);
      var total = S.saleTotal(s);
      hours[t.getHours()].value += total;
      week.forEach(function (w) { if (w.dow === t.getDay()) w.value += total; });
      var k = s.payment || "Cash";
      pay[k] = (pay[k] || 0) + total;
    });
    A.columns($("hourChart"), hours, { label: "Revenue by hour of day" });
    A.columns($("weekdayChart"), week, { label: "Revenue by day of week" });

    A.donut($("payChart"), Object.keys(pay).sort(function (a, b) { return pay[b] - pay[a]; }).map(function (k) {
      return { label: k, value: pay[k], href: A.links.payment(k, period) };
    }), { center: A.money(cur.revenue), centerLabel: "Total revenue", label: "Revenue by payment method" });

    var biggest = sales.slice().sort(function (a, b) { return S.saleTotal(b) - S.saleTotal(a); }).slice(0, 25);
    A.table($("bigTable"), [
      { label: "Transaction", render: function (s) { return s.id; } },
      { label: "Items", render: function (s) { return s.items.length + (s.items.length === 1 ? " product" : " products"); }, cls: "muted" },
      { label: "Payment", render: function (s) { return s.payment || "Cash"; }, cls: "muted" },
      { label: "Date and time", render: function (s) { return S.formatDateTime(s.at); }, cls: "muted" },
      { label: "Total", render: function (s) { return A.money(S.saleTotal(s)); }, cls: "num" },
    ], biggest, { empty: "No transactions in this period", rowHref: function (s) { return A.links.transaction(s.id); } });
  }

  A.tabs($("periodTabs"), period, function (p) { period = p; render(); });
  A.onResize(render);
  render();
})();
