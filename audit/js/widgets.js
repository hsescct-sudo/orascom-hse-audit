// Shared editors: start an audit, photo strip, NCR form, good practice form.
import * as S from "./store.js";
import * as M from "./model.js";
import { go, link } from "./app.js";
import { esc, dialog, confirmBox, toast, todayISO, addDays, shrinkImage, photoInputs, lightbox, ICON } from "./ui.js";
import { projectOptions, optionList } from "./components.js";
import { ROOT_CAUSES, SEVERITIES } from "./templates.js";

// ---------- start an audit ----------
export async function startAudit(module, { project_id = "", plan_id = "" } = {}) {
  const d = M.def(module);
  const me = M.me();
  const team = M.auditors();
  const plan = plan_id ? S.get(plan_id) : null;
  const body = `
    <label class="fld"><span>Project</span><select id="na-p" required>${projectOptions(project_id || (plan && plan.project_id) || "", { all: "Choose the project", list: M.activeProjects() })}</select></label>
    <div class="grid2">
      <label class="fld"><span>${esc(d.short)} date</span><input id="na-d" type="date" value="${todayISO()}" required></label>
      <label class="fld"><span>Lead auditor</span><select id="na-l">${team.map(m => `<option value="${esc(m.id)}" ${(plan ? plan.lead_id : me.id) === m.id ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</select></label>
    </div>
    <fieldset class="fld" style="border:0;padding:0;margin:0"><span>Audit team (optional)</span>
      <div class="row">${team.map(m => `<label class="tick"><input type="checkbox" value="${esc(m.id)}" ${(plan && (plan.team_ids || []).includes(m.id)) ? "checked" : ""}>${esc(m.name)}</label>`).join("")}</div></fieldset>
    <p class="muted small" id="na-hint"></p>`;
  const res = await dialog({
    title: d.id === "full" ? "Start an HSE audit" : "Start a lifting assessment", body, wide: true,
    actions: [{ label: "Cancel", value: null }, {
      label: "Start the audit", kind: "primary",
      validate: w => (!w.querySelector("#na-p").value ? "Choose the project." : !w.querySelector("#na-d").value ? "Enter the date." : null),
      value: w => ({ project_id: w.querySelector("#na-p").value, date: w.querySelector("#na-d").value, lead_id: w.querySelector("#na-l").value, team: [...w.querySelectorAll(".tick input:checked")].map(i => i.value) }),
    }],
    onMount: w => {
      const hint = () => {
        const pid = w.querySelector("#na-p").value; if (!pid) { w.querySelector("#na-hint").textContent = ""; return; }
        const last = M.lastAuditOf(module, pid);
        const open = last ? M.auditNCRs(last).filter(n => n.status === "Open").length : 0;
        const what = d.id === "full" ? "HSE audit" : "lifting assessment";
        w.querySelector("#na-hint").textContent = last ? `Last ${what} on this project: ${last.ref} (${last.date}). ${open ? `${open} NCR${open > 1 ? "s are" : " is"} still open; you will check ${open > 1 ? "them" : "it"} on site.` : "All its NCRs are closed."}` : `This is the first ${what} on this project.`;
      };
      w.querySelector("#na-p").addEventListener("change", hint); hint();
    },
  });
  if (!res) return null;
  const proj = M.project(res.project_id);
  const number = M.nextAuditNumber(module, proj.id);
  const lead = M.member(res.lead_id) || me;
  const people = [lead, ...res.team.filter(id => id !== lead.id).map(id => M.member(id)).filter(Boolean)];
  let planItem = plan;
  if (!planItem) {
    const year = +res.date.slice(0, 4), month = +res.date.slice(5, 7);
    planItem = M.plans(module).filter(p => p.project_id === proj.id && p.year === year && !p.audit_id).sort((a, b) => Math.abs(a.month - month) - Math.abs(b.month - month))[0] || null;
  }
  const audit = await S.put({
    id: S.uid("aud"), kind: "audit", module, project_id: proj.id, plan_id: planItem ? planItem.id : "", ref: M.auditRef(d, proj, number), number, date: res.date,
    status: "draft", lead_id: lead.id, created_by: me.id,
    auditors: people.map(m => ({ name: m.name, position: m.position || "Corporate HSE Auditor" })),
    attendees: [{ name: "", position: "Project Manager" }, { name: "", position: "HSE Manager" }],
    manpower: "", completion: "", opening: "", siteTour: "", closeMeeting: "", summary: "",
    ratings: {}, notes: {}, photos: [], carry: [],
    equipment: d.hasEquipment ? d.equipment.map(e => ({ ...e, count: "" })) : [],
  });
  if (planItem) await S.put({ ...planItem, audit_id: audit.id });
  go(link("audit", audit.id, module));
  return audit;
}

// ---------- photo strip ----------
// Renders thumbnails for photo ids and lets the user add/remove. onChange(ids) is called after each change.
export function photoStrip(el, ids, { onChange, readOnly = false, max = 12, label = "Add photo" } = {}) {
  let list = [...(ids || [])];
  async function draw() {
    const thumbs = await Promise.all(list.map(async id => ({ id, url: await S.photoURL(id) })));
    el.innerHTML = `<div class="photos">${thumbs.map((t, i) => `<div class="ph" data-i="${i}" style="${t.url ? `background-image:url('${t.url}')` : ""}" role="button" aria-label="Photo ${i + 1}" tabindex="0">${t.url ? "" : `<span class="small muted" style="display:grid;place-items:center;height:100%;padding:4px;text-align:center">On another device</span>`}${readOnly ? "" : `<button type="button" data-del="${i}" aria-label="Remove photo">${ICON.x}</button>`}</div>`).join("")}
      ${readOnly || list.length >= max ? "" : photoInputs("photo-btn", `data-add accept="image/*"`, label)}</div>`;
  }
  el.addEventListener("click", async e => {
    const del = e.target.closest("[data-del]");
    if (del) { e.stopPropagation(); list.splice(+del.dataset.del, 1); await draw(); onChange && onChange([...list]); return; }
    const ph = e.target.closest(".ph");
    if (ph) { const urls = (await Promise.all(list.map(id => S.photoURL(id)))).filter(Boolean); lightbox(urls, +ph.dataset.i); }
  });
  el.addEventListener("change", async e => {
    const inp = e.target.closest("input[type=file]"); if (!inp) return;
    const files = [...inp.files].slice(0, max - list.length);
    inp.value = "";
    for (const f of files) {
      try { const blob = await shrinkImage(f, 1600, 0.8); const id = await S.putPhoto(blob); list.push(id); }
      catch (err) { toast(err.message, "error"); }
    }
    await draw(); onChange && onChange([...list]);
  });
  draw();
  return { get: () => [...list] };
}

// ---------- NCR form ----------
export async function editNCR(audit, ncr = null, { item_id = "" } = {}) {
  const d = M.def(audit.module);
  const isNew = !ncr;
  const seq = isNew ? M.auditNCRs(audit).reduce((m, n) => Math.max(m, n.seq || 0), 0) + 1 : ncr.seq;
  const n = ncr ? { ...ncr } : {
    id: S.uid("ncr"), kind: "ncr", module: audit.module, audit_id: audit.id, project_id: audit.project_id, seq, ref: `${audit.ref}-${String(seq).padStart(2, "0")}`,
    date: audit.date, severity: "Minor", repeated: false, classification: "", item_id, clause: d.ncrClause, requirement: d.ncrRequirement,
    description: "", location: "", root_causes: [], other_cause: "", action_required: "Correct the condition, find the root cause and stop it happening again. Send evidence photos.",
    photos: [], responsible_name: "", responsible_position: "", due_date: addDays(audit.date, M.DUE_DAYS.Minor), status: "Open",
    ca_text: "", ca_date: "", followup_name: "", followup_position: "", followup_date: "", comments: "",
  };
  const items = d.parts.flatMap(p => p.items.map(it => ({ ...it, part: p })));
  let photoCtl = null;
  const body = `
    <div class="sev-pick" role="radiogroup" aria-label="NCR type">${SEVERITIES.map(s => `<label class="s-${s}"><input type="radio" name="sev" value="${s}" ${n.severity === s ? "checked" : ""}><b>${s}</b><small>${s === "Serious" ? "Stop work / immediate · −15% once" : s === "Major" ? `Close in ${M.DUE_DAYS.Major} days` : `Close in ${M.DUE_DAYS.Minor} days`}</small></label>`).join("")}</div>
    ${n.repeated ? `<p class="chip rep" style="justify-self:start">Repeated from the last audit · −${d.deductions.repeated}%</p>` : ""}
    <label class="fld"><span>What did you see?</span><textarea id="nc-desc" placeholder="Describe the non-conformity as seen on site">${esc(n.description)}</textarea></label>
    <div class="grid2">
      <label class="fld"><span>NCR classification</span><select id="nc-cls">${optionList(d.ncrClasses, n.classification, "Choose…")}</select></label>
      <label class="fld"><span>Location</span><input id="nc-loc" value="${esc(n.location)}" placeholder="Area, building, level"></label>
    </div>
    <label class="fld"><span>Photos</span><div id="nc-ph"></div></label>
    <fieldset class="fld" style="border:0;padding:0;margin:0"><span>Root causes</span><div class="row">${ROOT_CAUSES.map(r => `<label class="tick"><input type="checkbox" value="${esc(r)}" ${(n.root_causes || []).includes(r) ? "checked" : ""}>${esc(r)}</label>`).join("")}</div>
      <input class="inp" id="nc-other" placeholder="Other cause (optional)" value="${esc(n.other_cause || "")}" style="margin-top:6px"></fieldset>
    <label class="fld"><span>Corrective / preventive action required</span><textarea id="nc-act">${esc(n.action_required)}</textarea></label>
    <div class="grid3">
      <label class="fld"><span>Responsible name</span><input id="nc-rn" value="${esc(n.responsible_name)}"></label>
      <label class="fld"><span>Responsible position</span><input id="nc-rp" value="${esc(n.responsible_position)}"></label>
      <label class="fld"><span>Deadline</span><input id="nc-due" type="date" value="${esc(n.due_date)}"></label>
    </div>
    <details><summary class="muted" style="cursor:pointer;font-weight:600">Clause and appraisal item</summary>
      <div class="stack" style="margin-top:10px">
        <div class="grid2">
          <label class="fld"><span>Standard clause</span><input id="nc-cl" value="${esc(n.clause || "")}"></label>
          <label class="fld"><span>Appraisal item (optional)</span><select id="nc-it"><option value="">None</option>${items.map(it => `<option value="${esc(it.id)}" ${it.id === n.item_id ? "selected" : ""}>${esc(it.part.code)} · ${esc(it.title)}</option>`).join("")}</select></label>
        </div>
        <label class="fld"><span>Requirement</span><textarea id="nc-req">${esc(n.requirement || d.ncrRequirement)}</textarea></label>
      </div></details>`;
  const res = await dialog({
    title: isNew ? `New NCR · ${n.ref}` : `NCR ${n.ref}`, body, wide: true,
    actions: [
      ...(isNew ? [] : [{ label: "Delete NCR", kind: "ghost", value: "delete" }]),
      { label: "Cancel", value: null },
      { label: isNew ? "Save NCR" : "Save changes", kind: "primary", validate: w => (!w.querySelector("#nc-desc").value.trim() ? "Describe what you saw." : !w.querySelector("#nc-cls").value ? "Choose the NCR classification." : null),
        value: w => ({
          severity: (w.querySelector("input[name=sev]:checked") || {}).value || "Minor",
          description: w.querySelector("#nc-desc").value.trim(), classification: w.querySelector("#nc-cls").value, location: w.querySelector("#nc-loc").value.trim(),
          root_causes: [...w.querySelectorAll("fieldset .tick input:checked")].map(i => i.value), other_cause: w.querySelector("#nc-other").value.trim(),
          action_required: w.querySelector("#nc-act").value.trim(), responsible_name: w.querySelector("#nc-rn").value.trim(), responsible_position: w.querySelector("#nc-rp").value.trim(),
          due_date: w.querySelector("#nc-due").value, clause: w.querySelector("#nc-cl").value.trim(), item_id: w.querySelector("#nc-it").value, requirement: w.querySelector("#nc-req").value.trim(),
        }) },
    ],
    onMount: w => {
      photoCtl = photoStrip(w.querySelector("#nc-ph"), n.photos, { label: "Add photo" });
      w.querySelectorAll("input[name=sev]").forEach(r => r.addEventListener("change", () => { w.querySelector("#nc-due").value = addDays(audit.date, M.DUE_DAYS[r.value]); }));
    },
  });
  if (!res) return null;
  if (res === "delete") {
    const ok = await confirmBox(`Delete NCR ${n.ref}? This can't be undone.`, { title: "Delete NCR", ok: "Delete", danger: true });
    if (!ok) return null;
    if (n.repeat_of) {
      const old = S.get(n.repeat_of); if (old) await S.put({ ...old, status: "Open", carried_to: "" });
      const a = S.get(audit.id); if (a) await S.put({ ...a, carry: (a.carry || []).filter(c => c.ncr_id !== n.repeat_of) });
    }
    await S.remove(n.id); toast("NCR deleted."); return "deleted";
  }
  const saved = await S.put({ ...n, ...res, photos: photoCtl ? photoCtl.get() : n.photos });
  toast(isNew ? `NCR ${saved.ref} saved.` : "NCR saved.", "ok");
  return saved;
}

