// One NCR: the F-HSE-0003 content, and the follow-up until it is closed.
import * as S from "../store.js";
import * as M from "../model.js";
import { setTitle, setActions, go, link } from "../app.js";
import { esc, ICON, fmtDate, toast, todayISO, debounce, dialog } from "../ui.js";
import { sigBlockHTML, mountSigPads, readSigPads, serverSigsHTML } from "../sign.js";
import { sevChip, ncrChip, repChip } from "../components.js";
import { photoStrip, editNCR, projectLink } from "../widgets.js";

export async function render(ctx) {
  const { view } = ctx;
  let n = S.get(ctx.id);
  if (!n) { setTitle("NCR not found"); view.innerHTML = `<div class="empty"><h3>This NCR isn't on this device</h3><a class="btn" href="${link("ncrs")}">NCR register</a></div>`; return; }
  if (n.module !== ctx.module) { go(link("ncr", n.id, n.module)); return; }
  const d = M.def(n.module);
  const a = S.get(n.audit_id);
  const p = M.project(n.project_id);
  const canFollow = M.canEdit();
  const canEditBody = M.canEdit() && a && (a.status === "draft" || M.isAdmin());
  setTitle(n.ref, `NCR · ${p.name}`);
  setActions(`<a class="btn sm" href="${a ? link("report", a.id, n.module) + "?type=ncr&ncr=" + n.id : "#"}">${ICON.print}<span>NCR form</span></a>${canFollow ? `<button class="btn sm" id="plink" type="button">${ICON.ext}<span>Project link</span></button>` : ""}${canEditBody ? `<button class="btn sm" id="edit" type="button">${ICON.edit}<span>Edit NCR</span></button>` : ""}`);
  const pl = document.getElementById("plink"); if (pl) pl.onclick = () => projectLink(n.module, n.project_id);
  const ed = document.getElementById("edit"); if (ed) ed.onclick = async () => { const r = await editNCR(a, n); if (r === "deleted") go(link("ncrs")); else if (r) location.reload(); };
  const save = debounce(async () => { n = await S.put({ ...n }); }, 400);
  const prev = (n.repeat_of || n.repeat_link) ? S.getAny(n.repeat_of || n.repeat_link) : null;
  const next = n.carried_to ? S.getAny(n.carried_to) : null;
  view.className = "view narrow";
  view.innerHTML = `<div class="stack">
    <section class="panel">
      <div class="row" style="gap:8px;margin-bottom:10px">${sevChip(n.severity)}${repChip(n)}${ncrChip(n)}<span class="chip">${esc(n.classification)}</span></div>
      <h2 style="font-size:22px;margin-bottom:6px">${esc(n.description)}</h2>
      <div class="grid3" style="margin-top:14px;font-size:14px">
        <div><span class="muted">Project</span><br><b>${esc(p.name)}</b><br><span class="muted small">${esc(p.code)}</span></div>
        <div><span class="muted">Location</span><br><b>${esc(n.location || "–")}</b></div>
        <div><span class="muted">Audit</span><br>${a ? `<a href="${link("audit", a.id, n.module)}"><b>${esc(a.ref)}</b></a>` : "–"}<br><span class="muted small">${esc(fmtDate(n.date))}</span></div>
        <div><span class="muted">Responsible</span><br><b>${esc(n.responsible_name || "–")}</b><br><span class="muted small">${esc(n.responsible_position || "")}</span></div>
        <div><span class="muted">Deadline</span><br><b>${esc(fmtDate(n.due_date) || "–")}</b></div>
        <div><span class="muted">Root causes</span><br><b>${esc([...(n.root_causes || []), n.other_cause].filter(Boolean).join(", ") || "–")}</b></div>
      </div>
      ${prev ? `<p class="small" style="margin-top:12px">Repeated from <a href="${link("ncr", prev.id, n.module)}">${esc(prev.ref)}</a>${n.repeat_of ? ", still open at this audit" : ` (${esc(prev.status)} then found again)`}.</p>` : ""}${n.repeated && n.repeat_notice ? `<p class="small">Notice ref.: ${esc(n.repeat_notice)}</p>` : ""}${n.repeated && n.repeat_verified ? `<p class="small">Verification: ${esc(n.repeat_verified)}</p>` : ""}
      ${next ? `<p class="small" style="margin-top:12px">Not closed by the next audit. Raised again as <a href="${link("ncr", next.id, n.module)}">${esc(next.ref)}</a>.</p>` : ""}
    </section>
    <section class="panel"><div class="panel-h"><h2>Non-conformity</h2><span class="muted">${esc(n.clause || d.ncrClause)}</span></div>
      <p class="muted" style="font-style:italic">${esc(n.requirement || d.ncrRequirement)}</p>
      <div class="panel-h" style="margin-top:14px"><h3>Corrective / preventive action required</h3></div><p>${esc(n.action_required || "–")}</p>
      <div class="panel-h" style="margin-top:14px"><h3>Photos from the audit</h3></div><div id="ph"></div>
    </section>
    <section class="panel"><div class="panel-h"><h2>Follow up</h2><span class="muted">Filled by the project through its link, or by the auditor</span></div>
      <div class="stack">
        ${n.submitted_by ? `<p class="small" style="background:#e1ecfb;border-radius:8px;padding:8px 10px;margin:0">Evidence sent from the project link by <b>${esc(n.submitted_by.name || "")}</b>${n.submitted_by.position ? ` (${esc(n.submitted_by.position)})` : ""}${n.submitted_by.at ? ` on ${esc(fmtDate(n.submitted_by.at.slice(0, 10)))}` : ""}.${(n.sigs || {}).responsible && n.sigs.responsible.img ? " Signed as the person responsible." : ""}</p>` : ""}
        <div id="sigrec"></div>
        <label class="fld"><span>Corrective action taken</span><textarea data-f="ca_text" placeholder="What the project did">${esc(n.ca_text || "")}</textarea></label>
        <label class="fld"><span>Evidence photos</span><div id="caph"></div></label>
        <div class="grid3">
          <label class="fld"><span>Corrective action date</span><input type="date" data-f="ca_date" value="${esc(n.ca_date || "")}"></label>
          <label class="fld"><span>Followed up by</span><input data-f="followup_name" value="${esc(n.followup_name || "")}" placeholder="Name"></label>
          <label class="fld"><span>Position</span><input data-f="followup_position" value="${esc(n.followup_position || "")}"></label>
        </div>
        <label class="fld"><span>Comments</span><input data-f="comments" value="${esc(n.comments || "")}"></label>
        <div class="row" id="stbtns"></div>
      </div>
    </section>
  </div>`;
  photoStrip(view.querySelector("#ph"), n.photos, { readOnly: true });
  photoStrip(view.querySelector("#caph"), n.ca_photos || [], { readOnly: !canFollow || n.status === "Closed" || n.status === "Review", onChange: ids => { n.ca_photos = ids; save(); }, label: "Add evidence" });
  if (!canFollow || n.status === "Closed" || n.status === "Review") view.querySelectorAll("[data-f]").forEach(i => { i.disabled = true; });
  view.addEventListener("input", e => { const f = e.target.closest("[data-f]"); if (!f) return; n[f.dataset.f] = f.value; save(); });
  // Closure flow (P-20 7.10): project evidence -> under review -> auditor approves with signature, or returns with a reason.
  const askReason = (title, ok) => dialog({
    title, body: `<label class="fld"><span>Reason (recorded in the history)</span><textarea id="rs" placeholder="Why?"></textarea></label>`,
    actions: [{ label: "Cancel", value: null }, { label: ok, kind: "primary", validate: w => (w.querySelector("#rs").value.trim().length < 3 ? "Write a short reason." : null), value: w => w.querySelector("#rs").value.trim() }],
  });
  const drawBtns = () => {
    const b = view.querySelector("#stbtns");
    if (!canFollow || n.status === "Carried") { b.innerHTML = ""; return; }
    const note = n.return_reason && n.status === "Open" ? `<span class="small" style="color:var(--g-red)">Returned: ${esc(n.return_reason)}</span>` : "";
    b.innerHTML = n.status === "Closed"
      ? `<span class="chip st-closed">Closed ${esc(fmtDate(n.ca_date))}</span>${n.closed_by ? `<span class="small muted">approved by ${esc(n.closed_by)}</span>` : ""}<button class="btn sm ghost" type="button" id="reopen">Reopen</button>`
      : n.status === "Review"
        ? `<span class="chip st-review">Evidence under review</span><button class="btn primary" type="button" id="approve">${ICON.check}<span>Approve and close</span></button><button class="btn" type="button" id="return">Return to project</button>`
        : `${note}<button class="btn primary" type="button" id="review">${ICON.check}<span>Send evidence for review</span></button>`;
    const rv = view.querySelector("#review");
    if (rv) rv.onclick = async () => {
      if (!n.ca_text) { toast("Write the corrective action taken first.", "error"); view.querySelector("[data-f=ca_text]").focus(); return; }
      if (!(n.ca_photos || []).length) { toast("Add at least one evidence photo (P-20 7.10).", "error"); return; }
      const me = M.me();
      n = await S.put({ ...n, status: "Review", ca_date: n.ca_date || todayISO(), received_at: new Date().toISOString(), received_by: me.name, return_reason: "" });
      toast("Sent for review.", "ok"); render(ctx);
    };
    const ap = view.querySelector("#approve");
    if (ap) ap.onclick = async () => {
      const me = M.me();
      const old = (n.sigs || {}).approver || {};
      const seed = { ...n, sigs: { ...(n.sigs || {}), approver: { ...old, name: old.name || me.name, date: todayISO() } } };
      const r = await dialog({
        title: "Approve and close this NCR", wide: true,
        body: `<p class="small muted">Check the evidence first. Your signature confirms the NCR is closed.</p>${sigBlockHTML(seed, ["approver"])}`,
        onMount: w => mountSigPads(w, seed),
        actions: [{ label: "Cancel", value: null }, { label: "Approve and close", kind: "primary",
          validate: w => { const box = w.querySelector("[data-sig=approver]"); return !box._drawn && !old.img ? "Sign in the box first." : null; },
          value: w => readSigPads(w, seed) }],
      });
      if (!r) return;
      n = await S.put({ ...n, sigs: r, status: "Closed", closed_by: me.name, closed_at: new Date().toISOString(), followup_name: n.followup_name || me.name, followup_position: n.followup_position || me.position || "", followup_date: todayISO(), return_reason: "" });
      toast("NCR approved and closed.", "ok"); render(ctx);
    };
    const rt = view.querySelector("#return");
    if (rt) rt.onclick = async () => {
      const why = await askReason("Return evidence to the project", "Return"); if (!why) return;
      n = await S.put({ ...n, status: "Open", return_reason: why }); toast("Returned to the project.", "ok"); render(ctx);
    };
    const r = view.querySelector("#reopen");
    if (r) r.onclick = async () => {
      const why = await askReason("Reopen this NCR", "Reopen"); if (!why) return;
      n = await S.put({ ...n, status: "Open", reopen_reason: why, closed_by: "", closed_at: "" }); render(ctx);
    };
  };
  drawBtns();
  serverSigsHTML(n.id).then(h => { const el = view.querySelector("#sigrec"); if (el && h) el.innerHTML = h; });
}
