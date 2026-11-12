// Contacts + companies. Phone cards, desktop sortable table. Raw API codes translate at render time.
"use strict";

renderShell("contacts", "Contacts");

const $ = (id) => document.getElementById(id);

const qs = new URLSearchParams(location.search);
const state = {
  q: (qs.get("q") || "").trim(),
  status: (qs.get("status") || "").trim(),
  statuses: null,
  counts: {},
  rows: [],
  sortC: null,
  sortCo: null,
  coq: "",
  companies: null,
};
let view = location.hash === "#companies" ? "companies" : "contacts";
let loadedC = false;

const S_ORD = ["new", "drafted", "contacted", "replied", "placeholder",
  "departed", "researched", "duplicate", "bounced", "call_booked", "dead"];

const statusCls = (s) =>
  s === "departed" || s === "bounced" || s === "dead" ? "bad" :
  s === "placeholder" ? "warn" :
  s === "replied" || s === "call_booked" ? "ok" :
  s === "drafted" || s === "contacted" ? "info" : "plain";
const isOff = (s) => s === "departed" || s === "placeholder" || s === "duplicate" || s === "dead";
const confChip = (c) =>
  c === "verified" ? chipFor("verified", "ok") :
  !c || c === "none" ? "" :
  c === "unverified" ? chipFor("unverified", "warn") : chipText(c, "warn", "");
const titleCase = (s) => String(s || "").toLowerCase()
  .replace(/(^|[^a-z0-9])([a-z])/g, (m, a, b) => a + b.toUpperCase());
const NT = ' target="_blank" rel="noopener"';
const txt = (s) => esc(String(s == null ? "" : s).replace(/\s*\u2014\s*/g, ", "));
const kv = (k, vHtml) => `<div class="kv"><span class="k">${k}</span><span>${vHtml}</span></div>`;

function skel(cardsEl, rowsEl) {
  cardsEl.innerHTML = ('<div class="crd" aria-hidden="true"><div class="sk l1"></div>' +
    '<div class="sk l2"></div><div class="sk l3"></div></div>').repeat(6);
  rowsEl.innerHTML = ('<tr aria-hidden="true">' +
    '<td><div class="sk lt"></div></td>'.repeat(6) + "</tr>").repeat(8);
}
const emptyIn = (msg, withClear) => msg + (withClear
  ? '<br><button class="btn sm clearall" type="button">Clear search and filters</button>' : "");
function showEmpty(cardsEl, rowsEl, msg, c) {
  cardsEl.innerHTML = `<div class="empty">${emptyIn(msg, c)}</div>`;
  rowsEl.innerHTML = `<tr><td colspan="6" class="empty">${emptyIn(msg, c)}</td></tr>`;
}

function syncUrl() {
  const p = new URLSearchParams();
  if (state.q) p.set("q", state.q);
  if (state.status) p.set("status", state.status);
  const s = p.toString();
  history.replaceState(null, "", location.pathname + (s ? "?" + s : "") +
    (view === "companies" ? "#companies" : ""));
}

function cmp(a, b, k, d) {
  const x = a[k], y = b[k];
  const ex = x == null || x === "", ey = y == null || y === "";
  if (ex || ey) return ex && ey ? 0 : ex ? 1 : -1;
  const nx = Number(x), ny = Number(y);
  if (!isNaN(nx) && !isNaN(ny)) return (nx - ny) * d;
  return String(x).toLowerCase().localeCompare(String(y).toLowerCase()) * d;
}
const sortView = (list, srt) =>
  srt ? list.slice().sort((a, b) => cmp(a, b, srt.k, srt.d)) : list;
function bindSort(theadSel, get, set, rerender) {
  const thead = document.querySelector(theadSel);
  thead.addEventListener("click", (ev) => {
    const th = ev.target.closest("th[data-sort]");
    if (!th) return;
    const k = th.getAttribute("data-sort");
    const cur = get();
    set(!cur || cur.k !== k ? { k, d: 1 } : cur.d === 1 ? { k, d: -1 } : null);
    const now = get();
    thead.querySelectorAll("th[data-sort]").forEach((t) => {
      const on = now && t.getAttribute("data-sort") === now.k;
      t.classList.toggle("asc", !!on && now.d === 1);
      t.classList.toggle("desc", !!on && now.d === -1);
      if (on) t.setAttribute("aria-sort", now.d === 1 ? "ascending" : "descending");
      else t.removeAttribute("aria-sort");
    });
    rerender();
  });
}