// ---------- good practice ----------
export async function editGood(audit, gp = null) {
  const d = M.def(audit.module);
  const g = gp ? { ...gp } : { id: S.uid("gp"), kind: "good", module: audit.module, audit_id: audit.id, project_id: audit.project_id, date: audit.date, subject: "", classification: "", example: "", photos: [] };
  let photoCtl = null;
  const res = await dialog({
    title: gp ? "Good practice" : "New good practice", wide: true,
    body: `<div class="grid2"><label class="fld"><span>Subject</span><input id="gp-s" value="${esc(g.subject)}" placeholder="Short title"></label>
      <label class="fld"><span>Classification</span><select id="gp-c">${optionList(d.goodClasses, g.classification, "Choose…")}</select></label></div>
      <label class="fld"><span>Example of good practice</span><textarea id="gp-e">${esc(g.example)}</textarea></label>
      <label class="fld"><span>Photos</span><div id="gp-ph"></div></label>`,
    actions: [...(gp ? [{ label: "Delete", kind: "ghost", value: "delete" }] : []), { label: "Cancel", value: null }, {
      label: "Save", kind: "primary", validate: w => (!w.querySelector("#gp-s").value.trim() ? "Enter a subject." : null),
      value: w => ({ subject: w.querySelector("#gp-s").value.trim(), classification: w.querySelector("#gp-c").value, example: w.querySelector("#gp-e").value.trim() }),
    }],
    onMount: w => { photoCtl = photoStrip(w.querySelector("#gp-ph"), g.photos); },
  });
  if (!res) return null;
  if (res === "delete") { await S.remove(g.id); toast("Good practice deleted."); return "deleted"; }
  return S.put({ ...g, ...res, photos: photoCtl ? photoCtl.get() : g.photos });
}
