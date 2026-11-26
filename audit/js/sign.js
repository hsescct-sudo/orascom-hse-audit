// Signature pads for the NCR form (F-HSE-0003) and the change log view.
import * as S from "./store.js";
import { esc, fmtDate } from "./ui.js";

// The four signature blocks on the NCR form. "approver" is the auditor's approval of the closure.
export const SIG_SLOTS = [
  { key: "prepared", label: "Prepared by (Corporate HSE Auditor)" },
  { key: "responsible", label: "Corrective / preventive action responsible" },
  { key: "followup", label: "Follow up for complying by" },
  { key: "approver", label: "Closure approved by (Auditor)" },
];

export function sigBlockHTML(n, only) {
  const s = n.sigs || {};
  return `<fieldset class="fld" style="border:1px solid var(--line);border-radius:10px;padding:10px;margin:0"><span>Signatures</span>
    <div class="grid2">${SIG_SLOTS.filter(sl => !only || only.includes(sl.key)).map(sl => { const v = s[sl.key] || {}; return `<div class="stack" data-sig="${sl.key}" style="gap:4px">
      <b class="small">${esc(sl.label)}</b>
      <input class="inp" data-f="name" placeholder="Name" value="${esc(v.name || "")}">
      <input class="inp" data-f="date" type="date" value="${esc(v.date || "")}">
      <canvas width="320" height="90" style="width:100%;max-width:320px;height:90px;border:1px dashed var(--line);border-radius:6px;background:#fff;touch-action:none"></canvas>
      <div class="row"><button type="button" class="btn sm ghost" data-clear>Clear</button>${v.img ? `<span class="small muted">Signed${v.at ? " " + esc(fmtDate(v.at.slice(0, 10))) : ""}</span>` : ""}</div>
    </div>`; }).join("")}</div></fieldset>`;
}

export function mountSigPads(root, n) {
  const s = n.sigs || {};
  root.querySelectorAll("[data-sig]").forEach(box => {
    const c = box.querySelector("canvas"); const ctx = c.getContext("2d");
    ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.strokeStyle = "#14233b";
    box._drawn = false; box._cleared = false;
    const old = s[box.dataset.sig];
    if (old && old.img) { const im = new Image(); im.onload = () => ctx.drawImage(im, 0, 0, c.width, c.height); im.src = old.img; }
    let down = false;
    const pt = e => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * c.width / r.width, (e.clientY - r.top) * c.height / r.height]; };
    c.addEventListener("pointerdown", e => { down = true; c.setPointerCapture(e.pointerId); const [x, y] = pt(e); ctx.beginPath(); ctx.moveTo(x, y); });
    c.addEventListener("pointermove", e => { if (!down) return; const [x, y] = pt(e); ctx.lineTo(x, y); ctx.stroke(); box._drawn = true; });
    c.addEventListener("pointerup", () => { down = false; });
    box.querySelector("[data-clear]").onclick = () => { ctx.clearRect(0, 0, c.width, c.height); box._drawn = false; box._cleared = true; };
  });
}

export function readSigPads(root, n) {
  const out = { ...(n.sigs || {}) };
  root.querySelectorAll("[data-sig]").forEach(box => {
    const k = box.dataset.sig; const prev = out[k] || {};
    const name = box.querySelector('[data-f="name"]').value.trim();
    const date = box.querySelector('[data-f="date"]').value;
    let img = prev.img || "", at = prev.at || "", by = prev.by || "";
    if (box._cleared && !box._drawn) { img = ""; at = ""; by = ""; }
    if (box._drawn) { img = box.querySelector("canvas").toDataURL("image/png"); at = S.nowISO(); by = S.actor() || ""; }
    out[k] = { name, date, img, at, by };
  });
  return out;
}

// Signature cell for the printed form.
export const sigCell = (n, key) => { const v = (n.sigs || {})[key] || {}; return v.img ? `<img src="${v.img}" alt="Signature" style="height:42px;max-width:160px">` : ""; };

// Change log for one audit and its NCRs (who did what and when).
const fmtWhen = at => { const d = new Date(at); return isNaN(d) ? String(at || "") : d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }); };

// Plain names for the fields people see in the history.
const LABEL = { ca_text: "Corrective action", ca_photos: "Evidence photos", ca_date: "Corrective action date", status: "Status", severity: "NCR type",
  description: "Finding", classification: "Classification", location: "Location", root_causes: "Root causes", other_cause: "Other cause",
  action_required: "Action required", responsible_name: "Responsible", responsible_position: "Responsible position", due_date: "Deadline",
  followup_name: "Followed up by", followup_position: "Follow-up position", followup_date: "Follow-up date", comments: "Comments",
  repeated: "Repeated", repeat_link: "Linked NCR", repeat_notice: "Notice ref.", repeat_verified: "Verification", return_reason: "Return reason",
  reopen_reason: "Reopen reason", closed_by: "Closed by", photos: "Photos", manpower: "Manpower", completion: "Completion %", opening: "Opening meeting",
  siteTour: "Site tour", closeMeeting: "Close meeting", summary: "Summary", attendees: "Attendees", auditors: "Auditors", notes: "Notes", sent: "Report sent",
  date: "Date", carry: "Last audit NCRs", equipment: "Lifting equipment", item_id: "Appraisal item", clause: "Clause", requirement: "Requirement" };