function chipBtn(val, label, count, on) {
  const tip = tipFor(val);
  return `<button type="button" class="fchip${on ? " on" : ""}" data-status="${esc(val)}"` +
    (tip ? ` data-tip="${esc(tip)}"` : "") + `>${esc(label)}` +
    (count != null ? ` <span class="c num">${count}</span>` : "") + "</button>";
}
function renderChips() {
  const list = state.statuses || (state.status ? [state.status] : []);
  const ord = list.slice().sort((a, b) => {
    let ia = S_ORD.indexOf(a); if (ia < 0) ia = 99;
    let ib = S_ORD.indexOf(b); if (ib < 0) ib = 99;
    return ia - ib || (a < b ? -1 : a > b ? 1 : 0);
  });
  $("fchips").innerHTML = chipBtn("", "All", state.counts[""], state.status === "") +
    ord.map((s) => chipBtn(s, labelFor(s), state.counts[s], state.status === s)).join("");
}

function cCard(c) {
  const name = c.full_name || "(name not found yet)";
  return `<div class="crd tap${isOff(c.status) ? " off" : ""}" tabindex="0" role="button" aria-expanded="false">` +
    `<div class="r1"><span class="nm">${esc(name)}</span>` + priPill(c.priority) +
    (c.linkedin_url ? `<a class="lnkbtn" href="${esc(c.linkedin_url)}"${NT} aria-label="LinkedIn">in</a>` : "") +
    `</div><div class="r2">` + txt(c.title) +
    (c.company_name ? (c.title ? " &middot; " : "") + `<b>${esc(c.company_name)}</b>` : "") +
    `</div><div class="r3">` +
    (c.email ? `<span class="em">${esc(c.email)}</span>` : '<span class="dim">no email</span>') +
    confChip(c.email_confidence) + chipFor(c.status, statusCls(c.status)) + "</div>" +
    '<div class="detail">' +
    kv("Status", esc(tipFor(c.status) || labelFor(c.status))) +
    kv("Priority", esc(PRI_TIPS[Number(c.priority)] || "Priority " + c.priority)) +
    (c.linkedin_url ? kv("LinkedIn", `<a href="${esc(c.linkedin_url)}"${NT}>Open profile</a>`) : "") +
    "</div></div>";
}
function cRow(c) {
  const name = c.full_name || "(name not found yet)";
  return `<tr${isOff(c.status) ? ' class="off"' : ""}><td><b>${esc(name)}</b>` +
    (c.linkedin_url ? ` <a href="${esc(c.linkedin_url)}"${NT} aria-label="LinkedIn">in</a>` : "") +
    `</td><td>${txt(c.title)}</td><td>${esc(c.company_name || "")}</td><td>` +
    (c.email ? esc(c.email) + " " + confChip(c.email_confidence) : '<span class="dim">no email</span>') +
    "</td><td>" + chipFor(c.status, statusCls(c.status)) +
    "</td><td>" + priPill(c.priority) + "</td></tr>";
}
function drawRows() {
  const h = sortView(state.rows, state.sortC).map(cRow).join("");
  if (h) $("rows").innerHTML = h;
}

// The whole list renders on one scrolling page; this line is just the count.
function renderCount(total) {
  $("pager").innerHTML =
    `<span class="tot num">${total}${total === 1 ? " contact" : " contacts"}</span>`;
}

let loadSeq = 0;
async function loadContacts() {
  loadedC = true;
  renderChips();
  skel($("clist"), $("rows"));
  $("pager").innerHTML = "";
  const seq = ++loadSeq;
  const res = await api("/api/contacts?q=" + encodeURIComponent(state.q) +
    "&status=" + encodeURIComponent(state.status));
  if (seq !== loadSeq) return;
  if (!res.ok) {
    showEmpty($("clist"), $("rows"),
      `Could not load contacts (${esc(res.error || "error")}). Tap refresh to try again.`, false);
    return;
  }
  if (res.statuses) state.statuses = res.statuses;
  if (!state.q) {
    state.counts[state.status] = res.total;
    if (state.status === "") $("nContacts").textContent = res.total;
  }
  renderChips();
  state.rows = res.contacts;
  if (res.contacts.length) {
    $("clist").innerHTML = res.contacts.map(cCard).join("");
    drawRows();
  } else if (state.q || state.status) {
    showEmpty($("clist"), $("rows"),
      "No contacts match" + (state.q ? ` "${esc(state.q)}"` : " that filter") + ".", true);
  } else {
    showEmpty($("clist"), $("rows"),
      "No contacts yet. The research pipeline adds them.", false);
  }
  renderCount(res.total);
}

