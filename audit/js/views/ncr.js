// One NCR: the F-HSE-0003 content, and the follow-up until it is closed.
import * as S from "../store.js";
import * as M from "../model.js";
import { setTitle, setActions, go, link } from "../app.js";
import { esc, ICON, fmtDate, toast, todayISO, debounce } from "../ui.js";
import { sevChip, ncrChip, repChip } from "../components.js";
import { photoStrip, editNCR } from "../widgets.js";

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
  setActions(`<a class="btn sm" href="${a ? link("report", a.id, n.module) + "?type=ncr&ncr=" + n.id : "#"}">${ICON.print}<span>NCR form</span></a>${canEditBody ? `<button class="btn sm" id="edit" type="button">${ICON.edit}<span>Edit NCR</span></button>` : ""}`);
  const ed = document.getElementById("edit"); if (ed) ed.onclick = async () => { const r = await editNCR(a, n); if (r === "deleted") go(link("ncrs")); else if (r) location.reload(); };
  const save = debounce(async () => { n = await S.put({ ...n }); }, 400);
  const prev = n.repeat_of ? S.getAny(n.repeat_of) : null;
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
      ${prev ? `<p class="small" style="margin-top:12px">Repeated from <a href="${link("ncr", prev.id, n.module)}">${esc(prev.ref)}</a>, still open at this audit.</p>` : ""}
      ${next ? `<p class="small" style="margin-top:12px">Not closed by the next audit. Raised again as <a href="${link("ncr", next.id, n.module)}">${esc(next.ref)}</a>.</p>` : ""}
    </section>
    <section class="panel"><div class="panel-h"><h2>Non-conformity</h2><span class="muted">${esc(n.clause || d.ncrClause)}</span></div>
      <p class="muted" style="font-style:italic">${esc(n.requirement || d.ncrRequirement)}</p>
      <div class="panel-h" style="margin-top:14px"><h3>Corrective / preventive action required</h3></div><p>${esc(n.action_required || "–")}</p>
      <div class="panel-h" style="margin-top:14px"><h3>Photos from the audit</h3></div><div id="ph"></div>
    </section>
    <section class="panel"><div class="panel-h"><h2>Follow up</h2><span class="muted">Filled by the auditor when the project sends evidence</span></div>
      <div class="stack">
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
  photoStrip(view.querySelector("#caph"), n.ca_photos || [], { readOnly: !canFollow, onChange: ids => { n.ca_photos = ids; save(); }, label: "Add evidence" });
  if (!canFollow) view.querySelectorAll("[data-f]").forEach(i => { i.disabled = true; });
  view.addEventListener("input", e => { const f = e.target.closest("[data-f]"); if (!f) return; n[f.dataset.f] = f.value; save(); });
  const drawBtns = () => {
    const b = view.querySelector("#stbtns");
    if (!canFollow || n.status === "Carried") { b.innerHTML = ""; return; }
    b.innerHTML = n.status === "Closed"
      ? `<span class="chip st-closed">Closed ${esc(fmtDate(n.ca_date))}</span><button class="btn sm ghost" type="button" id="reopen">Reopen</button>`
      : `<button class="btn primary" type="button" id="close">${ICON.check}<span>Mark as closed</span></button>`;
    const c = view.querySelector("#close");
    if (c) c.onclick = async () => {
      if (!n.ca_text) { toast("Write the corrective action taken first.", "error"); view.querySelector("[data-f=ca_text]").focus(); return; }
      const me = M.me();
      n = await S.put({ ...n, status: "Closed", ca_date: n.ca_date || todayISO(), followup_name: n.followup_name || me.name, followup_position: n.followup_position || me.position || "", followup_date: todayISO() });
      toast("NCR closed.", "ok"); render(ctx);
    };
    const r = view.querySelector("#reopen"); if (r) r.onclick = async () => { n = await S.put({ ...n, status: "Open" }); render(ctx); };
  };
  drawBtns();
}
