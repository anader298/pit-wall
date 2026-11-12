// Queue page.
"use strict";

renderShell("queue", "Queue");

var REVIEW_STATES = ["generated", "linted", "flagged", "in_review", "snoozed"];
var CACHE_KEY = "pw_queue_v1";
// Bump CACHE_VER in lockstep with the ?v=N on the assets: a deploy that changes the
// draft shape must not paint from a cache written by the previous build.
var CACHE_VER = 6;
var CACHE_MAX_AGE_MS = 5 * 60 * 1000;

var DRAFTS = [];
var FILTER = "all";
var ACCT = "";
var CHECKED_AT = null;
var STALE = null;

function parseTs(ts) {
  if (!ts) return null;
  var s = String(ts).replace(" ", "T").replace(/\.(\d{1,3})\d*/, ".$1").replace(/([+-]\d{2})$/, "$1:00");
  var d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}
function isToday(ts) {
  var d = parseTs(ts), n = new Date();
  return !!d && d.toDateString() === n.toDateString();
}
function shortAcct(email) {
  var m = /@([^.]+)/.exec(String(email || ""));
  return m ? m[1] : String(email || "the account");
}
function reviewable(d) { return REVIEW_STATES.indexOf(d.state) !== -1; }
function isBlocked(d) { return reviewable(d) && (d.blocks || []).length > 0; }
function acctList() {
  var a = [];
  DRAFTS.forEach(function (d) {
    if (d.account_email && a.indexOf(d.account_email) === -1) a.push(d.account_email);
  });
  return a;
}

var SUBJ_TIP = "The subject line may get cut off on phones and can look spammy.";
var LINT_LABELS = {
  unsourced_number: ["unconfirmed number", "A number quoted in the email has no verified source yet."],
  calendar_ask: ["asks for a call too soon", "This template is meant to ask for an intro, not a calendar slot. Only template D may ask for time in a first email."],
  long_subject: ["long subject", SUBJ_TIP],
  subject_length: ["long subject", SUBJ_TIP],
};
function lintInfo(x) {
  if (x && typeof x === "object") {
    var code = String(x.code || ""), msg = String(x.message || "");
    var k = LINT_LABELS[code] || (LABELS[code] ? [labelFor(code), tipFor(code)] : null);
    if (k) return { label: k[0], tip: k[1] + (msg ? " Raw check: " + msg : "") };
    return { label: code ? code.replace(/_/g, " ") : (msg || "check"), tip: msg };
  }
  var s = String(x == null ? "" : x), raw = " Raw check: " + s;
  if (/similar/i.test(s)) return { label: "too similar to another email", tip: "Reads very close to another email. Repeated wording is a spam signal, so vary it." + raw };
  if (/reading grade|grade \d/i.test(s)) return { label: "hard to read", tip: "The writing is more complex than the plain-English target." + raw };
  if (/subject/i.test(s)) return { label: "long subject", tip: SUBJ_TIP + raw };
  return { label: s, tip: "The automatic checks raised this. Read the draft before approving." };
}
function checkChips(d) {
  var out = "";
  (d.blocks || []).forEach(function (b) {
    var i = lintInfo(b);
    out += chipText("blocked: " + i.label, "bad", i.tip) + " ";
  });
  (d.warnings || []).forEach(function (w) {
    var i = lintInfo(w);
    out += chipText("warning: " + i.label, "warn", i.tip) + " ";
  });
  return out;
}

