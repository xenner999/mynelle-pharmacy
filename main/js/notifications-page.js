document.getElementById("sideNav").addEventListener("click", function (e) {
  var btn = e.target.closest(".nav-item");
  if (!btn || btn.tagName === "A") return;
  document.querySelectorAll(".nav-item").forEach(function (el) {
    el.classList.remove("active");
  });
  btn.classList.add("active");
});

var toastEl = document.getElementById("toast");
var toastTimer = null;
function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(function () {
    toastEl.classList.remove("show");
  }, 2400);
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  });
}

var ICONS = {
  out: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  low: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>',
  expiring: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
};
var ICON_CHECK =
  '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.5"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/></svg>';

var TYPE_LABEL = { out: "Out of stock", low: "Low stock", expiring: "Expiring soon" };
var TYPE_TONE = { out: "tone-out", low: "tone-low", expiring: "tone-expiring" };
var TIER_CLASS = {
  Critical: "tier-critical",
  High: "tier-high",
  Medium: "tier-medium",
  Watch: "tier-watch",
};
var TIER_TONE = {
  Critical: "tone-critical",
  High: "tone-high",
  Medium: "tone-medium",
  Watch: "tone-watch",
};

var state = { filter: "all", showDismissed: false };

var elStatActive = document.getElementById("statActive");
var elStatCritical = document.getElementById("statCritical");
var elStatExpWeek = document.getElementById("statExpiringWeek");
var elStatCategories = document.getElementById("statCategories");
var elDonut = document.getElementById("typeDonutWrap");
var elLegend = document.getElementById("typeLegend");
var elPriorityBars = document.getElementById("priorityBars");
var elTimelineBars = document.getElementById("timelineBars");
var elTableWrap = document.getElementById("alertTableWrap");
var filterTabsEl = document.getElementById("filterTabs");
var showDismissedEl = document.getElementById("showDismissed");
var dismissAllBtn = document.getElementById("dismissAllBtn");

function barRow(label, count, total, toneClass) {
  var pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    '<div class="metric-bar-row">' +
    '<div class="metric-bar-label"><span class="dot ' +
    toneClass +
    '"></span>' +
    esc(label) +
    "</div>" +
    '<div class="metric-bar-track"><div class="metric-bar-fill ' +
    toneClass +
    '" style="width:' +
    Math.max(pct, count > 0 ? 4 : 0) +
    '%"></div></div>' +
    '<div class="metric-bar-count">' +
    count +
    "</div>" +
    "</div>"
  );
}

function renderDonut(counts, total) {
  if (total === 0) {
    elDonut.innerHTML =
      '<svg viewBox="0 0 132 132"><circle cx="66" cy="66" r="52" fill="none" stroke="var(--bg)" stroke-width="16" /></svg>';
    elLegend.innerHTML =
      '<div class="legend-row"><span class="legend-label">No active alerts to break down.</span></div>';
    return;
  }
  var r = 52;
  var c = 2 * Math.PI * r;
  var segments = [
    { key: "out", color: "#b3323f", value: counts.out },
    { key: "low", color: "#b4740e", value: counts.low },
    { key: "expiring", color: "#1b2447", value: counts.expiring },
  ];
  var offset = 0;
  var circles = segments
    .map(function (seg) {
      if (seg.value <= 0) return "";
      var len = (seg.value / total) * c;
      var circle =
        '<circle cx="66" cy="66" r="' +
        r +
        '" fill="none" stroke="' +
        seg.color +
        '" stroke-width="16" stroke-dasharray="' +
        len +
        " " +
        (c - len) +
        '" stroke-dashoffset="' +
        -offset +
        '" transform="rotate(-90 66 66)" />';
      offset += len;
      return circle;
    })
    .join("");

  elDonut.innerHTML =
    '<svg viewBox="0 0 132 132">' +
    '<circle cx="66" cy="66" r="' +
    r +
    '" fill="none" stroke="var(--bg)" stroke-width="16" />' +
    circles +
    '<text x="66" y="61" text-anchor="middle" font-size="22" font-weight="700" fill="var(--text)">' +
    total +
    "</text>" +
    '<text x="66" y="79" text-anchor="middle" font-size="9.5" fill="var(--text-muted)">active</text>' +
    "</svg>";

  elLegend.innerHTML = segments
    .map(function (seg) {
      return (
        '<div class="legend-row"><span class="dot" style="background:' +
        seg.color +
        '"></span><span class="legend-label">' +
        TYPE_LABEL[seg.key] +
        '</span><span class="legend-count">' +
        seg.value +
        "</span></div>"
      );
    })
    .join("");
}

function renderAlertRow(a) {
  var canRestore = a.dismissed;
  return (
    '<div class="alert-row' +
    (a.dismissed ? " is-dismissed" : "") +
    '" data-key="' +
    esc(a.key) +
    '">' +
    '<span class="alert-type-icon ' +
    TYPE_TONE[a.type] +
    '">' +
    ICONS[a.type] +
    "</span>" +
    '<span class="alert-product"><span class="name">' +
    esc(a.product.name) +
    '</span><span class="sub">' +
    esc(a.title) +
    "</span></span>" +
    '<span class="alert-category">' +
    esc(a.product.category || "\u2014") +
    "</span>" +
    '<span class="alert-detail">' +
    esc(a.detail) +
    "</span>" +
    '<span class="priority-cell"><span class="tier-badge ' +
    TIER_CLASS[a.tier] +
    '">' +
    a.tier +
    '</span><span class="priority-score">' +
    a.score +
    "</span></span>" +
    '<span class="alert-actions">' +
    '<a class="alert-action-btn" href="inventory.html">View</a>' +
    (canRestore
      ? '<button class="alert-action-btn restore" type="button" data-action="restore">Restore</button>'
      : '<button class="alert-action-btn" type="button" data-action="dismiss">Dismiss</button>') +
    "</span>" +
    "</div>"
  );
}

