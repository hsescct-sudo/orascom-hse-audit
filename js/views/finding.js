import { esc, fmtDate, fmtDateTime, fRef, aRef, findingState, stateChip, riskChip, toast, dialog, confirmBox, shrinkImage, lightbox, ICON, photoInputs } from "../ui.js";
import { TOPICS, TOPIC, ITEM, RC_LIST, topicName } from "../checklist.js";
import { askName } from "../app.js";

const KIND_LABEL = { comment: "", submitted: "Submitted closure", approved: "Approved closure", rejected: "Returned closure", reopened: "Reopened", closed: "Closed" };

export async function render(root, ctx) {
  const { api, store, me, isAdmin, params, go } = ctx;
  const id = params[0];
  let f, photos = [], comments = [], urls = {};
  const by = () => me.name || (isAdmin ? "Administration" : me.project_name);

  async function load() {
    [f, photos, comments] = await Promise.all([api.getFinding(id), api.photosOf([id]), api.commentsOf(id)]);
    urls = photos.length ? await api.urls(photos.map(p => p.path)) : {};
  }
  await load();

  const auditDraft = () => f.audits?.status === "draft";
  const canEdit = () => isAdmin || auditDraft();
  const canAddClosurePhoto = () => f.status !== "closed";
  const canAddViolationPhoto = () => isAdmin || auditDraft();

  function gallery(kind) {
    const list = photos.filter(p => p.kind === kind);
    const canAdd = kind === "closure" ? canAddClosurePhoto() : canAddViolationPhoto();
    const canDel = p => isAdmin || (kind === "violation" ? auditDraft() : f.status !== "closed");
    return `<div class="gallery" data-kind="${kind}">${list.map((p, i) => `<figure class="ph"><button class="ph-open" data-open="${kind}" data-i="${i}" aria-label="Open photo"><img src="${esc(urls[p.path] || "")}" alt="" loading="lazy"></button>${canDel(p) ? `<button class="ph-del" data-delph="${p.id}" aria-label="Remove photo">${ICON.x}</button>` : ""}</figure>`).join("")}
      ${canAdd ? photoInputs("ph-add", `data-up="${kind}"`) : ""}
      ${!list.length && !canAdd ? `<p class="muted small">No photos.</p>` : ""}</div>`;
  }

  function closurePanel() {
    const st = findingState(f);
    if (st === "closed") return `<div class="panel ok"><b>Closed</b><span class="muted small">${f.closed_at ? fmtDateTime(f.closed_at) : ""}${f.closed_by ? " · approved by " + esc(f.closed_by) : ""}</span>${f.closure_note ? `<p>${esc(f.closure_note)}</p>` : ""}
      ${isAdmin ? `<div class="btnrow"><button class="btn ghost" data-act="reopen">Reopen finding</button></div>` : ""}</div>`;
    if (st === "pending") {
      return `<div class="panel info"><b>Closure submitted for review</b><span class="muted small">${f.closure_submitted_at ? fmtDateTime(f.closure_submitted_at) : ""}${f.closure_submitted_by ? ` · ${esc(f.closure_submitted_by)}` : ""}</span>
        ${f.closure_note ? `<p>${esc(f.closure_note)}</p>` : ""}
        ${isAdmin ? `<label class="fld"><span>Comment (needed when returning)</span><textarea id="rv-c" rows="2" placeholder="e.g. Verified on photo / Mid rail still missing"></textarea></label>
          <div class="btnrow"><button class="btn primary" data-act="approve">Approve and close</button><button class="btn ghost danger" data-act="reject">Return to project</button></div>`
          : `<p class="muted">The administration will review it. You'll see their decision here.</p>`}</div>`;
    }
    return `<div class="panel ${st === "overdue" ? "bad" : "warn"}"><b>${st === "overdue" ? `Overdue since ${fmtDate(f.target_date)}` : "Open"}</b>
      <label class="fld"><span>Action taken to close it</span><textarea id="cl-note" rows="3" placeholder="What was done on site to correct this">${esc(f.closure_note || "")}</textarea></label>
      <p class="muted small">Add the closure photo above first, then submit.</p>
      <div class="btnrow">${isAdmin ? `<button class="btn primary" data-act="close-direct">Close finding</button>` : `<button class="btn primary" data-act="submit">Submit closure for review</button>`}</div></div>`;
  }

  function draw() {
    const it = ITEM[f.item_id];
    root.innerHTML = `
      <div class="page-head"><div><a class="back" href="#/register">‹ Findings register</a>
        <h1>${fRef(f.ref)} ${riskChip(f.risk)} ${stateChip(f)}</h1>
        <p class="muted">${esc(f.projects?.name || "")} · <a href="#/audit/${f.audit_id}">Audit ${aRef(f.audits?.ref)}</a> on ${fmtDate(f.audits?.audit_date)} (${f.audits?.audit_type === "corporate" ? "Corporate" : "Project"})</p></div>
        <div class="actions">${canEdit() ? `<button class="btn ghost" data-act="edit">Edit</button><button class="btn ghost danger" data-act="delete">Delete</button>` : ""}</div></div>
      <div class="grid2">
        <div class="stack">
          <section class="card">
            <h2 class="h2">Observation</h2>
            <p class="lead">${esc(f.observation) || '<span class="muted">No description.</span>'}</p>
            <dl class="dl">
              <dt>Topic</dt><dd>${esc(topicName(f.topic))}${it ? `<div class="muted small">${esc(f.item_id)} · ${esc(it.text)}</div>` : ""}</dd>
              <dt>Area</dt><dd>${esc(f.area) || "—"}</dd>
              <dt>Root cause</dt><dd class="pre">${esc(f.root_cause) || "—"}</dd>
              <dt>${f.fixed_on_spot ? "Corrected on the spot" : "Immediate action"}</dt><dd class="pre">${esc(f.immediate_action) || "—"}</dd>
              ${!f.fixed_on_spot ? `<dt>Interim control</dt><dd class="pre">${esc(f.interim_control) || "—"}</dd><dt>Action plan</dt><dd class="pre">${esc(f.action_plan) || "—"}</dd>` : ""}
              <dt>Owner</dt><dd>${esc(f.owner) || "—"}</dd>
              <dt>Target date</dt><dd>${f.fixed_on_spot ? "Immediately" : fmtDate(f.target_date) || "—"}</dd>
              ${f.needs_support ? `<dt>Management support</dt><dd><span class="chip st-overdue">Needed</span> ${esc(f.support_title)}</dd>` : ""}
              <dt>Raised by</dt><dd>${esc(f.created_by_name) || "—"} · ${fmtDateTime(f.created_at)}</dd>
            </dl>
          </section>
          <section class="card"><h2 class="h2">Photo of violation</h2>${gallery("violation")}</section>
          <section class="card"><h2 class="h2">Closure evidence</h2>${gallery("closure")}${closurePanel()}</section>
        </div>
        <section class="card thread">
          <h2 class="h2">Comments &amp; history</h2>
          <ol class="timeline">${comments.map(c => `<li class="tl ${c.author_role}"><div class="tl-h"><b>${esc(c.author_name || (c.author_role === "admin" ? "Administration" : "Project"))}</b><span class="tag ${c.author_role}">${c.author_role === "admin" ? "Admin" : "Project"}</span>${KIND_LABEL[c.kind] ? `<span class="tag k-${c.kind}">${KIND_LABEL[c.kind]}</span>` : ""}<time>${fmtDateTime(c.created_at)}</time></div>${c.body ? `<p>${esc(c.body)}</p>` : ""}</li>`).join("") || `<li class="muted">No comments yet.</li>`}</ol>
          <label class="fld"><span>Add a comment</span><textarea id="cm" rows="3" placeholder="${isAdmin ? "Instruction or question for the project" : "Update or question for the administration"}"></textarea></label>
          <div class="btnrow"><button class="btn primary" data-act="comment">Post comment</button></div>
        </section>
      </div>`;
  }
  draw();

  const refresh = async () => { await load(); store.markStale(); draw(); };
  const needName = async () => { if (!me.name) { await askName(); } return !!me.name; };

  root.addEventListener("change", async e => {
    const inp = e.target.closest("input[data-up]"); if (!inp) return;
    const files = Array.from(inp.files || []); if (!files.length) return;
    const kind = inp.dataset.up;
    const label = inp.closest(".ph-add"); label.classList.add("busy"); label.querySelector("span").textContent = "Uploading…";
    try {
      for (const file of files) { const blob = await shrinkImage(file); await api.uploadPhoto({ projectId: f.project_id, findingId: f.id, kind, blob, by: by() }); }
      toast(files.length > 1 ? `${files.length} photos added.` : "Photo added.");
    } catch (x) { toast(x.message, "error"); }
    await refresh();
  });

  root.addEventListener("click", async e => {
    const open = e.target.closest("[data-open]");
    if (open) { const list = photos.filter(p => p.kind === open.dataset.open); lightbox(list.map(p => urls[p.path]), +open.dataset.i); return; }
    const del = e.target.closest("[data-delph]");
    if (del) { if (!(await confirmBox("Remove this photo?", { ok: "Remove", danger: true }))) return; try { await api.deletePhoto(photos.find(p => p.id === del.dataset.delph)); toast("Photo removed."); } catch (x) { toast(x.message, "error"); } return refresh(); }
    const b = e.target.closest("[data-act]"); if (!b) return;
    const act = b.dataset.act;
    try {
      if (act === "comment") {
        const body = root.querySelector("#cm").value.trim(); if (!body) return toast("Write the comment first.", "error");
        if (!(await needName())) return;
        await api.addComment(f.id, body, by()); toast("Comment posted."); return refresh();
      }
      if (act === "submit") {
        const note = root.querySelector("#cl-note").value.trim();
        if (!note) return toast("Describe the action taken.", "error");
        if (!photos.some(p => p.kind === "closure") && !(await confirmBox("No closure photo is attached. Submit anyway?", { ok: "Submit without photo" }))) return;
        if (!(await needName())) return;
        await api.submitClosure(f.id, note, by()); toast("Closure submitted. The administration will review it."); return refresh();
      }
      if (act === "close-direct") {
        const note = root.querySelector("#cl-note").value.trim() || "Closed by the administration.";
        if (f.closure_note !== note) await api.updateFinding(f.id, { closure_note: note });
        await api.setStatus(f.id, "closed", note, by()); toast("Finding closed."); return refresh();
      }
      if (act === "approve") { await api.reviewClosure(f.id, true, root.querySelector("#rv-c").value.trim(), by()); toast("Closure approved."); return refresh(); }
      if (act === "reject") {
        const c = root.querySelector("#rv-c").value.trim(); if (!c) return toast("Write why the closure is returned.", "error");
        await api.reviewClosure(f.id, false, c, by()); toast("Returned to the project."); return refresh();
      }
      if (act === "reopen") {
        const v = await dialog({ title: "Reopen finding", body: `<label class="fld"><span>Reason</span><textarea id="rr" rows="3"></textarea></label>`, actions: [{ label: "Cancel", value: null }, { label: "Reopen", value: w => w.querySelector("#rr").value.trim(), validate: w => (w.querySelector("#rr").value.trim() ? null : "Write the reason.") }] });
        if (!v) return; await api.setStatus(f.id, "open", v, by()); toast("Finding reopened."); return refresh();
      }
      if (act === "delete") {
        if (!(await confirmBox(`Delete ${fRef(f.ref)} with its photos and comments? This can't be undone.`, { ok: "Delete finding", danger: true }))) return;
        await api.deleteFinding(f.id); store.markStale(); toast("Finding deleted."); return go("#/register");
      }
      if (act === "edit") return editDialog();
    } catch (x) { toast(x.message, "error"); }
  });

  async function editDialog() {
    const opt = (v, cur) => `<option value="${esc(v[0])}" ${v[0] === cur ? "selected" : ""}>${esc(v[1])}</option>`;
    const v = await dialog({
      title: "Edit " + fRef(f.ref), wide: true,
      body: `<div class="form-grid">
        <label class="fld"><span>Topic</span><select id="e-topic">${[...TOPICS, ...(TOPICS.some(t => t.code === f.topic) ? [] : [{ code: f.topic, name: topicName(f.topic) }])].map(t => opt([t.code, t.name], f.topic)).join("")}</select></label>
        <label class="fld"><span>Risk</span><select id="e-risk">${[["High", "High"], ["Med", "Medium"], ["Low", "Low"]].map(o => opt(o, f.risk)).join("")}</select></label>
        <label class="fld"><span>Area</span><input id="e-area" value="${esc(f.area)}"></label>
        <label class="fld"><span>Owner</span><input id="e-owner" value="${esc(f.owner)}"></label>
        <label class="fld span2"><span>Observation</span><textarea id="e-obs" rows="3">${esc(f.observation)}</textarea></label>
        <label class="fld span2"><span>Root cause</span><textarea id="e-rc" rows="2" list="rcl">${esc(f.root_cause)}</textarea><small class="muted">Common: ${RC_LIST.join(" · ")}</small></label>
        <label class="fld span2"><span>Immediate action</span><textarea id="e-act" rows="2">${esc(f.immediate_action)}</textarea></label>
        <label class="fld span2"><span>Interim control</span><textarea id="e-int" rows="2">${esc(f.interim_control)}</textarea></label>
        <label class="fld span2"><span>Action plan</span><textarea id="e-plan" rows="2">${esc(f.action_plan)}</textarea></label>
        <label class="fld"><span>Target date</span><input type="date" id="e-target" value="${esc(f.target_date || "")}"></label>
        <label class="check"><input type="checkbox" id="e-fix" ${f.fixed_on_spot ? "checked" : ""}> Corrected on the spot</label>
        <label class="check"><input type="checkbox" id="e-sup" ${f.needs_support ? "checked" : ""}> Needs management support</label>
        <label class="fld"><span>Support title</span><input id="e-supt" value="${esc(f.support_title)}"></label>
      </div>`,
      actions: [{ label: "Cancel", value: null }, { label: "Save", value: w => ({
        topic: w.querySelector("#e-topic").value, risk: w.querySelector("#e-risk").value, area: w.querySelector("#e-area").value.trim(), owner: w.querySelector("#e-owner").value.trim(),
        observation: w.querySelector("#e-obs").value.trim(), root_cause: w.querySelector("#e-rc").value.trim(), immediate_action: w.querySelector("#e-act").value.trim(),
        interim_control: w.querySelector("#e-int").value.trim(), action_plan: w.querySelector("#e-plan").value.trim(), target_date: w.querySelector("#e-target").value || null,
        fixed_on_spot: w.querySelector("#e-fix").checked, needs_support: w.querySelector("#e-sup").checked, support_title: w.querySelector("#e-supt").value.trim()
      }), validate: w => (w.querySelector("#e-obs").value.trim() ? null : "The observation can't be empty.") }]
    });
    if (!v) return;
    try { await api.updateFinding(f.id, v); toast("Finding saved."); await refresh(); } catch (x) { toast(x.message, "error"); }
  }
}