function stateChipHtml(d) {
  if (isBlocked(d)) return chipText("blocked", "bad", "The automatic checks found a problem serious enough to stop this draft. Reject it here and the sequencer writes a new one.");
  var s = d.state;
  if (s === "placed" || s === "sent" || s === "approved") return chipFor(s, "ok");
  if (s === "flagged") return chipFor(s, "warn");
  if (s === "linted" && (d.warnings || []).length) return chipFor("flagged", "warn");
  if (s === "rejected") return chipFor(s, "bad");
  if (s === "linted" || s === "in_review") return chipFor(s, "info");
  return chipFor(s, "plain");
}
function editedChip(d) {
  var c = parseTs(d.created_at), u = parseTs(d.updated_at);
  if (!reviewable(d) || !c || !u || u - c < 90000) return "";
  return chipText("edited", "plain", "Changed after it was first written. Last change " + fmtTs(d.updated_at) + ".");
}
function resultBar(d) {
  var t = d._pending ? '<span class="t">saving&hellip;</span>'
    : '<span class="t num">' + esc(fmtTs(d.updated_at)) + "</span>";
  if (d.state === "rejected") {
    return '<div class="rejectedbar"><span>&#10007;</span> Rejected' +
      (d._rejectReason ? ": " + esc(d._rejectReason) + " recorded" : ", reason recorded") + t + "</div>";
  }
  var text = d.state === "sent" ? "Sent to the prospect from " + esc(shortAcct(d.account_email))
    : d.state === "approved" ? "Approved, being saved to " + esc(shortAcct(d.account_email)) + "'s Drafts folder"
    : "Approved, sitting in " + esc(shortAcct(d.account_email)) + "'s Drafts folder";
  return '<div class="placedbar"' +
    (d.provider_msg_id ? ' data-tip="Saved in the mailbox as ' + esc(d.provider_msg_id) + '." tabindex="0"' : "") +
    "><span>&#10003;</span> " + text + t + "</div>";
}
function cardHtml(d) {
  var decided = !reviewable(d);
  var h = '<div class="card draft' + (decided ? " decided" : "") + '" id="draft-' + d.id + '" data-id="' + d.id + '">';
  h += '<div class="head"><span class="who">' + esc(d.contact.full_name) + "</span>" +
    stateChipHtml(d) +
    chipText(emailOrdinal(d.touch), "plain", "Which email in the sequence this is for this person: the opener, then the follow-up.") +
    (d.variant ? chipText("template " + d.variant, "plain", "Which of the rotating email templates this draft was written from.") : "") +
    editedChip(d) + "</div>";
  h += '<div class="meta">' + esc(d.contact.title ? d.contact.title + ", " : "") +
    "<b>" + esc(d.company ? d.company.name : "no company") + "</b>" +
    " &middot; to " + esc(d.contact.email || "no email") +
    " &middot; from <b>" + esc(shortAcct(d.account_email)) + "</b></div>";
  if (!decided) {
    var chips = checkChips(d);
    if (chips) h += '<div class="scorerow">' + chips + "</div>";
  }
  h += '<div class="subject">' + esc(d.subject || "(no subject)") + "</div>";
  if (decided) {
    h += resultBar(d);
  } else {
    h += '<div class="body clamp">' + esc(d.body || "") + "</div>" +
      '<button class="expand" type="button" data-act="expand" hidden>Show full email</button>';
    if (d._mode === "confirm") {
      h += '<div class="confirmbar"><span class="q">Save to ' + esc(shortAcct(d.account_email)) +
        "'s Drafts folder? Nothing is sent.</span>" +
        '<span class="btns"><button class="btn ghost sm" data-act="cancel">Cancel</button>' +
        '<button class="btn primary sm" data-act="confirm-approve">Confirm</button></span></div>';
    } else if (d._mode === "reject") {
      h += '<div class="rejectpanel"><div class="rlabel">Reject reason</div><div class="reasons">' +
        ["Copy off-brand", "Wrong contact", "Bad timing", "Other"].map(function (r, i) {
          return '<button class="fchip' + (i === 0 ? " on" : "") + '" data-reason="' + r + '" type="button">' + r + "</button>";
        }).join("") + "</div>" +
        '<textarea rows="2" placeholder="Optional note for the record"></textarea>' +
        '<div class="rbtns"><button class="btn ghost sm" data-act="cancel">Cancel</button>' +
        '<button class="btn danger sm" data-act="confirm-reject">Confirm reject</button></div></div>';
    } else {
      var blocked = isBlocked(d);
      h += '<div class="actions">' +
        '<button class="btn primary" data-act="approve"' + (blocked ? " disabled" : "") + ">Approve &amp; save to Drafts</button>" +
        '<button class="btn danger" data-act="reject">Reject</button></div>' +
        (blocked ? '<div class="blocknote">Approve is off because a check found a blocking problem. Reject it here and the sequencer writes a new one on its next run.</div>' : "");
    }
  }
  return h + '<div class="msg' + (d._err ? " err" : "") + '">' + esc(d._err || "") + "</div></div>";
}
function clampCheck(scope) {
  (scope || document).querySelectorAll(".draft .body.clamp:not([hidden])").forEach(function (b) {
    var btn = b.parentElement.querySelector('[data-act="expand"]');
    if (btn) btn.hidden = b.scrollHeight <= b.clientHeight + 2;
  });
}
function rerender(d) {
  var el = document.getElementById("draft-" + d.id);
  if (!el) return;
  el.outerHTML = cardHtml(d);
  clampCheck(document.getElementById("draft-" + d.id));
}