const CO_LABELS = {
  target: ["on the target list", "Identified as a sponsorship prospect. Research and outreach start from here."],
};
const coChip = (s) => {
  const e = CO_LABELS[String(s)];
  return e ? chipText(e[0], "plain", e[1]) : chipFor(s, "plain");
};
function coCard(co) {
  const n = Number(co.contact_count) || 0;
  const w = Number(co.with_email) || 0;
  const v = Number(co.verified_emails) || 0;
  const pct = n ? Math.round((w / n) * 100) : 0;
  return (co.why_they_fit
    ? '<div class="crd tap" tabindex="0" role="button" aria-expanded="false">'
    : '<div class="crd">') +
    `<div class="r1"><span class="nm">${esc(co.name)}</span>` + coChip(co.status) + "</div>" +
    `<div class="r2">` + esc(titleCase(co.vertical || "")) +
    (co.domain ? ` &middot; <span class="num">${esc(co.domain)}</span>` : "") + "</div>" +
    `<div class="meterrow"><div class="meter${n && v === w && w === n ? " good" : ""}">` +
    `<i style="width:${pct}%"></i></div><span class="val">${w} of ${n} with email &middot; ${v} verified</span></div>` +
    (co.why_they_fit ? `<div class="detail">${kv("Why they fit", txt(co.why_they_fit))}</div>` : "") +
    "</div>";
}
const coRow = (co) =>
  `<tr><td><b>${esc(co.name)}</b>` +
  (co.domain ? ` <span class="mut">${esc(co.domain)}</span>` : "") +
  `</td><td>${esc(titleCase(co.vertical || ""))}</td><td>` + coChip(co.status) +
  `</td><td>${esc(co.contact_count)}</td><td>${esc(co.with_email)}</td><td>${esc(co.verified_emails)}</td></tr>`;
function filteredCos() {
  const all = state.companies || [];
  const q = state.coq.toLowerCase();
  return q ? all.filter((co) =>
    (co.name || "").toLowerCase().includes(q) ||
    (co.domain || "").toLowerCase().includes(q) ||
    (co.vertical || "").toLowerCase().includes(q)) : all;
}
function drawCos() {
  const all = state.companies || [];
  const q = state.coq.toLowerCase();
  const list = filteredCos();
  if (list.length) {
    $("colist").innerHTML = list.map(coCard).join("");
    $("corows").innerHTML = sortView(list, state.sortCo).map(coRow).join("");
  } else if (q) {
    showEmpty($("colist"), $("corows"), `No companies match "${esc(state.coq)}".`, true);
  } else {
    showEmpty($("colist"), $("corows"),
      "No companies yet. The research pipeline adds them.", false);
  }
  const unit = all.length === 1 ? " company" : " companies";
  $("cocount").textContent = q ? `${list.length} of ${all.length}${unit}` : all.length + unit;
}
async function loadCos() {
  if (state.companies) { drawCos(); return; }
  skel($("colist"), $("corows"));
  const res = await api("/api/companies");
  if (!res.ok) {
    showEmpty($("colist"), $("corows"),
      `Could not load companies (${esc(res.error || "error")}). Tap refresh to try again.`, false);
    return;
  }
  state.companies = res.companies;
  $("nCompanies").textContent = res.companies.length;
  drawCos();
}

