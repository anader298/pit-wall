// Pit Wall dashboard (slice 2). Kept compact: 50KB CSS+JS per-page budget.
"use strict";
renderShell("dashboard", "Dashboard");
var DKT = "DKIM is a DNS record that signs outgoing mail; DMARC tells inboxes what to do when a message fails that check. Without both, warmup mail would land in spam.";
var NLT = "No saved mailbox login, so the site cannot use this account yet.";
var RUNS = [[13, 17], [18, 43]]; // daily warmup cron times, UTC
var lastData = null, lU = 0, lg = false, fL = false;
var OFF = "This account is disabled and will not send anything.";
var IDLE = "Not scheduled for warmup or sending right now.";
var RETRY = "update failed, will retry";
var RE = '<span class="mut">Re:</span> ';
function sw(c, t) { return '<span class="k"><span class="sw" style="background:' + c + '"></span>' + t + "</span>"; }
function lo(x) { return String(x).toLowerCase(); }
function dnsHeld(a) { return a.dkim_state !== "live" || !a.dmarc_state || a.dmarc_state === "missing"; }
function isForeign(a) { return /not ours to fix/i.test(a.notes || ""); }
function el(id) { return document.getElementById(id); }
function pTs(ts) {
if (!ts) return null;
var s = String(ts).replace(" ", "T").replace(/\.(\d{1,3})\d*/, ".$1").replace(/([+-]\d{2})$/, "$1:00");
var d = new Date(s);
return Number.isNaN(d.getTime()) ? null : d;
}
function hm(d) { return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }); }
function fTm(ts) {
var d = pTs(ts);
return d ? hm(d) : String(ts).slice(11, 16);
}
function sNm(email) {
var at = String(email).indexOf("@");
if (at < 0) return String(email);
var dom = String(email).slice(at + 1);
return dom.toLowerCase() === "gmail.com" ? String(email).slice(0, at) : dom.split(".")[0];
}
function shn(text, accounts) {
var out = String(text == null ? "" : text);
accounts.forEach(function (a) {
out = out.replace(new RegExp(lo(a.email).replace(/[.+]/g, "\\$&"), "gi"), sNm(a.email));
});
return out;
}
function nRun() {
var n = new Date(), t = null;
for (var i = 0; i < RUNS.length && !t; i++) {
var c = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate(), RUNS[i][0], RUNS[i][1]));
if (c > n) t = c;
}
if (!t) t = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1, RUNS[0][0], RUNS[0][1]));
return hm(t);
}
// Dismissed alerts live in this array and nowhere else: no storage, no cookie,
// no database. It dies with the page, so any problem that is still true comes
// back on the next load. A banner only stops appearing once it is really fixed.
var DISMISSED = [];
function bAl(d) {
var list = [];
d.accounts.forEach(function (a) {
if (a.no_creds) {
list.push({ key: "creds:" + lo(a.email), cls: a.warmup.required ? "crit" : "", icon: "&#9888;&#65039;",
html: "<b>" + esc(a.email) + "</b> is not signed in: the site has no saved login for this mailbox. Connect it and it joins the rotation by itself." });
}
if (a.warmup.required && a.warmup.not_started && !a.no_creds && dnsHeld(a)) {
list.push({ key: "dns:" + lo(a.domain), cls: "", icon: "&#128295;",
html: "<b>" + esc(a.domain) + "</b> is waiting on DNS: the two records that prove mail really comes from the domain (" + '<span data-tip="' + esc(DKT) + '" tabindex="0"><u>DKIM and DMARC</u></span>) ' +
(isForeign(a) ? "are missing, and it is not our domain to fix. It stays paused."
: "are missing. Warmup stays paused until they are added at the domain's DNS host, then it starts by itself. No click needed.") });
}
});
(d.warm_idle || []).forEach(function (email) {
list.push({ key: "idle:" + lo(email), cls: "", icon: "&#127937;",
html: "<b>" + esc(email) + "</b> finished warmup but its volume ramp-up has not been started. Starting it is a person's decision." });
});
if (d.web_owns_graph_tokens) {
list.push({ key: "tokens", cls: "green", icon: "&#128273;",
html: "Microsoft 365 logins are managed by this site." });
}
return list;
}
function renderAlerts(d) {
var list = bAl(d).filter(function (a) { return DISMISSED.indexOf(a.key) === -1; });
el("alerts").hidden = list.length === 0;
el("alerts").innerHTML = list.map(function (a) {
return '<div class="alert' + (a.cls ? " " + a.cls : "") + '"><span>' + a.icon + "</span><span>" + a.html +
'</span><button class="x" type="button" aria-label="Dismiss for now" title="Dismiss for now" data-k="' +
esc(a.key) + '">&times;</button></div>';
}).join("");
}
el("alerts").addEventListener("click", function (ev) {
var b = ev.target && ev.target.closest ? ev.target.closest("button.x") : null;
var k = b && b.getAttribute("data-k");
if (k) {
if (DISMISSED.indexOf(k) === -1) DISMISSED.push(k);
if (lastData) renderAlerts(lastData);
}
});
function kpi(href, n, of, label, d, arrow) {
return '<a class="kpi" href="' + href + '"><div class="n num">' + n +
(of ? '<span class="of"> / ' + of + "</span>" : "") + '</div><div class="l">' + label +
'</div><div class="d">' + d + "</div>" + (arrow ? '<span class="arrow">&#8250;</span>' : "") + "</a>";
}
function rKp(d) {
var t = d.totals, sends = 0, target = 0, replies = 0;
d.accounts.forEach(function (a) {
sends += a.warmup.sends_today || 0; target += a.warmup.target_today || 0; replies += a.warmup.replies_today || 0;
});
el("kpis").innerHTML =
kpi("/contacts.html", t.sendable, t.contacts, "Ready to email", "verified addresses, cleared to contact", 1) +
kpi("/queue.html", t.drafts_waiting, "", "Drafts waiting", t.drafts_waiting ? "open the queue to review them" : "the review queue is clear", 1) +
kpi("#warmup", sends, target ? target : "", "Warmup sends today", "next automatic run " + esc(nRun()), 0) +
kpi("#warmup", replies, "", "Warmup replies today", "between our own accounts", 0);
}
function rCh(d) {
var warming = d.accounts.filter(function (a) {
var w = a.warmup;
return w.required && !w.not_started && !w.complete && !a.no_creds && a.enabled;
});
var day = 0, days = 0;
warming.forEach(function (a) {
if (a.warmup.day > day) day = a.warmup.day;
if (a.warmup.days > days) days = a.warmup.days;
});
el("warmupSub").textContent = warming.length
? "day " + day + " of " + days + " · " + warming.length + (warming.length === 1 ? " account warming" : " accounts warming")
: "not running yet";
var bD = {};
(d.warmup_log || []).forEach(function (r) {
var k = String(r.log_date);
if (!bD[k]) bD[k] = { s: 0, r: 0 };
bD[k].s += Number(r.sends) || 0;
bD[k].r += Number(r.replies_received) || 0;
});
var dts = Object.keys(bD).sort().slice(-14);
if (!dts.length) {
el("warmupChart").innerHTML = '<div class="panel chart"><div class="ec">No warmup activity yet. The next automatic run charts here.</div></div>';
return;
}
var max = 1;
dts.forEach(function (k) { max = Math.max(max, bD[k].s, bD[k].r); });
var pkD = dts.reduce(function (b, k) { return bD[k].s > bD[b].s ? k : b; }, dts[0]);
var cols = "", xlabels = "";
dts.forEach(function (k) {
var v = bD[k], iT = k === String(d.today);
var title = (iT ? "Today" : fmtDate(k)) + ": " + v.s + (v.s === 1 ? " send, " : " sends, ") + v.r + (v.r === 1 ? " reply" : " replies");
var peak = v.s > 0 && (k === pkD || iT) ? '<span class="pk num">' + v.s + "</span>" : "";
cols += '<div class="colgrp" title="' + esc(title) + '">' + peak +
'<i class="a" style="height:' + Math.round(v.s / max * 100) + '%"></i>' +
'<i class="b" style="height:' + Math.round(v.r / max * 100) + '%"></i></div>';
xlabels += "<span>" + (iT ? "today" : Number(k.slice(8, 10))) + "</span>";
});
el("warmupChart").innerHTML = '<div class="panel chart">' +
'<div class="cols" role="img" aria-label="Warmup sends and replies per day, peak ' + max + '">' + cols + "</div>" +
'<div class="xlabels">' + xlabels + "</div><div class=\"legend\">" +
sw("var(--s1)", "Sends") + sw("var(--s2)", "Replies received") +
'<span class="k dim">all warming accounts, last ' + dts.length + (dts.length === 1 ? " day" : " days") + "</span></div></div>";
}
function dChip(a) {
if (lo(a.domain) === "gmail.com") return "";
return '<span class="mla">' + (dnsHeld(a)
? chipText("waiting on DNS", "bad", "Paused until the domain's DKIM and DMARC records are live.")
: chipText("domain records live", "ok", "DKIM and DMARC are set, so inboxes can verify mail really comes from this domain.")) + "</span>";
}
function aTop(a, chips) {
return '<div class="top"><span class="who">' + esc(sNm(a.email)) + '</span><span class="dom">' + esc(a.email) + "</span>" + chips + "</div>";
}
function wCard(a) {
var w = a.warmup, done = w.complete;
var pct = done ? 100 : Math.max(2, Math.min(100, Math.round((w.day || 0) / (w.days || 1) * 100)));
var foot;
if (done) {
foot = chipText("warmup complete", "ok", "This account finished its warmup weeks and is ready for a volume ramp-up.") +
(a.warm_idle ? " " + chipText("ramp-up not started", "warn", "Warmup is done but real sending has not been started yet. Starting it is a person's decision.") : "") + dChip(a);
} else {
var target = w.target_today || 0, fd = Math.min(w.sends_today || 0, target), pips = "";
if (target >= 1 && target <= 16) {
for (var i = 0; i < target; i++) pips += i < fd ? '<i class="f"></i>' : "<i></i>";
pips = '<span class="ticks" role="img" aria-label="' + (w.sends_today || 0) + " of " + target + " sends done today" + '">' + pips + "</span>";
}
foot = "<span>Today</span>" + pips + '<span class="num">' + (w.sends_today || 0) + " / " + target + "</span>" + dChip(a);
}
var chips = '<span class="mla">' +
(a.role === "support" ? chipFor("support", "plain") : chipFor(a.role, "info")) + "</span>" +
chipFor(a.method === "graph" ? "graph" : "imap", "ok");
return '<div class="card acct">' + aTop(a, chips) +
'<div class="meterrow"><div class="meter"><i style="width:' + pct + '%"></i></div><span class="val">' +
esc(done ? "warmup complete" : "warmup day " + w.day + " of " + w.days) + "</span></div>" +
'<div class="foot">' + foot + "</div></div>";
}
function pCard(a) {
var w = a.warmup, chip, why;
if (!a.enabled) {
chip = chipText("turned off", "warn", OFF);
why = OFF;
} else if (a.no_creds && w.required) {
chip = chipText("not signed in", "warn", NLT);
why = "No saved login for this mailbox. Connect it and it joins the rotation by itself.";
} else if (a.no_creds) {
chip = chipText("not signed in", "warn", NLT);
why = "Warmup helper waiting for a saved login. Connect it and it joins the warmup rotation by itself.";
} else if (w.required && w.not_started && dnsHeld(a)) {
chip = chipText("waiting on DNS", "bad", isForeign(a)
? "Paused until the domain's email records are fixed. This one is not our domain to fix."
: "Paused until the DKIM and DMARC records are live for the domain.");
why = isForeign(a)
? "Its domain's email records (DKIM and DMARC) are missing, and it is not our domain to fix, so it stays paused. Smallest role, lowest daily limit when it runs."
: "The two records that prove mail comes from this domain (DKIM and DMARC) are missing. Add them at the domain's DNS host, then its " + w.days + "-day warmup starts by itself.";
} else if (w.required && w.not_started) {
chip = chipText("warmup not started", "warn", "Warmup has not begun for this account yet.");
why = "Warmup has not begun yet. It starts by itself on the next automatic run.";
} else {
chip = chipText("idle", "plain", IDLE);
why = IDLE;
}
return '<div class="card acct parked">' + aTop(a, '<span class="mla">' + chip + "</span>") +
'<div class="why">' + esc(why) + "</div></div>";
}
function rAc(d) {
var warming = [], parked = [];
d.accounts.forEach(function (a) {
var w = a.warmup;
(a.enabled && !a.no_creds && w.required && !w.not_started ? warming : parked).push(a);
});
var done = warming.filter(function (a) { return a.warmup.complete; }).length;
var parts = [];
if (warming.length - done) parts.push((warming.length - done) + " warming");
if (done) parts.push(done + " warm");
parts.push(parked.length + " parked");
el("acctSub").textContent = parts.join(" · ");
el("warming").innerHTML = warming.map(wCard).join("") || '<div class="empty">No accounts warming yet.</div>';
el("parkhead").hidden = parked.length === 0;
el("parked").innerHTML = parked.map(pCard).join("");
}
function rPi(d) {
var t = d.totals;
el("pipeSub").textContent = t.contacts + " contacts · " + t.companies + " companies";
var ens = Object.keys(t.by_status).map(function (s) { return { code: s, n: t.by_status[s] }; })
.sort(function (a, b) { return b.n - a.n; });
var segs = ens.slice(0, 4).map(function (e, i) {
return { label: labelFor(e.code), n: e.n, color: "var(--s" + (i + 1) + ")", tip: tipFor(e.code) };
});
var rest = ens.slice(4);
if (rest.length) {
var sum = 0;
var names = rest.map(function (e) { sum += e.n; return labelFor(e.code) + " " + e.n; });
segs.push({ label: "everything else", n: sum, color: "var(--dim)", tip: names.join(", ") });
}
var total = t.contacts || 1, bar = "", legend = "", aria = [];
segs.forEach(function (s) {
bar += '<i data-n="' + s.n + '" style="width:' + (s.n / total * 100).toFixed(1) + "%;background:" + s.color + '" title="' + esc(s.label + ": " + s.n) + '"></i>';
legend += '<span class="k"' + (s.tip ? ' data-tip="' + esc(s.tip) + '" tabindex="0"' : "") + '><span class="sw" style="background:' + s.color + '"></span>' + esc(s.label) + ' <b class="num" style="color:var(--ink)">' + s.n + "</b></span>";
aria.push(s.n + " " + s.label);
});
el("statusPanel").innerHTML = '<div class="panel"><div class="stack" role="img" aria-label="Contact status: ' +
esc(aria.join(", ")) + '">' + bar + '</div><div class="legend">' + legend + "</div></div>";
var pct = Math.round(t.sendable / total * 100);
el("covrow").innerHTML =
'<div class="kpi"><div class="n num">' + t.sendable + '<span class="of"> / ' + t.contacts + '</span></div><div class="l">Ready to email</div>' +
'<div class="meterrow" style="margin-top:8px"><div class="meter good"><i style="width:' + pct + '%"></i></div><span class="val">' + pct + "%</span></div></div>" +
'<div class="kpi"><div class="n num">' + t.companies + '</div><div class="l">Companies</div><div class="d">target companies across all industry groups</div></div>';
}
var KI = {
warmup: "&#128232;", mail: "&#128236;", creds: "&#128273;", draft: "&#128221;",
draft_placed: "&#128221;", draft_rejected: "&#128683;", draft_place_failed: "&#9888;&#65039;",
research: "&#128270;", sequencer: "&#128230;", reply: "&#128172;",
};
function dLb(dt) {
var n = new Date();
var diff = Math.round((new Date(n.getFullYear(), n.getMonth(), n.getDate()) -
new Date(dt.getFullYear(), dt.getMonth(), dt.getDate())) / 86400000);
if (diff === 0) return "Today";
if (diff === 1) return "Yesterday";
return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function rAv(d) {
var events = (d.events || []).slice().sort(function (a, b) {
var ta = pTs(a.ts), tb = pTs(b.ts);
return (tb ? tb.getTime() : 0) - (ta ? ta.getTime() : 0);
});
var rows = "", lastDay = null;
events.forEach(function (e) {
var dt = pTs(e.ts);
var day = dt ? dLb(dt) : "";
if (day && day !== lastDay) { rows += '<li class="day">' + esc(day) + "</li>"; lastDay = day; }
rows += '<li class="ev"><span class="ico" data-tip="' + esc(tipFor(e.kind) || labelFor(e.kind)) + '" tabindex="0">' +
(KI[e.kind] || "&#128280;") + "</span><span>" + esc(shn(e.summary, d.accounts)) +
'</span><span class="t num">' + esc(dt ? fTm(e.ts) : "") + "</span></li>";
});
el("events").innerHTML = rows || '<li class="empty">No activity yet.</li>';
el("warmupMsgs").innerHTML = (d.warmup_messages || []).length
? d.warmup_messages.map(function (m) {
var when = String(m.sent_at).slice(0, 10) === String(d.today) ? fTm(m.sent_at) : fmtTs(m.sent_at);
var subj = String(m.subject || ""), re = "";
if (/^Re:\s*/i.test(subj)) { re = RE; subj = subj.replace(/^Re:\s*/i, ""); }
else if (m.is_reply) re = RE;
return '<tr><td class="num">' + esc(when) + "</td><td>" + esc(sNm(m.from_email)) +
" &rarr; " + esc(sNm(m.to_email)) + "</td><td>" + re + esc(subj) + "</td></tr>";
}).join("")
: '<tr><td colspan="3" class="empty">No warmup mail yet.</td></tr>';
}
function eSt() {
var rf = el("pwRefresh");
if (!rf) return;
var btn = rf.cloneNode(true); // drops the shell's full-reload listener
rf.parentNode.replaceChild(btn, rf);
var stamp = document.createElement("span");
stamp.className = "stamp";
stamp.id = "pwStamp";
btn.parentNode.insertBefore(stamp, btn);
btn.addEventListener("click", function () { load(true); });
}
function uSt(msg) {
var s = el("pwStamp");
if (!s) return;
if (msg) { s.textContent = msg; return; }
if (!lU) { s.textContent = ""; return; }
var sec = Math.round((Date.now() - lU) / 1000);
s.textContent = "updated " + (sec < 90 ? "just now" : sec < 3600 ? Math.round(sec / 60) + "m ago" : Math.round(sec / 3600) + "h ago");
}
function rEr(err) {
var msg = '<div class="empty">Could not load: ' + esc(err || "unknown error") + "</div>";
["kpis", "warmupChart", "warming", "statusPanel"].forEach(function (id) { el(id).innerHTML = msg; });
el("covrow").innerHTML = "";
el("events").innerHTML = '<li class="empty">Could not load.</li>';
el("warmupMsgs").innerHTML = '<tr><td colspan="3" class="empty">Could not load.</td></tr>';
}
async function load(manual) {
if (lg) return;
lg = true;
if (manual) { DISMISSED.length = 0; uSt("updating now"); } // refresh = a fresh look at every problem
try {
var d = await api("/api/dashboard");
if (!d.ok) {
if (!fL) rEr(d.error);
else uSt(RETRY);
return;
}
lastData = d;
fL = true;
lU = Date.now();
renderAlerts(d);
rKp(d);
rCh(d);
rAc(d);
rPi(d);
rAv(d);
uSt();
} catch (e) {
if (e && e.message === "unauthorized") return;
console.error(e);
if (!fL) rEr(String((e && e.message) || e));
else uSt(RETRY);
} finally {
lg = false;
}
}
eSt();
load();
setInterval(function () { uSt(); }, 30000);
setInterval(function () { if (document.visibilityState === "visible") load(); }, 60000);
document.addEventListener("visibilitychange", function () {
if (document.visibilityState === "visible" && Date.now() - lU > 60000) load();
});
// Back navigation on iOS can restore this page from the bfcache with the old JS
// state intact, which would keep a dismissed banner hidden. Treat that like a
// fresh load: every unresolved problem comes back.
window.addEventListener("pageshow", function (e) {
if (e.persisted) { DISMISSED.length = 0; load(true); }
});
