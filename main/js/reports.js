var trendEl = document.getElementById("trendChart");
var bestEl = document.getElementById("bestChart");
var trendSummary = document.getElementById("trendSummary");

var state = { trend: "This month", best: "This month" };

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  });
}

function emptyMarkup(title) {
  return (
    '<div class="chart-empty">' +
    '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#C7CCE0" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<polyline points="3 17 9 11 13 15 21 6"/><polyline points="14 6 21 6 21 13"/></svg>' +
    '<p class="title">' + title + "</p></div>"
  );
}

function shortMoney(n) {
  var symbol = MynelleStore.getSettings().pricing.currency;
  if (n >= 1000000) return symbol + (n / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1000) return symbol + (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return symbol + Math.round(n);
}

function niceMax(v) {
  if (v <= 0) return 1;
  var pow = Math.pow(10, Math.floor(Math.log10(v)));
  var n = v / pow;
  var step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

// Buckets sales into days (week / month) or months (year).
function buildBuckets(period) {
  var start = MynelleStore.periodStart(period);
  var now = new Date();
  var buckets = [];
  var i;
  if (period === "This year") {
    var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    for (i = 0; i <= now.getMonth(); i++) {
      buckets.push({ key: i, label: months[i], title: months[i] + " " + now.getFullYear(), total: 0 });
    }
  } else {
    var days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    var d = new Date(start);
    while (d <= now) {
      buckets.push({
        key: d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate(),
        label: period === "This week" ? days[d.getDay()] : String(d.getDate()),
        title: days[d.getDay()] + ", " + (d.getMonth() + 1) + "/" + d.getDate(),
        total: 0,
      });
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    }
  }
  var byKey = {};
  buckets.forEach(function (b) {
    byKey[b.key] = b;
  });
  MynelleStore.salesIn(period).forEach(function (s) {
    var t = new Date(s.at);
    var key = period === "This year" ? t.getMonth() : t.getFullYear() + "-" + t.getMonth() + "-" + t.getDate();
    if (byKey[key]) byKey[key].total += MynelleStore.saleTotal(s);
  });
  return buckets;
}

function renderTrend() {
  var sales = MynelleStore.salesIn(state.trend);
  var revenue = sales.reduce(function (sum, s) {
    return sum + MynelleStore.saleTotal(s);
  }, 0);
  trendSummary.innerHTML =
    "<strong>" + esc(MynelleStore.formatCurrency(revenue)) + "</strong> from " +
    sales.length + (sales.length === 1 ? " transaction" : " transactions");

  if (sales.length === 0) {
    trendEl.innerHTML = emptyMarkup("No sales in this period");
    return;
  }

  var buckets = buildBuckets(state.trend);
  var W = trendEl.clientWidth || 640;
  var H = 260;
  var m = { l: 52, r: 14, t: 14, b: 30 };
  var iw = W - m.l - m.r;
  var ih = H - m.t - m.b;
  var max = niceMax(
    buckets.reduce(function (a, b) {
      return Math.max(a, b.total);
    }, 0)
  );

  function x(i) {
    return buckets.length === 1 ? m.l + iw / 2 : m.l + (i / (buckets.length - 1)) * iw;
  }
  function y(v) {
    return m.t + ih - (v / max) * ih;
  }

  var svg = '<svg class="trend-svg" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Sales trend">';
  var t;
  for (t = 0; t <= 4; t++) {
    var val = (max / 4) * t;
    svg +=
      '<line class="trend-grid" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + y(val) + '" y2="' + y(val) + '"/>' +
      '<text class="trend-axis" x="' + (m.l - 8) + '" y="' + (y(val) + 4) + '" text-anchor="end">' +
      esc(shortMoney(val)) + "</text>";
  }

  var every = Math.ceil(buckets.length / Math.max(2, Math.floor(iw / 44)));
  buckets.forEach(function (b, i) {
    if (i % every !== 0 && i !== buckets.length - 1) return;
    svg +=
      '<text class="trend-axis" x="' + x(i) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(b.label) + "</text>";
  });

  var pts = buckets.map(function (b, i) {
    return x(i) + "," + y(b.total);
  });
  if (buckets.length > 1) {
    svg +=
      '<polygon class="trend-area" points="' + x(0) + "," + y(0) + " " + pts.join(" ") + " " + x(buckets.length - 1) + "," + y(0) + '"/>' +
      '<polyline class="trend-line" points="' + pts.join(" ") + '"/>';
  }
  var showDots = buckets.length <= 31;
  buckets.forEach(function (b, i) {
    var tip = "<title>" + esc(b.title + ": " + MynelleStore.formatCurrency(b.total)) + "</title>";
    if (showDots) {
      svg += '<circle class="trend-dot" cx="' + x(i) + '" cy="' + y(b.total) + '" r="3.5">' + tip + "</circle>";
    } else {
      svg += '<circle class="trend-hit" cx="' + x(i) + '" cy="' + y(b.total) + '" r="6">' + tip + "</circle>";
    }
  });
  svg += "</svg>";
  trendEl.innerHTML = svg;
}

function renderBest() {
  var totals = {};
  MynelleStore.salesIn(state.best).forEach(function (s) {
    s.items.forEach(function (i) {
      var row = totals[i.productId] || (totals[i.productId] = { name: i.name, units: 0, revenue: 0 });
      row.units += i.qty;
      row.revenue += i.qty * i.price;
    });
  });
  var products = MynelleStore.getProducts();
  var unitOf = {};
  products.forEach(function (p) {
    unitOf[p.id] = p.unit;
  });

  var ranked = Object.keys(totals)
    .map(function (id) {
      var r = totals[id];
      r.id = id;
      return r;
    })
    .sort(function (a, b) {
      return b.revenue - a.revenue;
    })
    .slice(0, 8);

  if (ranked.length === 0) {
    bestEl.innerHTML = emptyMarkup("No product sales in this period");
    return;
  }

  var top = ranked[0].revenue || 1;
  bestEl.innerHTML =
    '<div class="bar-list">' +
    ranked
      .map(function (r) {
        return (
          '<div class="bar-row">' +
          '<div class="bar-name"><span class="name" title="' + esc(r.name) + '">' + esc(r.name) + "</span>" +
          '<span class="units">' + esc(MynelleStore.formatQty(r.units, unitOf[r.id])) + " sold</span></div>" +
          '<div class="bar-track"><span class="bar-fill" style="width:' + ((r.revenue / top) * 100).toFixed(1) + '%"></span></div>' +
          '<div class="bar-value">' + esc(MynelleStore.formatCurrency(r.revenue)) + "</div>" +
          "</div>"
        );
      })
      .join("") +
    "</div>";
}

document.querySelectorAll("[data-select]").forEach(function (wrap) {
  var toggle = wrap.querySelector("[data-toggle]");
  var menu = wrap.querySelector("[data-menu]");
  var label = wrap.querySelector("[data-label]");
  var isTrend = !!wrap.closest(".panel").querySelector("#trendChart");

  toggle.addEventListener("click", function () {
    var willOpen = !menu.classList.contains("open");
    document.querySelectorAll("[data-menu]").forEach(function (m) {
      m.classList.remove("open");
    });
    if (willOpen) menu.classList.add("open");
  });

  menu.addEventListener("click", function (e) {
    var btn = e.target.closest("button");
    if (!btn) return;
    label.textContent = btn.dataset.period;
    menu.querySelectorAll("button").forEach(function (el) {
      el.classList.remove("selected");
    });
    btn.classList.add("selected");
    menu.classList.remove("open");
    if (isTrend) {
      state.trend = btn.dataset.period;
      renderTrend();
    } else {
      state.best = btn.dataset.period;
      renderBest();
    }
  });
});

document.addEventListener("click", function (e) {
  document.querySelectorAll("[data-select]").forEach(function (wrap) {
    if (!wrap.contains(e.target)) {
      var menu = wrap.querySelector("[data-menu]");
      if (menu) menu.classList.remove("open");
    }
  });
});

var resizeTimer = null;
window.addEventListener("resize", function () {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(renderTrend, 150);
});

window.addEventListener("storage", function (e) {
  if (e.key === MynelleStore.SALES_KEY || e.key === MynelleStore.PRODUCTS_KEY) {
    renderTrend();
    renderBest();
  }
});

renderTrend();
renderBest();
