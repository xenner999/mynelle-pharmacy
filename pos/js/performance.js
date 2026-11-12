// "My Performance" — a cashier's own numbers, so they can track themselves.
// Only sales recorded under this cashier's account are counted.
(function () {
  "use strict";
  var acct = window.PosSession && window.PosSession.account;
  if (!acct) { window.location.replace("timetracker.html"); return; } // sign in first

  var app = document.getElementById("app");
  var period = "today";
  var GOAL_KEY = "mynelle_perf_goal_" + acct.id;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function money(n) { return MynelleStore.formatCurrency(n); }
  function num(n) { return Number(n).toLocaleString("en-US"); }

  var shift0 = TimeStore.openShift(acct.id);
  var back = document.getElementById("perfBack");
  if (!shift0) {
    back.setAttribute("href", "timetracker.html");
    document.getElementById("perfBackText").textContent = "Time Tracker";
  }

  // ---- data ----
  function mySales() {
    return MynelleStore.getSales().filter(function (s) {
      return s.cashierId ? s.cashierId === acct.id : !!s.cashier && s.cashier === acct.fullName;
    });
  }
  function startOfDay(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }

  function ranges() {
    var now = new Date();
    var today = startOfDay(now);
    if (period === "today") {
      return { from: today, to: addDays(today, 1), prevFrom: addDays(today, -1), prevTo: today,
               label: "Today", prevLabel: "yesterday" };
    }
    if (period === "week") {
      var from = addDays(today, -6);
      return { from: from, to: addDays(today, 1), prevFrom: addDays(from, -7), prevTo: from,
               label: "Last 7 days", prevLabel: "the 7 days before" };
    }
    var m0 = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: m0, to: addDays(today, 1), prevFrom: new Date(now.getFullYear(), now.getMonth() - 1, 1), prevTo: m0,
             label: "This month", prevLabel: "last month" };
  }

  function within(list, from, to) {
    return list.filter(function (s) { var t = new Date(s.at); return t >= from && t < to; });
  }
  function totals(list, from, to) {
    var sales = 0, items = 0;
    list.forEach(function (s) {
      sales += MynelleStore.saleTotal(s);
      s.items.forEach(function (i) { items += Number(i.qty) || 0; });
    });
    var hours = 0;
    TimeStore.logsFor(acct.id, from, to).forEach(function (l) { hours += TimeStore.hoursOf(l); });
    return {
      sales: sales, count: list.length, items: items, hours: hours,
      avg: list.length ? sales / list.length : 0,
      perHour: hours > 0.05 ? sales / hours : 0,
    };
  }
  function delta(cur, prev, label) {
    if (!prev) return '<span class="perf-delta">' + (cur ? "No data " + label : "&nbsp;") + "</span>";
    var pct = ((cur - prev) / prev) * 100;
    var up = pct >= 0;
    return '<span class="perf-delta ' + (up ? "up" : "down") + '">' + (up ? "\u25B2 " : "\u25BC ") +
      Math.abs(pct).toFixed(0) + "% vs " + label + "</span>";
  }

  function chartBars(list, r) {
    var bars = [];
    if (period === "today") {
      for (var h = 6; h <= 22; h++) bars.push({ label: h > 12 ? h - 12 + "p" : h === 12 ? "12p" : h + "a", key: h, v: 0 });
      list.forEach(function (s) {
        var b = bars.filter(function (x) { return x.key === new Date(s.at).getHours(); })[0];
        if (b) b.v += MynelleStore.saleTotal(s);
      });
    } else {
      var days = Math.round((startOfDay(new Date()) - r.from) / 864e5) + 1;
      for (var i = 0; i < days; i++) {
        var d = addDays(r.from, i);
        bars.push({ label: period === "week" ? d.toLocaleDateString("en-US", { weekday: "short" }) : String(d.getDate()),
                    key: d.toDateString(), v: 0 });
      }
      list.forEach(function (s) {
        var b = bars.filter(function (x) { return x.key === new Date(s.at).toDateString(); })[0];
        if (b) b.v += MynelleStore.saleTotal(s);
      });
    }
    var max = Math.max.apply(null, bars.map(function (b) { return b.v; })) || 1;
    return bars.map(function (b) {
      return '<div title="' + esc(b.label + ": " + money(b.v)) + '"><i class="' + (b.v === max && b.v > 0 ? "peak" : "") +
        '" style="height:' + Math.max(2, (b.v / max) * 100) + '%"></i><span>' + esc(b.label) + "</span></div>";
    }).join("");
  }

  // ---- render ----
  function render() {
    var r = ranges();
    var all = mySales();
    var list = within(all, r.from, r.to);
    var cur = totals(list, r.from, r.to);
    var prev = totals(within(all, r.prevFrom, r.prevTo), r.prevFrom, r.prevTo);

    // shift + daily goal (always about today)
    var shift = TimeStore.openShift(acct.id);
    var t0 = startOfDay(new Date());
    var todaySales = totals(within(all, t0, addDays(t0, 1)), t0, addDays(t0, 1)).sales;
    var goal = 0;
    try { goal = Number(localStorage.getItem(GOAL_KEY)) || 0; } catch (e) { /* ignore */ }
    var pct = goal ? Math.min(100, (todaySales / goal) * 100) : 0;
    var shiftHtml = shift
      ? "<b>Checked in</b><span>since " + new Date(shift.in).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) +
        " \u00B7 " + TimeStore.formatHours(TimeStore.hoursOf(shift)) + " on shift</span>"
      : "<b>Not checked in</b><span>Check in at the Time Tracker to start a shift</span>";

    // top items + payments
    var itemMap = {}, payMap = {};
    list.forEach(function (s) {
      s.items.forEach(function (i) {
        var m = itemMap[i.name] || (itemMap[i.name] = { qty: 0, amt: 0 });
        m.qty += Number(i.qty) || 0;
        m.amt += (Number(i.qty) || 0) * (Number(i.price) || 0);
      });
      var p = payMap[s.payment] || (payMap[s.payment] = { count: 0, amt: 0 });
      p.count++;
      p.amt += MynelleStore.saleTotal(s);
    });
    var topItems = Object.keys(itemMap).map(function (k) { return { name: k, qty: itemMap[k].qty, amt: itemMap[k].amt }; })
      .sort(function (a, b) { return b.qty - a.qty; }).slice(0, 5);
    var pays = Object.keys(payMap).map(function (k) { return { name: k, count: payMap[k].count, amt: payMap[k].amt }; })
      .sort(function (a, b) { return b.amt - a.amt; });
    var recent = list.slice().sort(function (a, b) { return new Date(b.at) - new Date(a.at); }).slice(0, 10);

    var tabs = [["today", "Today"], ["week", "Last 7 days"], ["month", "This month"]].map(function (t) {
      return '<button type="button" data-period="' + t[0] + '" class="' + (period === t[0] ? "on" : "") + '">' + t[1] + "</button>";
    }).join("");

    app.innerHTML =
      '<div class="perf-print-head"><b>' + esc("Mynelle's Pharmacy") + " \u2014 My performance</b>" +
      "<div>" + esc(acct.fullName || "") + " \u00B7 " + esc(r.label) + " \u00B7 printed " + esc(new Date().toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })) + "</div></div>" +

      '<div class="perf-top"><div><h2>My performance</h2><p>' + esc(acct.fullName || "") + " \u00B7 only your own sales are counted</p></div>" +
      '<div class="perf-tools"><div class="perf-tabs" role="tablist">' + tabs + "</div>" +
      '<button type="button" class="perf-btn" id="perfPrint" title="Print my performance report"><i class="fi fi-rr-print"></i> Print</button></div></div>' +

      '<div class="card perf-status"><span class="perf-dot ' + (shift ? "live" : "") + '"></span>' +
      '<div class="grow">' + shiftHtml + "</div>" +
      '<div class="perf-goal"><div class="row"><span>Daily goal' + (goal ? "" : " (not set)") + "</span><span>" +
      (goal ? money(todaySales) + " / " + money(goal) : money(todaySales) + " today") + "</span></div>" +
      '<div class="perf-bar"><i class="' + (pct >= 100 ? "done" : "") + '" style="width:' + pct + '%"></i></div>' +
      '<form id="goalForm"><input id="goalInput" data-allow="integer" inputmode="numeric" placeholder="Set a daily goal (\u20B1)" value="' + (goal || "") + '" aria-label="Daily sales goal" />' +
      '<button type="submit" class="perf-btn" title="Save my daily goal">Save</button></form></div></div>' +

      '<div class="perf-kpis">' +
      kpi("My sales", money(cur.sales), delta(cur.sales, prev.sales, r.prevLabel)) +
      kpi("Transactions", num(cur.count), delta(cur.count, prev.count, r.prevLabel)) +
      kpi("Items sold", num(cur.items), delta(cur.items, prev.items, r.prevLabel)) +
      kpi("Average sale", money(cur.avg), delta(cur.avg, prev.avg, r.prevLabel)) +
      kpi("Hours worked", TimeStore.formatHours(cur.hours), delta(cur.hours, prev.hours, r.prevLabel)) +
      kpi("Sales per hour", cur.perHour ? money(cur.perHour) : "\u2014", delta(cur.perHour, prev.perHour, r.prevLabel)) +
      "</div>" +

      '<div class="perf-grid"><div class="card"><h3>' + (period === "today" ? "Sales by hour" : "Sales by day") + "</h3>" +
      (list.length ? '<div class="perf-chart">' + chartBars(list, r) + "</div>" : '<div class="perf-empty">No sales recorded yet for this period.</div>') + "</div>" +

      '<div class="card"><h3>How customers paid</h3>' +
      (pays.length ? '<ul class="perf-list">' + pays.map(function (p) {
        var share = cur.sales ? (p.amt / cur.sales) * 100 : 0;
        return "<li><div><b>" + esc(p.name) + '</b><div class="sub">' + p.count + " sale" + (p.count === 1 ? "" : "s") + '</div></div><div class="bar"><i style="width:' + share + '%"></i></div><b>' + money(p.amt) + "</b></li>";
      }).join("") + "</ul>" : '<div class="perf-empty">Nothing yet.</div>') + "</div></div>" +

      '<div class="perf-grid"><div class="card"><h3>My recent transactions</h3>' +
      (recent.length ? '<table class="perf-table"><thead><tr><th>Receipt</th><th>Time</th><th class="num">Items</th><th>Payment</th><th class="num">Total</th></tr></thead><tbody>' +
        recent.map(function (s) {
          var q = s.items.reduce(function (n, i) { return n + (Number(i.qty) || 0); }, 0);
          var d = new Date(s.at);
          return "<tr><td>" + esc(s.id) + "</td><td>" + esc(d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })) +
            '</td><td class="num">' + q + "</td><td>" + esc(s.payment) + '</td><td class="num">' + money(MynelleStore.saleTotal(s)) + "</td></tr>";
        }).join("") + "</tbody></table>" : '<div class="perf-empty">No transactions in this period.</div>') + "</div>" +

      '<div class="card"><h3>My top items</h3>' +
      (topItems.length ? '<ul class="perf-list">' + topItems.map(function (i) {
        return "<li><div><b>" + esc(i.name) + '</b><div class="sub">' + num(i.qty) + " sold</div></div><b>" + money(i.amt) + "</b></li>";
      }).join("") + "</ul>" : '<div class="perf-empty">Nothing yet.</div>') +
      '<p class="perf-note">Sales made before cashier tracking was added are matched by your name.</p></div></div>';
  }
  function kpi(label, value, deltaHtml) {
    return '<div class="card perf-kpi"><small>' + esc(label) + "</small><strong>" + value + "</strong>" + deltaHtml + "</div>";
  }

  // ---- events (delegated, so re-rendering is safe) ----
  app.addEventListener("click", function (e) {
    var tab = e.target.closest("[data-period]");
    if (tab) { period = tab.getAttribute("data-period"); render(); return; }
    if (e.target.closest("#perfPrint")) window.print();
  });
  app.addEventListener("submit", function (e) {
    if (e.target.id !== "goalForm") return;
    e.preventDefault();
    var v = Number(document.getElementById("goalInput").value) || 0;
    try {
      if (v > 0) localStorage.setItem(GOAL_KEY, String(v));
      else localStorage.removeItem(GOAL_KEY);
    } catch (err) { /* storage unavailable */ }
    render();
  });

  render();
  // keep the shift timer and totals fresh while the page is open
  setInterval(function () {
    var a = document.activeElement;
    if (a && a.tagName === "INPUT") return; // don't interrupt typing a goal
    render();
  }, 30000);
  window.addEventListener("storage", render);
})();
