// Targets page: gated and scored outside companies.
"use strict";
renderShell("targets", "Targets");

var GATE_TIPS = {
  authority: "One person can decide alone",
  budget: "A budget line already exists",
  us_activation: "A US surface to use what the car offers",
  compliance: "Can legally operate and promote in the US",
};
var AXIS_TIPS = ["Proven sport spend", "US intent", "Budget capacity", "US viability", "Timing"];
var AXES = ["proven_sport_spend", "us_intent", "budget_capacity", "us_viability", "timing"];

function gates(c) {
  return Object.keys(GATE_TIPS).map(function (k) {
    return '<span class="gate ' + c.gates[k] + '" data-tip="' + esc(GATE_TIPS[k] + ": " + c.gates[k]) + '" tabindex="0"></span>';
  }).join("");
}
function axes(c) {
  return '<span class="axes">' + AXES.map(function (k, i) {
    return '<i data-tip="' + esc(AXIS_TIPS[i] + ": " + c.axes[k] + " of 3") + '" tabindex="0">' + c.axes[k] + "</i>";
  }).join("") + "</span>";
}
async function load() {
  var r = await api("/api/targets");
  if (!r.ok) { document.getElementById("root").innerHTML = '<div class="empty">Could not load (' + esc(r.error) + ").</div>"; return; }
  var rows = r.companies.map(function (c, i) {
    var tierCls = c.tier === "A" ? "ok" : c.tier === "B" ? "info" : "plain";
    return "<tr><td class=\"num\">" + (i + 1) + "</td><td><b>" + esc(c.name) + '</b><div class="sm">' + esc(c.vertical) + "</div>" +
      '<div class="sm">' + esc(c.signal) + "</div></td>" +
      "<td>" + gates(c) + (c.failed_gates.length ? '<div class="sm">fails: ' + esc(c.failed_gates.join(", ").replace(/_/g, " ")) + "</div>" : "") + "</td>" +
      "<td>" + axes(c) + "</td>" +
      '<td class="r num"><b>' + c.score + "</b>/15</td>" +
      "<td>" + chipText("tier " + c.tier, tierCls, c.status === "watchlist" ? "On the watchlist: US viability too low to pitch." : "") + "</td>" +
      '<td class="r num">' + c.rank_value + "</td>" +
      '<td class="r num">' + c.sendable + " / " + c.people +
      (c.quarantined ? '<div class="sm">' + c.quarantined + " quarantined</div>" : "") + "</td></tr>";
  }).join("");
  document.getElementById("root").innerHTML =
    '<div class="toolbar"><span class="lbl">Gates</span><span class="sub">' +
    '<span class="gate pass"></span>pass <span class="gate partial"></span>partial (x0.5) <span class="gate fail"></span>fail (x0). ' +
    "Rank = gate product x score.</span></div>" +
    '<div class="tablewrap"><table><thead><tr><th>#</th><th>Company</th><th>Gates</th><th>Five axes</th><th class="r">Score</th><th>Tier</th><th class="r">Rank</th><th class="r">Sendable / people</th></tr></thead><tbody>' +
    rows + "</tbody></table></div>";
}
load();