function matches(d, f) {
  if (f === "review") return reviewable(d);
  if (f === "look") return reviewable(d) && (d.state === "flagged" || (d.blocks || []).length > 0 || (d.warnings || []).length > 0);
  if (f === "today") return ["approved", "placed", "sent"].indexOf(d.state) !== -1 && isToday(d.updated_at);
  return true;
}
function inAcct(d) { return !ACCT || d.account_email === ACCT; }
function renderFilters() {
  var pool = DRAFTS.filter(inAcct);
  function chip(key, label) {
    var n = pool.filter(function (d) { return matches(d, key); }).length;
    return '<button class="fchip' + (FILTER === key ? " on" : "") + '" data-filter="' + key + '" type="button">' +
      label + ' <span class="c num">' + n + "</span></button>";
  }
  var accts = acctList();
  document.getElementById("fchips").innerHTML =
    chip("all", "All") + chip("review", "Needs review") + chip("look", "Needs a look") + chip("today", "In Drafts today") +
    (accts.length > 1
      ? '<button class="fchip' + (ACCT ? " on" : "") + '" data-cycle-acct type="button">Account: ' +
        (ACCT ? esc(shortAcct(ACCT)) : "any") + "</button>"
      : "");
}
function renderMinibar() {
  var n = DRAFTS.filter(reviewable).length;
  var el = document.getElementById("minibar");
  el.hidden = !n;
  if (n) el.innerHTML = "<span>" + n + (n === 1 ? " draft needs" : " drafts need") + " review</span>" +
    '<button class="jump" data-act="jump" type="button">Jump</button>';
}
function renderList() {
  var el = document.getElementById("list");
  if (!DRAFTS.length) {
    el.innerHTML = '<div class="panel qempty"><h3>The queue is clear</h3>' +
      "<p>Drafts are written by the sequencer and show up here for review. " +
      "No account can send until its warmup finishes and a volume ramp-up is started, " +
      "so an empty queue is normal right now.</p>" +
      '<p style="margin-top:8px"><a href="/glossary.html">What do these terms mean?</a></p>' +
      (CHECKED_AT ? '<div class="when num">Checked ' + esc(fmtTs(CHECKED_AT)) + "</div>" : "") + "</div>";
    return;
  }
  var vis = DRAFTS.filter(function (d) { return inAcct(d) && matches(d, FILTER); });
  var strip = STALE
    ? '<div class="stalestrip">Showing a saved copy from this tab. Could not refresh (' +
      esc(STALE) + ")." + (CHECKED_AT ? " Last checked " + esc(fmtTs(CHECKED_AT)) + "." : "") +
      ' <button class="linkish" data-act="refresh" type="button">Try again</button></div>'
    : "";
  el.innerHTML = strip +
    (vis.length ? vis.map(cardHtml).join("") : '<div class="empty">Nothing matches this filter.</div>');
  clampCheck(el);
}
function renderAll() { renderFilters(); renderMinibar(); renderList(); }

async function load(background) {
  if (!background && !DRAFTS.length) {
    var sk = '<div class="card draft skcard"><span class="sk l w40"></span><span class="sk l w65"></span>' +
      '<span class="sk blk"></span><span class="sk l w85"></span></div>';
    document.getElementById("list").innerHTML = sk + sk + sk;
  }
  var res;
  try {
    res = await api("/api/queue");
  } catch (e) {
    if (e && e.message === "unauthorized") return;
    res = { ok: false, error: "network error" };
  }
  if (!res.ok) {
    if (!DRAFTS.length) {
      document.getElementById("list").innerHTML =
        '<div class="empty">Could not load the queue (' + esc(res.error || "unknown") + "). Try a refresh.</div>";
      return;
    }
    // A warm cache must never hide a failed refresh: the list stays usable but says so.
    STALE = res.error || "unknown";
    renderAll();
    return;
  }
  STALE = null;
  CHECKED_AT = new Date().toISOString();
  DRAFTS = res.drafts;
  saveCache();
  renderAll();
}
function saveCache() {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ v: CACHE_VER, t: Date.now(), drafts: DRAFTS }));
  } catch (e) { /* storage blocked */ }
}
function loadCached() {
  try {
    var raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return false;
    var box = JSON.parse(raw);
    if (!box || box.v !== CACHE_VER || !box.drafts) { sessionStorage.removeItem(CACHE_KEY); return false; }
    if (!box.t || Date.now() - box.t > CACHE_MAX_AGE_MS) { sessionStorage.removeItem(CACHE_KEY); return false; }
    DRAFTS = box.drafts;
    DRAFTS.forEach(function (d) { d._mode = null; d._err = null; d._pending = null; });
    renderAll();
    return true;
  } catch (e) { return false; }
}

