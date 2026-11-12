// Deals page: inside deals, ranked.
"use strict";
renderShell("deals", "Deals");

var RATE = null;
function money(v) {
  var a = Math.abs(v), s = v < 0 ? "-" : "";
  return a >= 1e6 ? s + "$" + (a / 1e6).toFixed(1) + "M" : s + "$" + Math.round(a / 1e3) + "K";
}
function party(r, id, role) {
  var p = r.parties[id] || { name: id, industry: "", drivers: [] };
  return "<b>" + esc(p.name) + "</b> <span class=\"sub\">(" + esc(role) + ", " + esc(p.industry) +
    (p.drivers.length ? "; seat: " + esc(p.drivers.join(", ")) : "") + ")</span>";
}
function render(r) {
  var rates = r.rates.map(function (x) {
    return '<button class="fchip' + (x === r.rate ? " on" : "") + '" data-rate="' + x + '" type="button">' + Math.round(x * 100) + "%</button>";
  }).join("");
  var cards = r.deals.map(function (d) {
    var parties = d.parties.map(function (id, i) { return party(r, id, d.roles[i]); }).join(" + ");
    return '<div class="card deal"><div class="t">' + esc(d.label) + " " +
      chipText(d.kind === "loop" ? "pooled program" : "pair", d.kind === "loop" ? "info" : "plain",
        d.kind === "loop" ? "A series partner sells to several family businesses on pooled terms." : "One business in the paddock sells to another.") + "</div>" +
      '<div class="parties">' + parties + "</div>" +
      '<div class="nums"><span>Annual value <b>' + money(d.annual.low) + " / " + money(d.annual.base) + " / " + money(d.annual.high) + "</b> (low / base / high)</span>" +
      "<span>NPV base <b>" + money(d.npv.base) + "</b></span>" +
      "<span>Buyer spend <b>" + money(d.spend) + "</b></span>" +
      "<span>Effort <b>" + d.effort + "</b></span>" +
      '<span data-tip="Share of the parties with a filed or company-reported revenue figure behind the sizing." tabindex="0">Evidence <b>' + d.evidence + "</b></span>" +
      (d.geo_mult < 1 ? "<span>Cross-border <b>x" + d.geo_mult + "</b></span>" : "") + "</div></div>";
  }).join("");
  document.getElementById("root").innerHTML =
    '<div class="toolbar"><span class="lbl">Discount rate</span><div class="fchips">' + rates + "</div>" +
    '<span class="sub">' + r.total + " candidate deals; top " + r.deals.length + " shown. Five-year ramp " +
    esc(r.model.ramp.join(" / ")) + ", setup " + money(r.model.setup_per_effort) + " per unit of effort.</span></div>" + cards;
}
async function load() {
  var r = await api("/api/deals" + (RATE ? "?rate=" + RATE : ""));
  if (!r.ok) { document.getElementById("root").innerHTML = '<div class="empty">Could not load (' + esc(r.error) + ").</div>"; return; }
  render(r);
}
document.getElementById("root").addEventListener("click", function (e) {
  var b = e.target.closest("[data-rate]");
  if (b) { RATE = Number(b.dataset.rate); load(); }
});
load();