const HIDE = /^(received_at|received_by|closed_at|approved_at|submitted_at|score_snapshot|server_ts|seq|ref|kind|module|audit_id|project_id|id)\b/;
const STATUS = { Open: "Open", Review: "Evidence under review", Closed: "Closed", Carried: "Repeated in next audit", draft: "In progress", submitted: "Waiting approval", approved: "Approved" };
function plain(c) {
  const i = c.indexOf(": "); if (i < 0) return c;
  const k = c.slice(0, i); let v = c.slice(i + 2);
  if (HIDE.test(k)) return null;
  if (k === "status") v = v.split(" → ").map(x => STATUS[x.trim()] || x).join(" → ");
  return `${LABEL[k] || k}: ${v}`;
}
// Everything that happened on one audit: field changes from the change log plus status steps.
export function logsFor(a) {
  const logs = S.all("log").filter(l => l.audit_id === a.id).map(l => ({ at: l.at, by: l.by || "Unknown", rec: l.target_ref || l.target_kind, action: l.action, what: (l.changes || []).map(plain).filter(Boolean).join("; ") }))
    .filter(l => l.action !== "Edited" || l.what);
  const hist = (a.history || []).map(h => ({ at: h.at, by: h.by || "Unknown", rec: a.ref, action: "Status", what: h.what }));
  return [...logs, ...hist].sort((x, y) => String(y.at).localeCompare(String(x.at)));
}

// History tab inside the audit: who did what, with a filter per person.
export function historyViewHTML(a) {
  const rows = logsFor(a);
  const by = {}; rows.forEach(r => { by[r.by] = (by[r.by] || 0) + 1; });
  return `<section class="panel"><div class="panel-h"><h2>Who did what</h2><span class="muted">${rows.length} ${rows.length === 1 ? "entry" : "entries"}</span></div>
    <div class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:12px"><button type="button" class="btn sm primary" data-who="">All <span class="num">${rows.length}</span></button>${Object.entries(by).map(([k, v]) => `<button type="button" class="btn sm" data-who="${esc(k)}">${esc(k)} <span class="num">${v}</span></button>`).join("")}</div>
    <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="text-align:left;border-bottom:2px solid var(--line)"><th style="padding:6px">When</th><th style="padding:6px">Who</th><th style="padding:6px">Record</th><th style="padding:6px">Action</th><th style="padding:6px">What changed</th></tr></thead><tbody>
    ${rows.map(r => `<tr data-by="${esc(r.by)}" style="border-bottom:1px solid var(--line-soft)"><td style="padding:6px;white-space:nowrap">${esc(fmtWhen(r.at))}</td><td style="padding:6px">${esc(r.by)}</td><td style="padding:6px">${esc(r.rec)}</td><td style="padding:6px">${esc(r.action)}</td><td style="padding:6px">${esc(r.what)}</td></tr>`).join("") || `<tr><td colspan="5" class="muted" style="padding:10px">No changes recorded yet.</td></tr>`}
    </tbody></table></div></section>`;
}
export function mountHistory(el) {
  el.querySelectorAll("[data-who]").forEach(b => { b.onclick = () => {
    el.querySelectorAll("[data-who]").forEach(x => x.classList.toggle("primary", x === b));
    el.querySelectorAll("tr[data-by]").forEach(r => { r.hidden = !!b.dataset.who && r.dataset.by !== b.dataset.who; });
  }; });
}

export function changeLogHTML(a) {
  const logs = logsFor(a).map(r => ({ at: r.at, by: r.by, target_ref: r.rec, action: r.action, changes: [r.what] }));
  return `<div class="rep" style="margin-top:20px"><h2 style="font-size:17px">Change log</h2>
    <table><thead><tr><th style="width:150px">When</th><th style="width:150px">Who</th><th style="width:120px">Record</th><th style="width:80px">Action</th><th>What changed</th></tr></thead><tbody>
    ${logs.map(l => `<tr><td>${esc(fmtWhen(l.at))}</td><td>${esc(l.by || "Unknown")}</td><td>${esc(l.target_ref || l.target_kind)}</td><td>${esc(l.action)}</td><td class="small">${esc((l.changes || []).join("; "))}</td></tr>`).join("") || `<tr><td colspan="5">No changes recorded yet.</td></tr>`}
    </tbody></table></div>`;
}
