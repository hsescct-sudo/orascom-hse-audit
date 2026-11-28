// The audit itself: info, last audit NCRs, scoring, NCRs, good practice, photos, finish.
// Everything saves on the device as you type. Works with no internet.
import * as S from "../store.js";
import * as M from "../model.js";
import { setTitle, setActions, go, link } from "../app.js";
import { esc, ICON, debounce, toast, confirmBox, dialog, fmtDate, addDays, todayISO, isTouch } from "../ui.js";
import { tag, mtag, sevChip, ncrChip, repChip, auditChip } from "../components.js";
import { photoStrip, editNCR, editGood, projectLink, linkOf, linkUrl } from "../widgets.js";
import { NA, isRated, fmtScore } from "../scoring.js";
import { historyViewHTML, mountHistory } from "../sign.js";

const QUICK = [100, 90, 80, 70, 60, 50, 0];

export async function render(ctx) {
  const { view } = ctx;
  let a = S.get(ctx.id);
  if (!a) { setTitle("Audit not found"); view.innerHTML = `<div class="empty"><h3>This audit isn't on this device</h3><p>It may have been deleted, or it hasn't arrived from the server yet.</p><a class="btn" href="${link("audits")}">Back to audits</a></div>`; return; }
  if (a.module !== ctx.module) { go(link("audit", a.id, a.module)); return; }
  const d = M.def(a.module);
  const proj = M.project(a.project_id);
  const me = M.me();
  const locked = () => a.status === "approved" || !M.canEdit() || (a.status === "submitted" && !M.mayApprove(a));
  setTitle(a.ref, `${d.short}, ${proj.name}`);

  const stepKey = "oc-audit-step-" + a.id;
  let step = ctx.query.step || sessionStorage.getItem(stepKey) || "info";
  const saveNow = async () => { a = await S.put({ ...a }); };
  const save = debounce(saveNow, 450);

  view.innerHTML = `
    <div class="ed">
      <div class="ed-main" style="min-width:0">
        <div id="lockbar"></div>
        <nav class="steps" id="steps" aria-label="Audit steps"></nav>
        <div id="step"></div>
      </div>
      <aside class="ed-side">
        <div class="livebox" id="live"></div>
        <div class="panel" id="meta"></div>
      </aside>
    </div>
    <div class="dock" id="dock"></div>`;

  const actions = setActions(`<a class="btn sm" href="${link("report", a.id, a.module)}">${ICON.print}<span>Report</span></a>`);
  void actions;

  function steps() {
    const cand = M.carryCandidates(a);
    return [
      { id: "info", label: "Audit info" },
      ...(cand.length ? [{ id: "last", label: "Last audit NCRs" }] : []),
      { id: "score", label: d.scoreStep },
      { id: "ncrs", label: "NCRs" },
      { id: "good", label: "Good practice" },
      { id: "close", label: d.hasMeetings ? "Photos and close meeting" : "Photos and summary" },
      { id: "finish", label: "Finish" },
      { id: "history", label: "History" },
    ];
  }
  function stepDone(id) {
    const sc = M.score(a);
    if (id === "info") return !!(a.manpower && (a.attendees || []).some(p => p.name));
    if (id === "last") { const c = M.carryCandidates(a); return c.length && c.every(n => (a.carry || []).some(x => x.ncr_id === n.id)); }
    if (id === "score") return sc.complete;
    if (id === "ncrs") return M.auditNCRs(a).length > 0;
    if (id === "good") return M.auditGoods(a).length > 0;
    if (id === "close") return d.hasMeetings ? !!a.closeMeeting : !!a.summary;
    if (id === "finish") return M.finished(a);
    return false;
  }
  function drawSteps() {
    const list = steps();
    if (!list.some(s => s.id === step)) step = "info";
    const nav = view.querySelector("#steps");
    nav.innerHTML = list.map((s, i) => `<a href="#" data-step="${s.id}" ${s.id === step ? 'aria-current="step"' : ""} class="${stepDone(s.id) ? "done" : ""}"><span class="n">${stepDone(s.id) ? ICON.check : i + 1}</span>${esc(s.label)}</a>`).join("");
    const cur = nav.querySelector("[aria-current]");
    if (cur && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = cur.offsetLeft - (nav.clientWidth - cur.offsetWidth) / 2;
  }
  view.querySelector("#steps").addEventListener("click", e => { const s = e.target.closest("[data-step]"); if (!s) return; e.preventDefault(); goStep(s.dataset.step); });
  function goStep(id) { step = id; sessionStorage.setItem(stepKey, id); drawSteps(); drawStep(); window.scrollTo({ top: 0 }); }
  const nextStep = () => { const l = steps(); const i = l.findIndex(s => s.id === step); if (i < l.length - 1) goStep(l[i + 1].id); };

  // ---------- live score ----------
  function drawLive() {
    const sc = M.score(a);
    const rows = sc.parts.map(p => `<div><span>${esc(d.id === "full" ? `${p.code} (${p.share}%)` : d.partTitle(p))}</span><b>${fmtScore(p.score == null ? null : p.score * 100)}</b></div>`).join("");
    view.querySelector("#live").innerHTML = `
      ${tag(sc.total, { white: true, sub: sc.complete ? d.scoreLabel : "Live score" })}
      <div class="progress" aria-label="Items rated"><b style="width:${Math.round(100 * sc.ratedCount / sc.itemCount)}%"></b></div>
      <div class="small muted">${sc.ratedCount} of ${sc.itemCount} ${d.binary ? "checks answered" : "items rated"}</div>
      <div class="lb-rows">${rows}
        ${d.countScore ? `<div><span>NCRs raised</span><b>${M.auditNCRs(a).length}</b></div>` : `${sc.base != null ? `<div><span>Before deductions</span><b>${fmtScore(sc.base)}</b></div>` : ""}
        <div><span>Serious NCRs (${sc.seriousCount})</span><b style="color:${sc.serious ? "var(--g-red)" : "inherit"}">${M.minus(sc.serious)}</b></div>
        <div><span>Repeated NCRs (${sc.repeatedCount})</span><b style="color:${sc.repeated ? "var(--g-red)" : "inherit"}">${sc.repeated ? "−" + sc.repeated + "%" : "0"}</b></div>`}
      </div>
      <button class="btn sm ghost" type="button" id="how">How is this calculated?</button>`;
    view.querySelector("#how").onclick = () => howDialog(d, sc);
    view.querySelector("#dock").innerHTML = `${mtag(sc.total)}<span class="d-t">${sc.ratedCount}/${sc.itemCount} rated<br>${sc.seriousCount ? `${sc.seriousCount} serious, ` : ""}${M.auditNCRs(a).length} NCRs</span>${step !== "finish" ? `<button class="btn sm" type="button" id="dock-next">Next</button>` : ""}`;
    const dn = view.querySelector("#dock-next"); if (dn) dn.onclick = nextStep;
    view.querySelectorAll("[data-pscore]").forEach(el => { const p = sc.parts.find(x => x.id === el.dataset.pscore); el.innerHTML = p && p.score != null ? mtag(p.score * 100) : `<span class="muted small">not rated</span>`; });
  }
  function drawMeta() {
    const prev = M.previousAudit(a);
    view.querySelector("#meta").innerHTML = `
      <div class="stack" style="gap:8px;font-size:14px">
        <div class="row" style="justify-content:space-between"><b>${esc(a.ref)}</b>${auditChip(a)}</div>
        <div><span class="muted">Project</span><br><b>${esc(proj.name)}</b><br><span class="muted small">${esc(proj.code)}, ${esc(proj.city)}, ${esc(proj.country)}</span></div>
        <div class="row" style="justify-content:space-between"><span class="muted">Date</span><b>${esc(fmtDate(a.date))}</b></div>
        <div class="row" style="justify-content:space-between"><span class="muted">Audit number</span><b>${a.number}</b></div>
        <div class="row" style="justify-content:space-between"><span class="muted">Previous score</span>${prev ? mtag(M.score(prev).total) : '<span class="muted">First audit</span>'}</div>
        ${prev ? `<div class="row" style="justify-content:space-between"><span class="muted">Last audit NCRs corrected</span><b>${M.correctionPct(a)}%</b></div>` : ""}
      </div>`;
  }
  function drawLock() {
    const el = view.querySelector("#lockbar");
    if (a.status === "approved") el.innerHTML = `<div class="panel row" style="margin-bottom:12px;border-color:#bfe3cd;background:#f1faf4">${ICON.lock}<span>Approved${a.approved_at ? " on " + esc(fmtDate(a.approved_at.slice(0, 10))) : ""}${a.approved_by ? " by " + esc(a.approved_by) : ""}. The audit is locked.</span>${M.isAdmin() ? `<button class="btn sm" id="reopen" style="margin-left:auto">Reopen</button>` : ""}</div>`;
    else if (a.status === "submitted") el.innerHTML = `<div class="panel row" style="margin-bottom:12px;border-color:#c7d9f3;background:#f3f7fd"><span>Sent for approval${a.submitted_at ? " on " + esc(fmtDate(a.submitted_at.slice(0, 10))) : ""}.</span>${M.mayApprove(a) ? `<span style="margin-left:auto" class="row"><button class="btn sm" id="return">Return to auditor</button><button class="btn sm primary" id="approve">Approve</button></span>`
      : `<span class="muted">${M.canApprove() ? "You were on this audit, so another administrator or approver approves it." : "An administrator or approver checks it next."}</span>`}</div>`;
    else if (a.return_note && a.status === "draft") el.innerHTML = `<div class="panel" style="margin-bottom:12px;border-color:#f1d27a;background:#fff8e1"><b>Returned${a.returned_by ? " by " + esc(a.returned_by) : ""}${a.returned_at ? " on " + esc(fmtDate(a.returned_at.slice(0, 10))) : ""}.</b> ${esc(a.return_note)}</div>`;
    else el.innerHTML = "";
    const ro = el.querySelector("#reopen"); if (ro) ro.onclick = async () => { if (await confirmBox("The audit goes back to 'In progress' so it can be changed. The change is recorded.", { title: "Reopen this audit?", ok: "Reopen" })) { a.status = "draft"; a.history = [...(a.history || []), { at: new Date().toISOString(), by: me.name, what: "Reopened" }]; await saveNow(); rerenderAll(); } };
    const rt = el.querySelector("#return"); if (rt) rt.onclick = async () => {
      const note = await dialog({ title: "Return to the auditor", body: `<label class="fld"><span>What needs to change</span><textarea id="rt-n" rows="4"></textarea></label>`,
        actions: [{ label: "Cancel", value: null }, { label: "Return", kind: "primary", validate: w => (w.querySelector("#rt-n").value.trim() ? null : "Write what needs to change."), value: w => w.querySelector("#rt-n").value.trim() }] });
      if (!note) return;
      const at = new Date().toISOString();
      a.status = "draft"; a.return_note = note; a.returned_by = me.name; a.returned_at = at;
      a.history = [...(a.history || []), { at, by: me.name, what: `Returned to auditor: ${note}` }];
      await saveNow(); toast("Returned to the auditor."); rerenderAll();
    };
    const ap = el.querySelector("#approve"); if (ap) ap.onclick = () => approve();
  }
  async function approve() {
    if (!M.mayApprove(a)) { toast(M.canApprove() ? "You were on this audit. Another administrator or approver approves it." : "Only an administrator or approver can approve.", "error"); return; }
    const sc = M.score(a);
    if (!sc.complete) { toast("Rate every item (or mark it N/A) before approving.", "error"); return; }
    if (!(await confirmBox(`Approve ${a.ref} with a score of ${fmtScore(sc.total)}? The audit will be locked.`, { title: "Approve audit", ok: "Approve" }))) return;
    a.status = "approved"; a.approved_at = new Date().toISOString(); a.approved_by = me.name; a.score_snapshot = { total: sc.total, base: sc.base, grade: sc.grade.code };
    a.history = [...(a.history || []), { at: a.approved_at, by: me.name, what: `Approved at ${fmtScore(sc.total)}` }];
    await saveNow(); toast("Audit approved. Now e-mail the report to the project.", "ok"); rerenderAll(); goStep("finish");
  }
  function rerenderAll() { drawLock(); drawSteps(); drawStep(); drawLive(); drawMeta(); }

  // ---------- steps ----------
  function drawStep() {
    // a fresh element each time, so listeners from the last step don't pile up
    const old = view.querySelector("#step"); const el = old.cloneNode(false); old.replaceWith(el);
    const ro = locked();
    ({ info: stepInfo, last: stepLast, score: stepScore, ncrs: stepNcrs, good: stepGood, close: stepClose, finish: stepFinish, history: stepHistory }[step] || stepInfo)(el, ro);
    el.classList.toggle("ro", ro);
    if (ro) el.querySelectorAll("input, textarea, select, .rate button, [data-ro], [data-padd], [data-pdel], [data-eadd], [data-edel], [data-ncr]").forEach(x => { if (!x.closest(".allow-ro")) x.disabled = true; });
  }

  function people(listName, title, hint) {
    const list = a[listName] || [];
    return `<section class="panel"><div class="panel-h"><h2>${esc(title)}</h2><span class="muted">${esc(hint)}</span></div>
      <div class="people" data-list="${listName}">${list.map((p, i) => `<div class="pp"><input class="inp" data-pi="${i}" data-pk="name" value="${esc(p.name)}" placeholder="Name" aria-label="Name"><input class="inp" data-pi="${i}" data-pk="position" value="${esc(p.position)}" placeholder="Position" aria-label="Position"><button class="icon-btn" type="button" data-pdel="${i}" aria-label="Remove">${ICON.trash}</button></div>`).join("")}</div>
      <button class="btn sm ghost" type="button" data-padd="${listName}" style="margin-top:8px">${ICON.plus}<span>Add person</span></button></section>`;
  }
  function bindPeople(el) {
    el.addEventListener("input", e => { const i = e.target.closest("[data-pi]"); if (!i || locked()) return; const ln = i.closest("[data-list]").dataset.list; a[ln][+i.dataset.pi][i.dataset.pk] = i.value; save(); });
    el.addEventListener("click", e => {
      const add = e.target.closest("[data-padd]"); const del = e.target.closest("[data-pdel]");
      if ((add || del) && locked()) return;
      if (add) { const ln = add.dataset.padd; a[ln] = [...(a[ln] || []), { name: "", position: "" }]; save(); drawStep(); }
      if (del) { const ln = del.closest("[data-list]").dataset.list; a[ln].splice(+del.dataset.pdel, 1); save(); drawStep(); }
    });
  }
  function bindFields(el) {
    el.addEventListener("input", e => { const f = e.target.closest("[data-f]"); if (!f || locked()) return; a[f.dataset.f] = f.type === "number" ? (f.value === "" ? "" : +f.value) : f.value; save(); });
  }

  function stepInfo(el) {
    el.innerHTML = `<div class="stack">
      <section class="panel">
        <div class="panel-h"><h2>Audit info</h2><span class="muted">${esc(d.reportTitle)}, ${esc(d.formRef)} Rev ${esc(d.formRev)}</span></div>
        ${d.purpose ? `<p class="muted" style="max-width:75ch">${esc(d.purpose)}</p>` : ""}
        <div class="grid3">
          <label class="fld"><span>${esc(d.short)} date</span><input type="date" data-f="date" value="${esc(a.date)}"></label>
          <label class="fld"><span>Current manpower</span><input type="number" inputmode="numeric" min="0" data-f="manpower" value="${esc(a.manpower)}" placeholder="e.g. 850"></label>
          <label class="fld"><span>Progress of completion (%)</span><input type="number" inputmode="numeric" min="0" max="100" data-f="completion" value="${esc(a.completion)}" placeholder="e.g. 45"></label>
        </div>
      </section>
      ${people("auditors", d.peopleLabel, "Name and position")}
      ${d.hasMeetings ? people("attendees", "Key people at the meeting", "From the project team") : ""}
      ${d.hasMeetings ? `<section class="panel"><div class="grid2">
        <label class="fld"><span>Opening meeting</span><textarea data-f="opening" placeholder="Scope, plan, who attended">${esc(a.opening)}</textarea></label>
        <label class="fld"><span>Site tour</span><textarea data-f="siteTour" placeholder="Areas visited and general notes">${esc(a.siteTour)}</textarea></label></div></section>` : ""}
      ${d.hasEquipment ? equipmentPanel() : ""}
      <div class="row"><button class="btn primary lg" type="button" data-next data-ro-ok>Next: ${esc(steps()[1].label)}</button></div>
    </div>`;
    bindFields(el); bindPeople(el);
    el.querySelector("[data-next]").onclick = nextStep;
    if (d.hasEquipment) bindEquipment(el);
  }
  function equipmentPanel() {
    return `<section class="panel"><div class="panel-h"><h2>Lifting equipment on site</h2><span class="muted">Number and ownership</span></div>
      <div class="tscroll"><table class="tbl" id="eq"><thead><tr><th>Equipment</th><th style="width:110px">Number</th><th style="width:150px">Owned / rental</th><th style="width:44px"></th></tr></thead><tbody>
      ${(a.equipment || []).map((e, i) => `<tr><td class="c-full"><input class="inp" data-ei="${i}" data-ek="desc" value="${esc(e.desc)}" aria-label="Equipment"></td><td><input class="inp" type="number" min="0" inputmode="numeric" data-ei="${i}" data-ek="count" value="${esc(e.count)}" aria-label="Number"></td><td><select class="inp" data-ei="${i}" data-ek="owner" aria-label="Ownership">${["Owned", "Rental"].map(o => `<option ${o === e.owner ? "selected" : ""}>${o}</option>`).join("")}</select></td><td><button class="icon-btn" type="button" data-edel="${i}" aria-label="Remove">${ICON.trash}</button></td></tr>`).join("")}
      </tbody></table></div><button class="btn sm ghost" type="button" data-eadd style="margin-top:8px">${ICON.plus}<span>Add equipment</span></button></section>`;
  }
  function bindEquipment(el) {
    el.addEventListener("input", e => { const i = e.target.closest("[data-ei]"); if (!i || locked()) return; a.equipment[+i.dataset.ei][i.dataset.ek] = i.dataset.ek === "count" ? (i.value === "" ? "" : +i.value) : i.value; save(); });
    el.addEventListener("change", e => { const i = e.target.closest("select[data-ei]"); if (!i || locked()) return; a.equipment[+i.dataset.ei].owner = i.value; save(); });
    el.addEventListener("click", e => {
      if (locked()) return;
      if (e.target.closest("[data-eadd]")) { a.equipment = [...(a.equipment || []), { desc: "", count: "", owner: "Owned" }]; save(); drawStep(); }
      const del = e.target.closest("[data-edel]"); if (del) { a.equipment.splice(+del.dataset.edel, 1); save(); drawStep(); }
    });
  }

  // ---------- last audit NCRs ----------
  function stepLast(el) {
    const prev = M.previousAudit(a);
    const cand = M.carryCandidates(a);
    const decided = id => (a.carry || []).find(c => c.ncr_id === id);
    el.innerHTML = `<section class="panel">
      <div class="panel-h"><h2>Open NCRs from the last audit</h2><span class="muted">${esc(prev.ref)}, ${esc(fmtDate(prev.date))}</span></div>
      <p class="muted" style="max-width:75ch">Check each one on site. If it is still not closed, it becomes a <b>repeated NCR</b> in this audit and takes ${esc(M.ruleText(d).repeated)} off the score.</p>
      <div>${cand.map(n => { const c = decided(n.id); return `<div class="carry-row" data-n="${esc(n.id)}">
        <div><div class="row" style="gap:6px">${sevChip(n.severity)}<span class="ref num" style="font-weight:700;color:var(--navy)">${esc(n.ref)}</span><span class="muted small">${esc(n.classification)}</span></div>
          <div style="margin-top:4px">${esc(n.description)}</div><div class="muted small">${esc(n.location || "")}${n.due_date ? `, deadline ${esc(fmtDate(n.due_date))}` : ""}</div></div>
        <div class="seg" role="group" aria-label="Result on site"><button type="button" data-res="closed" aria-pressed="${c && c.result === "closed"}">Closed</button><button type="button" data-res="open" aria-pressed="${c && c.result === "open"}">Still open</button></div>
      </div>`; }).join("")}</div></section>
      <div class="row" style="margin-top:14px"><button class="btn primary lg" type="button" data-next>Next: ${esc(d.scoreStep)}</button></div>`;
    el.querySelector("[data-next]").onclick = nextStep;
    el.addEventListener("click", async e => {
      const b = e.target.closest("[data-res]"); if (!b || locked()) return;
      const nid = b.closest("[data-n]").dataset.n; const old = S.get(nid); if (!old) return;
      const prevDecision = decided(nid);
      if (prevDecision && prevDecision.result === b.dataset.res) return;
      // undo the previous choice
      if (prevDecision && prevDecision.result === "open") { const rep = M.auditNCRs(a).find(n => n.repeat_of === nid); if (rep) await S.remove(rep.id); }
      a.carry = (a.carry || []).filter(c => c.ncr_id !== nid);
      if (b.dataset.res === "closed") {
        await S.put({ ...old, status: "Closed", carried_to: "", ca_date: old.ca_date || a.date, ca_text: old.ca_text || "Found closed at the next audit.", followup_name: old.followup_name || (a.auditors[0] || {}).name || me.name, followup_position: old.followup_position || (a.auditors[0] || {}).position || "", followup_date: a.date });
      } else {
        const seq = M.auditNCRs(a).reduce((m, n) => Math.max(m, n.seq || 0), 0) + 1;
        const rep = await S.put({ ...old, id: S.uid("ncr"), audit_id: a.id, project_id: a.project_id, seq, ref: `${a.ref}-${String(seq).padStart(2, "0")}`, date: a.date, repeated: true, repeat_of: old.id, status: "Open", ca_text: "", ca_date: "", followup_name: "", followup_position: "", followup_date: "", due_date: addDays(a.date, M.DUE_DAYS[old.severity] || 7), created_at: undefined, server_ts: undefined });
        await S.put({ ...S.get(old.id), status: "Carried", carried_to: rep.id });
      }
      a.carry.push({ ncr_id: nid, result: b.dataset.res });
      await saveNow(); drawStep(); drawLive(); drawSteps(); drawMeta();
    });
  }

  // ---------- scoring ----------
  function stepScore(el) {
    const ncrsByItem = {}; for (const n of M.auditNCRs(a)) if (n.item_id) (ncrsByItem[n.item_id] = ncrsByItem[n.item_id] || []).push(n);
    const corr = M.correctionPct(a);
    let k = 0;
    // a check taken off the list shows only in audits that already answered it
    const shown = p => p.items.filter(it => !it.retired || isRated(a.ratings[it.id]));
    el.innerHTML = d.parts.map(p => `
      <div class="part-h"><h2>${esc(d.partTitle(p))}</h2><span class="muted">${d.countScore ? `${shown(p).length} checks` : `${p.share}% of the score`}</span>${d.binary ? `<button class="btn sm ghost" type="button" data-allna="${esc(p.id)}">Not on this site: rest N/A</button>` : ""}<span class="ps" data-pscore="${p.id}"></span></div>
      ${shown(p).map(it => { k++; const v = a.ratings[it.id]; const na = v === NA; return `
      <article class="qcard ${it.critical ? "crit" : ""} ${na ? "is-na" : ""}" data-it="${esc(it.id)}">
        <div class="q-top"><span class="q-id">${esc(String(d.itemNo(it, k)))}</span><div style="min-width:0"><div class="q-title">${esc(it.title)}</div>${it.text ? `<div class="q-text">${esc(it.text)}</div>` : ""}</div>${d.binary ? `<div class="q-w">Risk<b>${esc(it.risk || "")}</b></div>` : `<div class="q-w">Weight<b>${it.weight}</b></div>`}</div>
        <div class="rate">${d.binary ? `
          <div class="quick yn" role="group" aria-label="Answer for ${esc(it.id)}"><button type="button" class="yes" data-q="100" aria-pressed="${v === 100}">Yes</button><button type="button" class="no" data-q="0" aria-pressed="${v === 0}">No</button><button type="button" class="na" data-q="na" aria-pressed="${na}">N/A</button></div>` : `
          <div class="val"><input type="number" inputmode="decimal" min="0" max="100" step="1" value="${typeof v === "number" ? v : ""}" placeholder="${na ? "N/A" : "–"}" aria-label="Rating for ${esc(it.title)} in percent"><span>%</span></div>
          <input type="range" min="0" max="100" step="1" value="${typeof v === "number" ? v : 100}" aria-label="Rating slider for ${esc(it.title)}" ${typeof v === "number" ? "" : 'style="opacity:.35"'}>
          <div class="quick">${QUICK.map(q => `<button type="button" data-q="${q}" aria-pressed="${v === q}">${q}</button>`).join("")}<button type="button" class="na" data-q="na" aria-pressed="${na}">N/A</button></div>`}
        </div>
        <div class="q-foot">
          ${it.critical ? `<span class="chip sev-Serious">Serious violations area</span>` : ""}
          ${it.usesLastAudit && corr != null ? `<span class="chip">Last audit NCRs corrected: ${corr}%</span>` : ""}
          ${(ncrsByItem[it.id] || []).map(n => `${sevChip(n.severity)}`).join("")}
          <button class="btn sm ghost" type="button" data-ncr>${ICON.flag}<span>Raise NCR</span></button>
          <button class="btn sm ghost allow-ro" type="button" data-note>${ICON.edit}<span>${a.notes && a.notes[it.id] ? "Note" : "Add note"}</span></button>
        </div>
        <textarea class="q-note" data-notef ${a.notes && a.notes[it.id] ? "" : "hidden"} placeholder="Evidence, what you checked">${esc((a.notes && a.notes[it.id]) || "")}</textarea>
      </article>`; }).join("")}`).join("") + `<div class="row" style="margin-top:14px"><button class="btn primary lg" type="button" data-next>Next: NCRs</button></div>`;
    el.querySelector("[data-next]").onclick = nextStep;
    const setVal = (card, v) => {
      const id = card.dataset.it;
      if (v === "" || v == null) delete a.ratings[id]; else a.ratings[id] = v;
      card.classList.toggle("is-na", v === NA);
      const num = card.querySelector(".val input"), rng = card.querySelector("input[type=range]");
      if (num && document.activeElement !== num) num.value = typeof v === "number" ? v : "";
      if (num) num.placeholder = v === NA ? "N/A" : "–";
      if (rng) { if (typeof v === "number") { rng.value = v; rng.style.opacity = ""; } else rng.style.opacity = ".35"; }
      card.querySelectorAll("[data-q]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.q === String(v))));
      save(); drawLive(); drawSteps();
    };
    el.addEventListener("click", async e => {
      const all = e.target.closest("[data-allna]");
      if (all && !locked()) {
        const part = d.parts.find(p => p.id === all.dataset.allna);
        const open = part.items.filter(it => !it.retired && !isRated(a.ratings[it.id]));
        if (!open.length) { toast("Every check in this topic is answered."); return; }
        if (!(await confirmBox(`Mark the ${open.length} unanswered check${open.length > 1 ? "s" : ""} in ${part.name} as N/A?`, { title: "Not on this site", ok: "Mark N/A" }))) return;
        open.forEach(it => { a.ratings[it.id] = NA; });
        save(); drawStep(); drawLive(); drawSteps(); return;
      }
      const card = e.target.closest("[data-it]"); if (!card) return;
      const q = e.target.closest("[data-q]");
      if (q && !locked()) {
        const v = q.dataset.q === "na" ? NA : +q.dataset.q;
        const nv = a.ratings[card.dataset.it] === v ? "" : v;
        setVal(card, nv);
        // Flash: a No is a finding. Open the NCR with the check, its topic and its risk filled in.
        if (d.binary && nv === 0 && !ncrsByItem[card.dataset.it]) {
          const it = M.findItem(d, card.dataset.it);
          const r = await editNCR(a, null, { item_id: it.id, severity: (d.riskSeverity || {})[it.risk] || "Minor", classification: it.partName, description: `Not met: ${it.title}` });
          if (r) { drawStep(); drawLive(); drawSteps(); }
        }
        return;
      }
      if (e.target.closest("[data-note]")) { const t = card.querySelector("[data-notef]"); t.hidden = !t.hidden; if (!t.hidden) t.focus(); return; }
      if (e.target.closest("[data-ncr]") && !locked()) { const r = await editNCR(a, null, { item_id: card.dataset.it }); if (r) { drawStep(); drawLive(); drawSteps(); } }
    });
    el.addEventListener("input", e => {
      const card = e.target.closest("[data-it]"); if (!card) return;
      if (e.target.matches(".val input")) { const raw = e.target.value; if (raw === "") return setVal(card, ""); let v = Math.round(+raw); if (!isFinite(v)) return; v = Math.max(0, Math.min(100, v)); setVal(card, v); }
      else if (e.target.matches("input[type=range]")) setVal(card, +e.target.value);
      else if (e.target.matches("[data-notef]")) { a.notes = { ...(a.notes || {}), [card.dataset.it]: e.target.value }; save(); }
    });
    el.addEventListener("change", e => { if (e.target.matches(".val input")) { const v = e.target.value; if (v !== "" && (+v > 100 || +v < 0)) { e.target.value = Math.max(0, Math.min(100, +v)); } } });
    drawLive();
  }

  // ---------- NCRs ----------
  async function stepNcrs(el) {
    const list = M.auditNCRs(a);
    const ro = locked();
    el.innerHTML = `<section class="panel">
      <div class="panel-h"><h2>NCRs in this audit</h2><span class="muted">${list.length} raised, NCR form ${esc(d.ncrFormRef)}</span>${ro ? "" : `<button class="btn primary act" type="button" id="add-ncr">${ICON.plus}<span>Raise NCR</span></button>`}</div>
      ${list.length ? `<div id="ncr-list"></div>` : `<div class="empty"><h3>No NCRs yet</h3><p>Raise an NCR for each violation you see. Add photos from the camera.</p></div>`}
    </section>
    <div class="row" style="margin-top:14px"><button class="btn primary lg" type="button" data-next>Next: Good practice</button></div>`;
    el.querySelector("[data-next]").onclick = nextStep;
    const add = el.querySelector("#add-ncr"); if (add) add.onclick = async () => { const r = await editNCR(a); if (r) { stepNcrs(el); drawLive(); drawSteps(); } };
    if (list.length) {
      const host = el.querySelector("#ncr-list");
      host.innerHTML = (await Promise.all(list.map(async n => {
        const u = n.photos && n.photos[0] ? await S.photoURL(n.photos[0]) : null;
        return `<div class="ncr-card" data-n="${esc(n.id)}" role="button" tabindex="0">
          <div class="thumb" style="${u ? `background-image:url('${u}')` : ""}">${u ? "" : ICON.img}</div>
          <div style="min-width:0"><div class="nc-t">${esc(n.description)}</div>
            <div class="nc-m"><span class="ref num" style="font:700 13px var(--f-cond);color:var(--navy)">${esc(n.ref)}</span>${sevChip(n.severity)}${repChip(n)}<span class="chip">${esc(n.classification)}</span>${n.location ? `<span class="muted small">${esc(n.location)}</span>` : ""}</div></div>
          <div class="small muted nowrap">${n.due_date ? "Due " + esc(fmtDate(n.due_date)) : ""}<br>${ncrChip(n)}</div></div>`;
      }))).join("");
      host.onclick = async e => {
        const c = e.target.closest("[data-n]"); if (!c) return;
        const n = S.get(c.dataset.n);
        if (locked()) { go(link("ncr", n.id, a.module)); return; }
        const r = await editNCR(a, n); if (r) { stepNcrs(el); drawLive(); drawSteps(); }
      };
    }
  }

  // ---------- good practice ----------
  async function stepGood(el) {
    const list = M.auditGoods(a); const ro = locked();
    el.innerHTML = `<section class="panel">
      <div class="panel-h"><h2>Good practice</h2><span class="muted">${list.length} recorded</span>${ro ? "" : `<button class="btn act" type="button" id="add-gp">${ICON.plus}<span>Add good practice</span></button>`}</div>
      ${list.length ? `<div id="gp-list"></div>` : `<div class="empty"><h3>Nothing recorded yet</h3><p>Note what the project does well. It appears in the report and the good practice register.</p></div>`}
    </section><div class="row" style="margin-top:14px"><button class="btn primary lg" type="button" data-next>Next: ${esc(steps().find(s => s.id === "close").label)}</button></div>`;
    el.querySelector("[data-next]").onclick = nextStep;
    const add = el.querySelector("#add-gp"); if (add) add.onclick = async () => { if (await editGood(a)) { stepGood(el); drawSteps(); } };
    if (list.length) {
      const host = el.querySelector("#gp-list");
      host.innerHTML = (await Promise.all(list.map(async g => { const u = g.photos && g.photos[0] ? await S.photoURL(g.photos[0]) : null; return `<div class="ncr-card" data-g="${esc(g.id)}" role="button" tabindex="0"><div class="thumb" style="${u ? `background-image:url('${u}')` : ""}">${u ? "" : ICON.star}</div><div><div class="nc-t">${esc(g.subject)}</div><div class="muted small">${esc(g.example)}</div><div class="nc-m"><span class="chip">${esc(g.classification || "Not classified")}</span></div></div><span></span></div>`; }))).join("");
      host.onclick = async e => { const c = e.target.closest("[data-g]"); if (!c || locked()) return; if (await editGood(a, S.get(c.dataset.g))) { stepGood(el); drawSteps(); } };
    }
  }

  // ---------- photos and close ----------
  function stepClose(el, ro) {
    el.innerHTML = `<div class="stack">
      <section class="panel"><div class="panel-h"><h2>General view</h2><span class="muted">Site photos for the report (up to 6)</span></div><div id="gv"></div></section>
      <section class="panel">${d.hasMeetings
        ? `<label class="fld"><span>Close meeting</span><textarea data-f="closeMeeting" rows="5" placeholder="Main findings shared, deadlines agreed, who attended">${esc(a.closeMeeting)}</textarea></label>`
        : `<label class="fld"><span>Lifting assessment summary</span><textarea data-f="summary" rows="5" placeholder="Overall view of lifting operations on this project">${esc(a.summary)}</textarea></label>`}</section>
      <div class="row"><button class="btn primary lg" type="button" data-next>Next: Finish</button></div></div>`;
    bindFields(el);
    el.querySelector("[data-next]").onclick = nextStep;
    photoStrip(el.querySelector("#gv"), a.photos, { max: 6, readOnly: ro, onChange: ids => { a.photos = ids; save(); }, label: "Add site photo" });
  }

  // ---------- finish ----------
  function stepHistory(el) { el.innerHTML = historyViewHTML(a); mountHistory(el, a); }
  function stepFinish(el) {
    const sc = M.score(a); const list = M.auditNCRs(a);
    const missing = list.filter(n => !n.responsible_name || !n.due_date).length;
    const checks = [
      [sc.complete, `All ${sc.itemCount} items rated or marked N/A`, sc.complete ? "" : `${sc.itemCount - sc.ratedCount} left`, "score"],
      [!!a.manpower, "Manpower entered", "", "info"],
      [d.hasMeetings ? (a.attendees || []).some(p => p.name) : true, "Meeting attendees entered", "", "info"],
      [missing === 0, "Every NCR has a responsible person and a deadline", missing ? `${missing} NCR${missing > 1 ? "s" : ""} missing` : "", "ncrs"],
      [M.carryCandidates(a).every(n => (a.carry || []).some(c => c.ncr_id === n.id)), "Last audit NCRs checked", "", "last"],
      [(a.photos || []).length > 0, "General view photos added", "Optional", "close"],
    ];
    el.innerHTML = `<div class="stack">
      <section class="panel fin-hero">
        ${tag(sc.total, { size: "xl", white: true })}
        <div><h2 style="font-size:24px">${sc.grade ? esc(sc.grade.appraisal) : "Not scored yet"}</h2>
          <p class="muted">${esc(d.scoreLabel)} ${fmtScore(sc.total)}${sc.base != null && (sc.serious || sc.repeated) ? ` (${fmtScore(sc.base)} before deductions)` : ""}. ${list.length} NCR${list.length === 1 ? "" : "s"}: ${["Serious", "Major", "Minor"].map(s => `${list.filter(n => n.severity === s).length} ${s.toLowerCase()}`).join(", ")}${sc.repeatedCount ? `, ${sc.repeatedCount} repeated` : ""}.</p>
          ${sc.grade && d.id === "full" ? `<p class="small muted">HSE evaluation share for this grade: ${sc.grade.bonus}% of the profit share / bonus allocated to HSE.</p>` : ""}</div>
      </section>
      <section class="panel"><div class="panel-h"><h2>Before you send</h2></div>
        <div class="chks">${checks.map(([ok, t, note, st]) => `<div class="chk"><span class="chk-i" style="background:${ok ? "var(--g-green)" : note === "Optional" ? "#c8d2de" : "var(--g-orange)"}">${ok ? ICON.check : "!"}</span><span class="chk-t">${esc(t)}${note && !ok ? `<small>${esc(note)}</small>` : ""}</span>${!ok ? `<button class="btn sm ghost allow-ro" data-go="${st}" type="button">Open</button>` : ""}</div>`).join("")}</div>
      </section>
      <section class="panel"><div class="panel-h"><h2>Reports</h2><span class="muted">Work with no internet too</span></div>
        <div class="row allow-ro">
          <a class="btn" href="${link("report", a.id, a.module)}">${ICON.print}<span>Audit report (PDF)</span></a>
          <a class="btn" href="${link("report", a.id, a.module)}?type=ncr">${ICON.flag}<span>NCR forms (${list.length})</span></a>
          <button class="btn allow-ro" type="button" data-x="xlsx">${ICON.xls}<span>Excel report</span></button>
          <button class="btn allow-ro" type="button" data-x="pptx">${ICON.ppt}<span>PowerPoint</span></button>
        </div></section>
      ${a.status === "submitted" ? `<section class="panel"><div class="panel-h"><h2>Report to the project</h2>${M.sendOverdue(a) ? `<span class="chip st-overdue">Not sent after 7 days</span>` : ""}</div>
        <p class="muted">${M.mayApprove(a) ? "Approve the audit first. Then e-mail the report to the project from here." : "After approval, the administrator or approver e-mails the report to the project."}</p></section>` : ""}
      ${a.status === "approved" ? `<section class="panel allow-ro" id="sentbox"><div class="panel-h"><h2>Report sent to the project (P-20 7.4)</h2>${M.sendOverdue(a) ? `<span class="chip st-overdue">Not sent after 7 days</span>` : ""}</div>
        <p class="muted small">Send F/HSE/078 and F/HSE/003 through Corporate HSE within 7 days of the audit date. Record it here.</p>
        <div class="grid3"><label class="fld"><span>Date sent</span><input type="date" data-sf="date" value="${esc((a.sent || {}).date || "")}"></label>
        <label class="fld"><span>Sent to (names or distribution list)</span><input data-sf="to" value="${esc((a.sent || {}).to || "")}"></label>
        <label class="fld"><span>Email or reference</span><input data-sf="ref" value="${esc((a.sent || {}).ref || "")}"></label></div>
        ${M.canApprove() ? `<div class="row" style="margin-top:12px"><a class="btn" id="mailrep" href="${esc(reportMail(a).href)}">${ICON.out}<span>E-mail the report</span></a><button class="btn ghost" type="button" id="plink">${ICON.ext}<span>Project link</span></button>
          <span class="muted small">${M.project(a.project_id).contact_emails ? `To: ${esc(M.project(a.project_id).contact_emails)}` : "Add the project e-mails under Projects."} Attach the PDF report to the e-mail.</span></div>` : `<p class="muted small" style="margin-top:10px">The administrator or approver sends the report and records it here.</p>`}</section>` : ""}
      ${a.status === "draft" && M.canEdit() ? `<div class="row"><button class="btn primary lg" type="button" id="submit">Send for approval</button><span class="muted small">An administrator or approver who was not on this audit approves it.</span></div>` : ""}
      ${(a.history || []).length ? `<section class="panel"><div class="panel-h"><h2>History</h2></div>${a.history.map(h => `<div class="small">${esc(fmtDate(h.at.slice(0, 10)))}, ${esc(h.by)}: ${esc(h.what)}</div>`).join("")}</section>` : ""}
    </div>`;
    el.addEventListener("click", async e => {
      const g = e.target.closest("[data-go]"); if (g) return goStep(g.dataset.go);
      const x = e.target.closest("[data-x]");
      if (x) { const mod = await import("../report/export.js"); return x.dataset.x === "xlsx" ? mod.excelReport(a) : mod.pptReport(a); }
    });
    const mr = el.querySelector("#mailrep");
    if (mr) mr.addEventListener("click", () => setTimeout(async () => {
      const m = reportMail(a);
      const ok = await dialog({ title: "Did you send the e-mail?", body: `<p>If you sent it, the system records the date, who it went to and the subject as the proof of sending (P-20 7.4).</p>`, actions: [{ label: "Not yet", value: false }, { label: "Yes, record it", kind: "primary", value: true }] });
      if (!ok) return;
      a.sent = { ...(a.sent || {}), date: (a.sent || {}).date || todayISO(), to: (a.sent || {}).to || m.to, ref: (a.sent || {}).ref || m.subject, by: me.name };
      if (!(a.history || []).some(h => h.what === "Report sent to project")) a.history = [...(a.history || []), { at: new Date().toISOString(), by: me.name, what: "Report sent to project" }];
      await saveNow(); toast("Sending recorded.", "ok"); goStep("finish");
    }, 400));
    const plk = el.querySelector("#plink");
    if (plk) plk.onclick = async () => { await projectLink(a.module, a.project_id); goStep("finish"); };
    el.querySelectorAll("[data-sf]").forEach(i => {
      i.disabled = !M.canApprove();
      i.addEventListener("input", () => {
        a.sent = { ...(a.sent || {}), [i.dataset.sf]: i.value, by: me.name };
        if (a.sent.date && !(a.history || []).some(h => h.what === "Report sent to project")) a.history = [...(a.history || []), { at: new Date().toISOString(), by: me.name, what: "Report sent to project" }];
        save();
      });
    });
    const sub = el.querySelector("#submit");
    if (sub) sub.onclick = async () => {
      const sc2 = M.score(a);
      if (!sc2.complete) { toast("Rate every item (or mark it N/A) before sending.", "error"); goStep("score"); return; }
      if (!(await confirmBox(`Send ${a.ref} for approval with a score of ${fmtScore(sc2.total)}? You can still view it. To change it after this, an administrator or approver returns it to you.`, { title: "Send for approval", ok: "Send" }))) return;
      a.status = "submitted"; a.submitted_at = new Date().toISOString(); delete a.return_note; a.history = [...(a.history || []), { at: a.submitted_at, by: me.name, what: `Sent for approval at ${fmtScore(sc2.total)}` }];
      await saveNow(); toast("Sent for approval. It goes to the server when there is internet.", "ok"); rerenderAll();
    };
  }

  // A newer copy from the server (returned, approved, sent): use it, unless I'm typing.
  const offServer = S.on(e => {
    if (!e.fromServer || save.pending()) return;
    const fresh = S.get(a.id);
    if (!fresh || fresh.updated_at === a.updated_at) return;
    const changed = fresh.status !== a.status;
    a = fresh;
    if (changed) rerenderAll();
  });
  drawLock(); drawSteps(); drawStep(); drawLive(); drawMeta();
  return () => { offServer(); save.flush(); };
}

function howDialog(d, sc) {
  const rows = sc.parts.map(p => `<tr><th colspan="5" style="background:#eef2f6">${esc(d.partTitle(p))}${d.countScore ? "" : ` (${p.share}%)`}, ${d.countScore ? "topic" : "part"} score ${fmtScore(p.score == null ? null : p.score * 100)}</th></tr>` +
    p.items.map(it => `<tr><td>${esc(it.title)}</td><td class="num">${it.weight}</td><td class="num">${it.state === "na" ? "N/A" : it.state === "open" ? "–" : it.value + "%"}</td><td class="num">${it.share ? it.share.toFixed(2) + "%" : "–"}</td><td class="num">${it.points ? it.points.toFixed(2) : "–"}</td></tr>`).join("")).join("");
  dialog({
    title: "How the score is calculated", wide: true,
    body: `${d.countScore ? `<p class="small">Each check is Yes (100%), No (0%) or N/A. The score is the share of Yes among the checks that apply. N/A checks are left out. Flash audits have no deductions.</p>` : `<p class="small">Each part's score is the weighted average of its items (weight × rating). Items marked N/A are left out, and their weight goes to the other items. A rating of 0% counts as zero. Parts are combined by their share. Then one or more Serious NCRs take off ${d.deductions.serious}% once, and each repeated NCR takes off ${d.deductions.repeated}%.</p>`}
      <div class="tscroll"><table class="tbl calc"><thead><tr><th>Item</th><th>Weight</th><th>Rating</th><th>Share of final</th><th>Points</th></tr></thead><tbody>${rows}
      <tr><th colspan="4">Before deductions</th><th class="num">${fmtScore(sc.base)}</th></tr>
      ${d.countScore ? "" : `<tr><td colspan="4">Serious NCRs (${sc.seriousCount})</td><td class="num">${M.minus(sc.serious)}</td></tr>
      <tr><td colspan="4">Repeated NCRs (${sc.repeatedCount})</td><td class="num">${M.minus(sc.repeated)}</td></tr>`}
      <tr><th colspan="4">${esc(d.scoreLabel)}</th><th class="num">${fmtScore(sc.total)}</th></tr></tbody></table></div>`,
  });
}

// The e-mail that sends the report to the project (the PDF is attached by hand).
function reportMail(a) {
  const d = M.def(a.module), p = M.project(a.project_id), sc = M.score(a), list = M.auditNCRs(a);
  const l = linkOf(a.module, a.project_id);
  const subject = `${d.short} report ${a.ref}, ${p.name}, ${fmtDate(a.date)}`;
  const counts = ["Serious", "Major", "Minor"].map(s => `${list.filter(n => n.severity === s).length} ${s.toLowerCase()}`).join(", ");
  const body = [`Dear ${p.name} team,`, "",
    `Please find attached the Corporate HSE ${d.short} report ${a.ref} of ${fmtDate(a.date)}.`, "",
    `Score: ${fmtScore(sc.total)}${sc.grade ? ` (${sc.grade.label})` : ""}`,
    `NCRs: ${list.length} (${counts}${sc.repeatedCount ? `, ${sc.repeatedCount} repeated` : ""}). The deadlines are in the NCR forms.`, "",
    ...(l ? ["Send the evidence of the corrective actions through this link (no sign-in needed):", linkUrl(l), ""] : []),
    "Corporate HSE"].join("\n");
  const to = p.contact_emails || "";
  return { to, subject, href: `mailto:${to.replace(/\s+/g, "")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` };
}
