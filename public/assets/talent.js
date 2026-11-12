// Talent page: five driver lists over one profile dataset.
"use strict";
renderShell("talent", "Talent");

var STATE = { list: "all", share: 0.05 };
function money(v) {
  if (v == null) return "";
  var a = Math.abs(v);
  return a >= 1e9 ? "$" + (a / 1e9).toFixed(1) + "B" : a >= 1e6 ? "$" + (a / 1e6).toFixed(a >= 1e7 ? 0 : 1) + "M" : "$" + Math.round(a / 1e3) + "K";
}
var LEAD_CLS = { "Verified wealth": "ok", "Strong lead": "info", "Possible lead": "warn", "No lead": "plain" };
var ROUTE = { published_email: "published email", verified_email: "verified email", linkedin: "profile", manager: "via management", none: "no route yet" };

function kpi(n, label, d) {
  return '<div class="kpi"><div class="n num">' + n + '</div><div class="l">' + esc(label) + '</div><div class="d">' + esc(d) + "</div></div>";
}
function render(r) {
  var s = r.summary;
  var lists = r.lists.map(function (l) {
    return '<button class="fchip' + (l.key === r.list ? " on" : "") + '" data-list="' + l.key + '" type="button">' + esc(l.label) + ' <span class="c num">' + l.count + "</span></button>";
  }).join("");
  var shares = r.shares.map(function (x) {
    return '<button class="fchip' + (x === r.share ? " on" : "") + '" data-share="' + x + '" type="button">' + Math.round(x * 100) + "%</button>";
  }).join("");
  var rows = r.rows.map(function (p) {
    var b = p.business;
    var w = p.wealth;
    var wealth = w.kind === "unknown" ? '<span class="mut">unknown</span>'
      : '<span data-tip="' + esc(w.basis) + '" tabindex="0">' + money(w.usd) + "</span> " +
        (w.kind === "verified" ? '<span class="verif">verified</span>' : '<span class="scen">scenario</span>');
    return "<tr><td><b>" + esc(p.driver) + '</b><div class="sm">' + esc(p.driver_type) + "</div></td>" +
      "<td>" + esc(p.discipline) + '<div class="sm">' + esc(p.series) + " &middot; " + esc(p.team) + "</div></td>" +
      "<td>" + esc(p.us_based === null ? "not established" : p.residence_country) + "</td>" +
      "<td>" + chipText(p.lead, LEAD_CLS[p.lead] || "plain", "Confidence: " + p.confidence) + "</td>" +
      "<td>" + esc(p.money_holder) + (b ? '<div class="sm">' + esc(b.name) + ", " + esc(r.industries[b.industry] || b.industry) + "</div>" : "") + "</td>" +
      '<td class="r">' + (b && b.rev ? '<span data-tip="' + esc(b.rev_basis || "") + '" tabindex="0">' + money(b.rev.lo) + "&ndash;" + money(b.rev.hi) + "</span>" : '<span class="mut">none published</span>') + "</td>" +
      '<td class="r">' + wealth + "</td>" +
      "<td>" + chipText(ROUTE[p.route.kind] || p.route.kind, p.route.kind === "none" ? "plain" : "ok", p.route.basis) + "</td></tr>";
  }).join("");
  document.getElementById("root").innerHTML =
    '<div class="kpis k5">' +
    kpi(s.drivers, "Drivers", "in the sample dataset") +
    kpi(s.verified_wealth, "Verified wealth", "sourced figure on record") +
    kpi(s.strong_leads, "Strong leads", "business behind the seat found") +
    kpi(s.named_routes, "Named routes", "professional route to the money") +
    kpi(s.us_based, "US-based", s.residence_open + " with residence not established") + "</div>" +
    '<div class="toolbar"><span class="lbl">List</span><div class="fchips">' + lists + "</div></div>" +
    '<div class="toolbar"><span class="lbl">Racing spend as % of net worth</span><div class="fchips">' + shares + "</div>" +
    '<span class="sub">Implied wealth = run cost / this share. A scenario, not a measurement.</span></div>' +
    '<div class="tablewrap"><table><thead><tr><th>Driver</th><th>Discipline</th><th>Lives in</th><th>Lead</th><th>Money holder</th><th class="r">Company revenue</th><th class="r">Est. net worth</th><th>Route</th></tr></thead><tbody>' +
    rows + "</tbody></table></div>";
}
async function load() {
  var r = await api("/api/profiles?list=" + encodeURIComponent(STATE.list) + "&share=" + STATE.share);
  if (!r.ok) { document.getElementById("root").innerHTML = '<div class="empty">Could not load (' + esc(r.error) + ").</div>"; return; }
  render(r);
}
document.getElementById("root").addEventListener("click", function (e) {
  var l = e.target.closest("[data-list]"), s = e.target.closest("[data-share]");
  if (l) { STATE.list = l.dataset.list; load(); }
  if (s) { STATE.share = Number(s.dataset.share); load(); }
});
load();