const reloadC = () => loadContacts().catch(console.error);
function syncSearchbar() {
  const input = $("q");
  input.value = view === "contacts" ? state.q : state.coq;
  input.placeholder = view === "contacts"
    ? "Search name, title, email, company" : "Search company, industry, domain";
  $("sbar").classList.toggle("has", input.value !== "");
}
function showTab(which) {
  view = which;
  const contacts = which === "contacts";
  $("contactsView").style.display = contacts ? "" : "none";
  $("companiesView").style.display = contacts ? "none" : "";
  $("tabContacts").classList.toggle("on", contacts);
  $("tabCompanies").classList.toggle("on", !contacts);
  syncUrl();
  syncSearchbar();
  if (contacts) {
    if (!loadedC) reloadC();
  } else {
    loadCos().catch(console.error);
  }
}

function runSearch(v) {
  if (view === "contacts") {
    if (v === state.q) return;
    state.q = v;
    syncUrl();
    reloadC();
  } else {
    state.coq = v;
    if (state.companies) drawCos();
  }
}
let debounce = null;
$("q").addEventListener("input", (e) => {
  $("sbar").classList.toggle("has", e.target.value !== "");
  clearTimeout(debounce);
  debounce = setTimeout(() => runSearch(e.target.value.trim()), 300);
});
$("qclr").addEventListener("click", () => {
  clearTimeout(debounce);
  $("q").value = "";
  $("sbar").classList.remove("has");
  runSearch("");
  $("q").focus();
});

$("fchips").addEventListener("click", (ev) => {
  const b = ev.target.closest(".fchip");
  if (!b) return;
  const s = b.getAttribute("data-status") || "";
  if (s === state.status) return;
  state.status = s;
  syncUrl();
  reloadC();
});

function toggleCrd(crd) {
  crd.setAttribute("aria-expanded", crd.classList.toggle("open") ? "true" : "false");
}
function bindExpand(el) {
  el.addEventListener("click", (ev) => {
    if (ev.target.closest("a,[data-tip],button")) return;
    const crd = ev.target.closest(".crd.tap");
    if (crd) toggleCrd(crd);
  });
  el.addEventListener("keydown", (ev) => {
    if ((ev.key === "Enter" || ev.key === " ") && ev.target.classList &&
        ev.target.classList.contains("tap")) {
      ev.preventDefault();
      toggleCrd(ev.target);
    }
  });
}
bindExpand($("clist"));
bindExpand($("colist"));

document.addEventListener("click", (ev) => {
  if (!ev.target.classList || !ev.target.classList.contains("clearall")) return;
  if (view === "contacts") {
    state.q = "";
    state.status = "";
    syncUrl();
    syncSearchbar();
    reloadC();
  } else {
    state.coq = "";
    syncSearchbar();
    drawCos();
  }
});

// ------------------------------ CSV download of whatever is on screen
function csvCell(v) {
  const s = String(v == null ? "" : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function downloadCsv(name, rows) {
  // BOM so Excel opens it as UTF-8 without an import dialog.
  const csv = "\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
$("dl").addEventListener("click", () => {
  const day = new Date().toISOString().slice(0, 10);
  if (view === "contacts") {
    const list = sortView(state.rows, state.sortC);
    downloadCsv(`pitwall-contacts-${day}.csv`, [
      ["Name", "Title", "Company", "Email", "Email status", "Status", "Priority", "LinkedIn"],
      ...list.map((c) => [c.full_name, c.title, c.company_name, c.email,
        c.email_confidence, labelFor(c.status), c.priority, c.linkedin_url]),
    ]);
  } else {
    const list = sortView(filteredCos(), state.sortCo);
    downloadCsv(`pitwall-companies-${day}.csv`, [
      ["Company", "Industry group", "Status", "Domain", "Contacts",
        "Emails found", "Emails verified", "Why they fit"],
      ...list.map((co) => [co.name, titleCase(co.vertical || ""), labelFor(co.status),
        co.domain, co.contact_count, co.with_email, co.verified_emails, co.why_they_fit]),
    ]);
  }
});

$("tabContacts").addEventListener("click", () => showTab("contacts"));
$("tabCompanies").addEventListener("click", () => showTab("companies"));

bindSort("#contactsView thead", () => state.sortC, (v) => { state.sortC = v; }, drawRows);
bindSort("#companiesView thead", () => state.sortCo, (v) => { state.sortCo = v; }, drawCos);

syncSearchbar();
showTab(view);
setTimeout(() => {
  if (view === "contacts") loadCos().catch(() => {});
  else if (!loadedC) loadContacts().catch(() => {});
}, 400);