function render() {
  var active = MynelleAlerts.build();
  var totalActive = active.length;

  // ---- Stat cards ----
  elStatActive.textContent = String(totalActive);
  elStatCritical.textContent = String(
    active.filter(function (a) {
      return a.tier === "Critical";
    }).length
  );
  elStatExpWeek.textContent = String(
    active.filter(function (a) {
      return a.type === "expiring" && a.daysLeft <= 7;
    }).length
  );
  var categories = {};
  active.forEach(function (a) {
    if (a.product.category) categories[a.product.category] = true;
  });
  elStatCategories.textContent = String(Object.keys(categories).length);

  // ---- Donut: breakdown by type ----
  var counts = { out: 0, low: 0, expiring: 0 };
  active.forEach(function (a) {
    counts[a.type]++;
  });
  renderDonut(counts, totalActive);

  // ---- Priority distribution ----
  var tiers = ["Critical", "High", "Medium", "Watch"];
  var tierCounts = {};
  tiers.forEach(function (t) {
    tierCounts[t] = 0;
  });
  active.forEach(function (a) {
    tierCounts[a.tier]++;
  });
  if (totalActive === 0) {
    elPriorityBars.innerHTML =
      '<p class="section-sub" style="margin:8px 4px;">Nothing to score right now.</p>';
  } else {
    elPriorityBars.innerHTML = tiers
      .map(function (t) {
        return barRow(t, tierCounts[t], totalActive, TIER_TONE[t]);
      })
      .join("");
  }

  // ---- Expiry timeline ----
  var buckets = [
    { label: "0\u20133 days", test: function (d) { return d <= 3; } },
    { label: "4\u20137 days", test: function (d) { return d >= 4 && d <= 7; } },
    { label: "8\u201314 days", test: function (d) { return d >= 8 && d <= 14; } },
    { label: "15+ days", test: function (d) { return d >= 15; } },
  ];
  var expiring = active.filter(function (a) {
    return a.type === "expiring";
  });
  if (expiring.length === 0) {
    elTimelineBars.innerHTML =
      '<p class="section-sub" style="margin:8px 4px;">No products in the expiry window right now.</p>';
  } else {
    elTimelineBars.innerHTML = buckets
      .map(function (b) {
        var count = expiring.filter(function (a) {
          return b.test(a.daysLeft);
        }).length;
        return barRow(b.label, count, expiring.length, "tone-expiring");
      })
      .join("");
  }

  // ---- Table ----
  var rows = MynelleAlerts.build({ includeDismissed: state.showDismissed });
  if (state.filter !== "all") {
    rows = rows.filter(function (a) {
      return a.type === state.filter;
    });
  }

  if (rows.length === 0) {
    elTableWrap.innerHTML =
      '<div class="notif-table-empty">' +
      ICON_CHECK +
      "<p>Nothing here</p>" +
      '<p class="sub">' +
      (state.showDismissed
        ? "No notifications match this filter."
        : "You're all caught up for this filter.") +
      "</p>" +
      "</div>";
  } else {
    elTableWrap.innerHTML = rows.map(renderAlertRow).join("");
  }
}

filterTabsEl.addEventListener("click", function (e) {
  var btn = e.target.closest(".filter-tab");
  if (!btn) return;
  filterTabsEl.querySelectorAll(".filter-tab").forEach(function (el) {
    el.classList.remove("active");
  });
  btn.classList.add("active");
  state.filter = btn.dataset.filter;
  render();
});

showDismissedEl.addEventListener("change", function () {
  state.showDismissed = showDismissedEl.checked;
  render();
});

elTableWrap.addEventListener("click", function (e) {
  var btn = e.target.closest("[data-action]");
  if (!btn) return;
  var row = btn.closest(".alert-row");
  var key = row.dataset.key;
  if (btn.dataset.action === "dismiss") {
    MynelleAlerts.dismiss(key);
    showToast("Notification dismissed");
  } else if (btn.dataset.action === "restore") {
    MynelleAlerts.undismiss(key);
    showToast("Notification restored");
  }
  render();
});

dismissAllBtn.addEventListener("click", function () {
  var rows = MynelleAlerts.build();
  if (state.filter !== "all") {
    rows = rows.filter(function (a) {
      return a.type === state.filter;
    });
  }
  if (rows.length === 0) {
    showToast("Nothing to dismiss");
    return;
  }
  rows.forEach(function (a) {
    MynelleAlerts.dismiss(a.key);
  });
  showToast(
    rows.length === 1 ? "1 notification dismissed" : rows.length + " notifications dismissed"
  );
  render();
});

document.addEventListener("mynelle:products-changed", render);
window.addEventListener("storage", function (e) {
  if (
    e.key === MynelleStore.PRODUCTS_KEY ||
    e.key === MynelleStore.SETTINGS_KEY ||
    e.key === MynelleAlerts.DISMISSED_KEY
  ) {
    render();
  }
});

render();
