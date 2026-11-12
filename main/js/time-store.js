// Attendance (check in / check out) shared by the POS Time Tracker and the
// Manage accounts page. One record per shift:
//   { id, empId, name, in: ISO, out: ISO | null }
// Swap the get/save functions for API calls when a backend is added.
var TimeStore = (function () {
  var LOG_KEY = "mynelle_timelogs";
  var PAY_KEY = "mynelle_pay_settings";
  var HOUR = 36e5;

  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      /* storage unavailable */
    }
  }

  function getLogs() {
    var list = read(LOG_KEY, []);
    return Array.isArray(list) ? list : [];
  }

  function openShift(empId) {
    return getLogs().filter(function (l) {
      return l.empId === empId && !l.out;
    })[0] || null;
  }

  function checkIn(emp) {
    var existing = openShift(emp.id);
    if (existing) return existing;
    var list = getLogs();
    var log = {
      id: "TL-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
      empId: emp.id,
      name: emp.name,
      in: new Date().toISOString(),
      out: null,
    };
    list.push(log);
    write(LOG_KEY, list);
    return log;
  }

  function checkOut(empId) {
    var list = getLogs();
    var log = list.filter(function (l) {
      return l.empId === empId && !l.out;
    })[0];
    if (!log) return null;
    log.out = new Date().toISOString();
    write(LOG_KEY, list);
    return log;
  }

  function hoursOf(log) {
    var end = log.out ? new Date(log.out) : new Date();
    return Math.max(0, (end - new Date(log.in)) / HOUR);
  }

  function logsFor(empId, from, to) {
    return getLogs()
      .filter(function (l) {
        if (empId && l.empId !== empId) return false;
        var t = new Date(l.in).getTime();
        return (!from || t >= from.getTime()) && (!to || t <= to.getTime());
      })
      .sort(function (a, b) {
        return new Date(b.in) - new Date(a.in);
      });
  }

  // ---- pay rules (editable on the Manage accounts page) ----
  function getPaySettings() {
    var s = read(PAY_KEY, {}) || {};
    return {
      regularHours: Number(s.regularHours) > 0 ? Number(s.regularHours) : 8,
      otMultiplier: Number(s.otMultiplier) >= 1 ? Number(s.otMultiplier) : 1.25,
    };
  }
  function savePaySettings(s) {
    write(PAY_KEY, { regularHours: Number(s.regularHours), otMultiplier: Number(s.otMultiplier) });
  }

  function dayKey(iso) {
    var d = new Date(iso);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  // Pay for one employee from finished shifts. Hours are grouped per day:
  // up to regularHours is regular pay, anything beyond is overtime.
  function computePay(logs, rate, settings) {
    settings = settings || getPaySettings();
    rate = Number(rate) || 0;
    var days = {};
    logs.forEach(function (l) {
      if (!l.out) return; // unfinished shifts aren't paid until checked out
      var k = dayKey(l.in);
      days[k] = (days[k] || 0) + hoursOf(l);
    });
    var regular = 0;
    var ot = 0;
    Object.keys(days).forEach(function (k) {
      regular += Math.min(days[k], settings.regularHours);
      ot += Math.max(0, days[k] - settings.regularHours);
    });
    var regularPay = regular * rate;
    var otPay = ot * rate * settings.otMultiplier;
    return {
      days: Object.keys(days).length,
      hours: regular + ot,
      regularHours: regular,
      otHours: ot,
      rate: rate,
      regularPay: regularPay,
      otPay: otPay,
      gross: regularPay + otPay,
    };
  }

  function formatHours(h) {
    var m = Math.round(h * 60);
    return Math.floor(m / 60) + "h " + (m % 60) + "m";
  }

  return {
    LOG_KEY: LOG_KEY,
    PAY_KEY: PAY_KEY,
    getLogs: getLogs,
    openShift: openShift,
    checkIn: checkIn,
    checkOut: checkOut,
    hoursOf: hoursOf,
    logsFor: logsFor,
    getPaySettings: getPaySettings,
    savePaySettings: savePaySettings,
    computePay: computePay,
    formatHours: formatHours,
  };
})();
