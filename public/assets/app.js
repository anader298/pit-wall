// Pit Wall web: shared page helpers, plain-language labels, app shell.
// No framework, no build step. APIs return raw codes; every translation
// happens here at render time (rule: backend label strings stay raw).
"use strict";

// Fetch a JSON API route. Redirects to the login page on 401 so an expired
// cookie never leaves a page stuck on spinners.
async function api(path, opts) {
  const res = await fetch(path, opts);
  if (res.status === 401) {
    location.href = "/login.html";
    throw new Error("unauthorized");
  }
  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    data = { ok: false, error: "bad response (" + res.status + ")" };
  }
  if (!res.ok && data && !data.error) data.error = "request failed (" + res.status + ")";
  return data;
}

function esc(s) {
  return String(s == null ? "" : s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// "2026-07-29 14:03:22.1+00" or ISO -> "Jul 29, 14:03" in the viewer's zone.
// Normalizes Postgres ::text quirks (space separator, microsecond fractions,
// bare "+00" offsets) that stricter Date parsers such as Safari's reject.
function fmtTs(ts) {
  if (!ts) return "";
  let s = String(ts).replace(" ", "T");
  s = s.replace(/\.(\d{1,3})\d*/, ".$1");
  s = s.replace(/([+-]\d{2})$/, "$1:00");
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return String(ts).slice(0, 16);
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

// "2026-07-29" -> "Jul 29". Formats the parts directly: new Date("2026-07-29")
// is UTC midnight, which shifts back a day in western timezones.
function fmtDate(iso) {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  if (!m) return String(iso);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return months[Number(m[2]) - 1] + " " + Number(m[3]);
}

/* ---------- Plain-language relabeling map ----------
   LABELS[rawCode] = [display label, one-line tooltip]. The raw codes come
   from the APIs unchanged; call labelFor()/tipFor()/chipFor() at render
   time. Unknown codes fall back to the raw code with underscores spaced. */
var LABELS = {
  // Contact status
  "new": ["not yet contacted", "Nothing has been sent to this person yet."],
  "placeholder": ["no name yet", "The role is known but the actual person has not been found yet."],
  "departed": ["left the company", "This person moved on from that company and will not be contacted."],
  "duplicate": ["duplicate", "The same person appears twice; the extra copy is never contacted."],
  "researched": ["researched", "Background research is done; nothing has been sent yet."],
  "drafted": ["draft written", "An email is drafted and waiting in the review queue."],
  "contacted": ["contacted", "At least one email has been sent to this person."],
  "replied": ["replied", "This person wrote back."],
  "bounced": ["email bounced", "Mail to this address came back undeliverable."],
  "call_booked": ["call booked", "A call is on the calendar with this person."],
  "dead": ["closed out", "This thread is closed and will not be contacted again."],
  // Email confidence
  "verified": ["email verified", "The address was checked and confirmed deliverable. Safe to send to."],
  "unverified": ["unverified email", "A pattern guess or unchecked address. Never sent to without a person confirming it."],
  "probable": ["probable email", "Company domain plus the person's full name, from a named source."],
  "quarantined": ["quarantined email", "Only the company matched, not the person. Held back so a stranger is never pitched."],
  // Draft states and checks
  "generated": ["waiting for checks", "Written by the sequencer; the automatic writing checks have not run yet."],
  "linted": ["checks passed", "The automatic writing checks found no problems with this draft."],
  "flagged": ["needs a look", "The automatic checks raised at least one warning. Read the draft before approving."],
  "in_review": ["in review", "Waiting on your decision."],
  "snoozed": ["snoozed", "Set aside to decide later."],
  "approved": ["approved", "Approved and being saved to the account's Drafts folder."],
  "placed": ["in Drafts", "Approved and saved into the sending account's Drafts folder. It has not been sent."],
  "sent": ["sent", "This email went out to the prospect."],
  "rejected": ["rejected", "You turned this draft down; the reason is recorded."],
  "similarity": ["too similar to a sent email", "Reads very close to an email already sent. Repeated wording is a spam signal."],
  // Account roles
  "cold": ["outreach", "Sends the real emails to prospects once its warmup is done."],
  "minimal": ["light outreach", "Sends only a small volume of real outreach once warm."],
  "support": ["warmup helper", "Only exchanges warmup mail with our own accounts. It never emails prospects."],
  // Connection methods
  "graph": ["Microsoft 365", "Connected through Microsoft's Graph system."],
  "imap": ["Gmail", "Connected through the standard IMAP mail protocol."],
  // Event kinds
  "warmup": ["warmup", "Accounts emailing each other so inbox providers learn to trust them."],
  "mail": ["mailbox", "A mailbox connection event."],
  "creds": ["sign-in", "A mailbox login was uploaded or changed."],
  "draft_placed": ["saved to Drafts", "An approved draft was saved into the account's Drafts folder."],
  "draft_rejected": ["draft rejected", "A draft was turned down during review."],
  "draft_place_failed": ["draft save failed", "Approving a draft failed; nothing was saved to the mailbox."],
  "research": ["research", "A verified research item was saved."],
  "sequencer": ["draft writer", "The scheduled job that writes outreach drafts within each account's quota."],
  "draft": ["draft", "An email written and held for your approval. Nothing sends itself."],
  "reply": ["reply", "A reply landed in one of our mailboxes."],
  // Misc
  "ramp": ["volume ramp-up", "After warmup, real sending starts tiny and grows slowly."],
  "held": ["waiting on DNS", "Paused until the domain's email records (DKIM and DMARC) are live."],
};

function labelFor(code) {
  var e = LABELS[String(code)];
  return e ? e[0] : String(code == null ? "" : code).replace(/_/g, " ");
}
function tipFor(code) {
  var e = LABELS[String(code)];
  return e ? e[1] : "";
}
// Chip with custom text and tooltip. cls: "", plain, ok, warn, bad, info.
function chipText(text, cls, tip) {
  return '<span class="chip ' + (cls || "") + '"' +
    (tip ? ' data-tip="' + esc(tip) + '" tabindex="0"' : "") + ">" +
    esc(text) + "</span>";
}
// Chip for a raw API code: translated label + its tooltip.
function chipFor(code, cls) {
  return chipText(labelFor(code), cls, tipFor(code));
}
// Arbitrary text with a tap/hover explanation.
function tipSpan(text, tip) {
  return '<span data-tip="' + esc(tip) + '" tabindex="0">' + esc(text) + "</span>";
}
// Priority integer -> "Priority N" pill with the legend as a tooltip.
var PRI_TIPS = {
  1: "Priority 1: best-fit contact, reach out first.",
  2: "Priority 2: good fit, second wave.",
  3: "Priority 3: long shot or backup contact.",
};
function priPill(p) {
  var n = Number(p);
  var tip = PRI_TIPS[n] || "";
  return '<span class="pri' + (n === 1 ? " p1" : "") + '"' +
    (tip ? ' data-tip="' + esc(tip) + '" tabindex="0"' : "") +
    ">Priority " + esc(p) + "</span>";
}
// Touch number -> "1st email" / "2nd email".
function emailOrdinal(n) {
  n = Number(n);
  if (n === 1) return "1st email";
  if (n === 2) return "2nd email";
  if (n === 3) return "3rd email";
  return n + "th email";
}

/* ---------- App shell: top app bar + phone bottom tab bar ---------- */
var PW_ICONS = {
  gauge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M4.5 18a9 9 0 1 1 15 0"/><path d="M12 13.5 15.5 8"/><circle cx="12" cy="14.5" r="1.6" fill="currentColor" stroke="none"/></svg>',
  inbox: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 13.5 6 6h12l2 7.5"/><path d="M4 13.5h4.5a3.5 3.5 0 0 0 7 0H20V19H4z"/></svg>',
  people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19c.7-3 3-4.5 5.5-4.5s4.8 1.5 5.5 4.5"/><circle cx="16.8" cy="9.5" r="2.4"/><path d="M16.5 14.6c2 .2 3.6 1.5 4.2 3.9"/></svg>',
  flagicon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 21V4"/><path d="M5.5 4.5c2.2-1.4 4.4-1.4 6.5 0s4.3 1.4 6.5 0V14c-2.2 1.4-4.4 1.4-6.5 0s-4.3-1.4-6.5 0z"/></svg>',
  handshake: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5 7 6l5 2 5-2 4 2.5v7l-3 1.5"/><path d="M3 8.5v7l4 2 5 2.5 6-3.5"/><path d="M12 8l-3.5 3a1.6 1.6 0 0 0 2.2 2.3L12 12l3.5 3"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 3v4h-4"/></svg>',
};

var PW_FLAG =
  '<svg class="flag" viewBox="0 0 24 24" aria-hidden="true">' +
  '<rect x="0" y="0" width="24" height="24" rx="5" fill="#fff"/>' +
  '<rect x="0" y="0" width="8" height="8" fill="#10122b"/>' +
  '<rect x="16" y="0" width="8" height="8" fill="#10122b"/>' +
  '<rect x="8" y="8" width="8" height="8" fill="#10122b"/>' +
  '<rect x="0" y="16" width="8" height="8" fill="#10122b"/>' +
  '<rect x="16" y="16" width="8" height="8" fill="#10122b"/></svg>';

// Render the app bar into #appbar and the tab bar into #tabbar.
// `active`: dashboard | queue | contacts | targets | deals | "" (none).
// `title`: shown on the phone app bar in place of the desktop nav.
function renderShell(active, title) {
  var tabs = [
    ["dashboard", "/", "Dashboard", "gauge"],
    ["queue", "/queue.html", "Queue", "inbox"],
    ["contacts", "/contacts.html", "Contacts", "people"],
    ["targets", "/targets.html", "Targets", "flagicon"],
    ["deals", "/deals.html", "Deals", "handshake"],
    ["talent", "/talent.html", "Talent", "people"],
  ];
  var nav = tabs.map(function (t) {
    return '<a class="' + (t[0] === active ? "on" : "") + '" href="' + t[1] + '">' + t[2] + "</a>";
  }).join("");
  nav += '<a class="gloss" href="/glossary.html">What do these mean?</a>';
  var bar =
    '<div class="inner">' +
    '<div class="brand">' + PW_FLAG +
    '<span class="word">Pit<span class="acc"> Wall</span></span></div>' +
    '<span class="pagetitle">' + esc(title || "") + "</span>" +
    "<nav>" + nav + "</nav>" +
    '<span class="spacer"></span>' +
    '<button class="iconbtn" id="pwRefresh" type="button" title="Refresh">' + PW_ICONS.refresh + "</button>" +
    '<a class="iconbtn m-only" href="/glossary.html" title="What do these mean? Open the glossary">?</a>' +
    '<button class="logoutlink" id="pwLogout" type="button">Log out</button>' +
    '</div><div class="checkerline"></div>';
  var el = document.getElementById("appbar") || document.getElementById("topbar");
  if (el) el.innerHTML = bar;

  var tb = tabs.map(function (t) {
    return '<a class="' + (t[0] === active ? "on" : "") + '" href="' + t[1] + '">' +
      PW_ICONS[t[3]] + "<span>" + t[2] + "</span></a>";
  }).join("");
  var tel = document.getElementById("tabbar");
  if (tel) tel.innerHTML = tb;

  var lg = document.getElementById("pwLogout");
  if (lg) {
    lg.addEventListener("click", async function () {
      try { await fetch("/api/logout", { method: "POST" }); } catch (e) { /* ignore */ }
      // The queue cache holds draft bodies and prospect addresses; do not leave it in a shared tab.
      try { sessionStorage.removeItem("pw_queue_v1"); } catch (e) { /* storage blocked */ }
      location.href = "/login.html";
    });
  }
  var rf = document.getElementById("pwRefresh");
  if (rf) rf.addEventListener("click", function () { location.reload(); });
}

// Back-compat alias for any cached page still calling the old name.
var renderTopbar = renderShell;
