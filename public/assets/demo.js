// Sample controls. In production these jobs run on schedules; here they are
// buttons so the loop can be watched end to end against mock mailboxes.
"use strict";
(function () {
  var host = document.getElementById("democtl");
  if (host) {
    host.innerHTML = '<div class="panel democtl">' +
      '<button class="btn sm brand" data-job="sequencer" type="button">Run the sequencer</button>' +
      '<button class="btn sm" data-job="warmup" type="button">Run a warmup pass</button>' +
      '<span class="out" id="demoOut">Sample data. Mailboxes are mocks; nothing can be sent.</span></div>';
    host.addEventListener("click", async function (e) {
      var b = e.target.closest("[data-job]");
      if (!b) return;
      b.disabled = true;
      var r = await api("/api/" + b.dataset.job + "/run", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      var out = document.getElementById("demoOut");
      if (b.dataset.job === "sequencer") {
        out.textContent = r.ok ? (r.drafted ? r.drafted + " drafts written and checked; open the queue to review them." : "No drafts: " + (r.reason || "every account is at its cap for today") + ".") : "Failed: " + r.error;
      } else {
        out.textContent = r.ok ? r.totalSent + " warmup notes sent and " + r.totalReplies + " replies, all between owned mock mailboxes." : "Skipped: " + (r.skipped || r.error);
      }
      b.disabled = false;
      setTimeout(function () { location.reload(); }, 1400);
    });
  }
  var mbx = document.getElementById("mailbox");
  if (mbx) {
    api("/api/mailbox").then(function (r) {
      if (!r.ok) return;
      mbx.innerHTML = '<div class="secthead"><h2>Drafts folders</h2><span class="sub">' + esc(r.note) + "</span></div>" +
        '<div class="panel"><ul class="mbx">' + (r.drafts.length ? r.drafts.map(function (d) {
          return "<li><b>" + esc(d.subject) + "</b> <span class=\"sub\">in " + esc(d.account) + ", to " + esc(d.to) + "</span></li>";
        }).join("") : "<li class=\"sub\">Empty. Approve a draft above and it lands here, unsent.</li>") + "</ul></div>";
    });
  }
})();