function findDraft(id) {
  for (var i = 0; i < DRAFTS.length; i++) if (DRAFTS[i].id === id) return DRAFTS[i];
  return null;
}
async function doAct(d, action, payload, newState, errPrefix, errSuffix) {
  var snap = { state: d.state, provider_msg_id: d.provider_msg_id, updated_at: d.updated_at };
  d._mode = null; d._err = null; d._pending = true;
  d.state = newState;
  d.updated_at = new Date().toISOString();
  renderAll();
  var res;
  try {
    res = await api("/api/queue/" + d.id + "/" + action, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    if (e && e.message === "unauthorized") return;
    res = { ok: false, error: "network error, nothing was changed" };
  }
  if (res.ok) {
    d._pending = null;
    if (res.msgId) d.provider_msg_id = res.msgId;
    saveCache();
    rerender(d);
  } else {
    d.state = snap.state; d.provider_msg_id = snap.provider_msg_id; d.updated_at = snap.updated_at;
    d._pending = null; d._rejectReason = null;
    d._err = errPrefix + (res.error || "unknown error") + errSuffix;
    renderAll();
  }
}
function doApprove(d) {
  doAct(d, "approve", {}, "placed", "Could not save to Drafts: ", ". The draft is back in the queue.");
}
function doReject(d, reason, note) {
  d._rejectReason = reason;
  doAct(d, "reject", note ? { reason: reason, note: note } : { reason: reason },
    "rejected", "Could not reject: ", ". The draft is unchanged.");
}

document.getElementById("fchips").addEventListener("click", function (e) {
  var f = e.target.closest("[data-filter]");
  if (f) { FILTER = f.dataset.filter; renderFilters(); renderList(); return; }
  if (e.target.closest("[data-cycle-acct]")) {
    var accts = acctList();
    var i = accts.indexOf(ACCT);
    ACCT = i === accts.length - 1 ? "" : accts[i + 1];
    renderFilters(); renderList();
  }
});
document.getElementById("minibar").addEventListener("click", function (e) {
  if (!e.target.closest('[data-act="jump"]')) return;
  var first = DRAFTS.filter(reviewable)[0];
  var el = first && document.getElementById("draft-" + first.id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
});
document.getElementById("list").addEventListener("click", function (e) {
  if (e.target.closest('[data-act="refresh"]')) { load(false); return; }
  var card = e.target.closest(".draft[data-id]");
  if (!card) return;
  var d = findDraft(Number(card.dataset.id));
  if (!d) return;
  var reasonBtn = e.target.closest("[data-reason]");
  if (reasonBtn) {
    card.querySelectorAll("[data-reason]").forEach(function (b) { b.classList.remove("on"); });
    reasonBtn.classList.add("on");
    return;
  }
  var btn = e.target.closest("[data-act]");
  if (!btn) return;
  var act = btn.dataset.act;
  if (act === "expand") {
    var open = card.querySelector(".body").classList.toggle("clamp");
    btn.textContent = open ? "Show full email" : "Show less";
  } else if (act === "approve") {
    d._mode = "confirm"; d._err = null; rerender(d);
  } else if (act === "reject") {
    d._mode = "reject"; d._err = null; rerender(d);
  } else if (act === "cancel") {
    d._mode = null; rerender(d);
  } else if (act === "confirm-approve") {
    doApprove(d);
  } else if (act === "confirm-reject") {
    var on = card.querySelector("[data-reason].on");
    var ta = card.querySelector(".rejectpanel textarea");
    doReject(d, on ? on.dataset.reason : "unspecified", ta ? ta.value.trim() : "");
  }
});

load(loadCached()).catch(function (e) { console.error(e); });
