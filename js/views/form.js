import { esc, fmtDate, aRef, todayISO, toast, dialog, confirmBox, shrinkImage, lightbox, ICON, debounce, pct } from "../ui.js";
import { TOPICS, TOPIC, ITEM, RC_LIST, TOTAL_CHECKS } from "../checklist.js";
import { defaultScope, defaultConclusion } from "../report.js";

export async function render(root, ctx) {
  if (ctx.name === "new") return renderNew(root, ctx);
  return renderChecklist(root, ctx);
}

// ---------------- step 1: audit details ----------------
async function renderNew(root, ctx) {
  const { api, store, me, isAdmin, go } = ctx;
  await store.load();
  const projects = store.projects.filter(p => p.active);
  const pid = isAdmin ? (ctx.query.project || "") : me.project_id;
  const pm = id => store.project(id)?.pm || "";
  root.innerHTML = `
    <div class="page-head"><div><h1>New audit</h1><p class="muted">Fill the details, then go through the checklist on site. Everything saves as you go.</p></div></div>
    <form class="card form-grid narrow" id="nf">
      ${isAdmin ? `<label class="fld span2"><span>Project</span><select id="n-project" required><option value="">Choose a project…</option>${projects.map(p => `<option value="${p.id}" ${p.id === pid ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label>
        <label class="fld"><span>Audit type</span><select id="n-type"><option value="corporate">Corporate HSE audit</option><option value="project">Project self-audit</option></select></label>`
        : `<div class="fld span2"><span>Project</span><b>${esc(me.project_name)}</b></div>`}
      <label class="fld"><span>Date of audit</span><input type="date" id="n-date" value="${todayISO()}" required></label>
      <label class="fld"><span>Auditor(s)</span><input id="n-aud" value="${esc(me.name || "")}" required></label>
      <label class="fld"><span>Project Manager</span><input id="n-pm" value="${esc(pm(pid))}"></label>
      <label class="fld"><span>P.O.C. (% complete)</span><input id="n-poc" inputmode="decimal" placeholder="e.g. 60"></label>
      <label class="fld"><span>Manpower</span><input id="n-mp" inputmode="numeric" placeholder="e.g. 1200"></label>
      <label class="fld span2"><span>Areas visited</span><input id="n-areas" placeholder="e.g. MBBR area, laydown yard"></label>
      <div class="span2 btnrow"><button class="btn primary" type="submit">Start checklist</button></div>
      <p class="dlg-err span2" id="n-err"></p>
    </form>`;
  const projSel = root.querySelector("#n-project");
  if (projSel) projSel.addEventListener("change", () => { root.querySelector("#n-pm").value = pm(projSel.value); });
  root.querySelector("#nf").addEventListener("submit", async e => {
    e.preventDefault();
    const project_id = isAdmin ? projSel.value : me.project_id;
    if (!project_id) { root.querySelector("#n-err").textContent = "Choose the project."; return; }
    const num = s => { const n = parseFloat(String(s).replace(/[^\d.]/g, "")); return isNaN(n) ? null : n; };
    const btn = e.target.querySelector("button[type=submit]"); btn.disabled = true; btn.textContent = "Creating…";
    try {
      const a = await api.createAudit({ project_id, audit_type: isAdmin ? root.querySelector("#n-type").value : "project", audit_date: root.querySelector("#n-date").value || todayISO(),
        auditor: root.querySelector("#n-aud").value.trim(), pm: root.querySelector("#n-pm").value.trim(), poc: num(root.querySelector("#n-poc").value),
        manpower: num(root.querySelector("#n-mp").value), areas: root.querySelector("#n-areas").value.trim(), source: "form", status: "draft", created_by_name: me.name || "" });
      store.markStale();
      go("#/form/" + a.id);
    } catch (x) { root.querySelector("#n-err").textContent = x.message; btn.disabled = false; btn.textContent = "Start checklist"; }
  });
}

// ---------------- step 2: checklist ----------------
async function renderChecklist(root, ctx) {
  const { api, store, me, isAdmin, params, go } = ctx;
  const id = params[0];
  let audit = await api.getAudit(id);
  if (audit.status !== "draft" && !isAdmin) { go("#/audit/" + id); return; }
  let findings = await api.findingsOfAudit(id);
  let photos = findings.length ? await api.photosOf(findings.map(f => f.id)) : [];
  let urls = photos.length ? await api.urls(photos.map(p => p.path)) : {};
  const checks = { ...(audit.checks || {}) };
  const byItem = {}; findings.forEach(f => { if (f.item_id) byItem[f.item_id] = f; });
  const by = () => me.name || (isAdmin ? "Administration" : me.project_name);
  let view = { topic: null, finish: false };
  let saving = 0, failed = false;
  const pending = {}; // findingId -> patch
  const uploads = {}; // findingId:kind -> count

  const status = () => {
    const el = root.querySelector("#fs-save"); if (!el) return;
    el.textContent = saving ? "Saving…" : failed ? "Not saved — check the connection" : "Saved";
    el.className = "pill " + (saving ? "" : failed ? "warn" : "ok");
  };
  const track = async p => { saving++; status(); try { const r = await p; failed = false; return r; } catch (e) { failed = true; toast(e.message, "error"); throw e; } finally { saving--; status(); } };
  const saveChecks = debounce(() => track(api.updateAudit(id, { checks })).then(a => { audit = { ...audit, ...a, checks: audit.checks }; }).catch(() => {}), 700);
  const flushFinding = debounce(async () => {
    const ids = Object.keys(pending);
    for (const fid of ids) {
      const patch = pending[fid]; delete pending[fid];
      try { const row = await track(api.updateFinding(fid, patch)); const cur = findings.find(f => f.id === fid); if (cur) cur.status = row.status; } catch (e) { pending[fid] = { ...patch, ...(pending[fid] || {}) }; }
    }
  }, 800);
  const patchFinding = (f, patch) => { Object.assign(f, patch); pending[f.id] = { ...(pending[f.id] || {}), ...patch }; flushFinding(); };

  const tally = () => {
    const v = Object.values(checks); const ok = v.filter(x => x === "ok").length, nc = v.filter(x => x === "nc").length, na = v.filter(x => x === "na").length;
    return { ok, nc, na, done: ok + nc + na, findings: findings.length, comp: pct(ok, ok + nc) };
  };
  const topicTally = code => { const ids = TOPIC[code].items.map(i => i.id); return { n: ids.length, done: ids.filter(i => checks[i]).length, nc: ids.filter(i => checks[i] === "nc").length + findings.filter(f => !f.item_id && f.topic === code).length }; };

  function header() {
    const t = tally();
    return `<div class="form-top card">
      <div class="ft-row"><div><a class="back" href="#/audit/${id}">‹ Audit ${aRef(audit.ref)}</a><h1 class="ft-title">${esc(audit.projects?.name || "")}</h1>
        <p class="muted small">${fmtDate(audit.audit_date)} · ${audit.audit_type === "corporate" ? "Corporate" : "Project"} audit · ${esc(audit.auditor || "")}</p></div>
        <span class="pill ok" id="fs-save">Saved</span></div>
      <div class="ft-prog"><span class="hbar big"><i style="width:${(100 * t.done) / TOTAL_CHECKS}%"></i></span><span class="small">${t.done} / ${TOTAL_CHECKS} checked</span><b class="small ${t.findings ? "t-over" : ""}">${t.findings} findings</b></div>
    </div>`;
  }

  function topicsView() {
    return `<div class="topic-grid">${TOPICS.map((t, i) => { const s = topicTally(t.code); return `<button class="topic-card ${s.done === s.n ? "done" : ""}" data-topic="${t.code}">
      <span class="tc-code">${t.code}</span><span class="tc-name">${i + 1}. ${esc(t.name)}</span>
      <span class="tc-meta"><span class="hbar"><i style="width:${(100 * s.done) / s.n}%"></i></span>${s.done}/${s.n}${s.nc ? ` · <b class="t-over">${s.nc} NC</b>` : ""}</span></button>`; }).join("")}</div>
      <div class="btnrow center"><button class="btn primary" data-act="finish">Finish &amp; submit</button></div>`;
  }

  function shots(f, kind, label) {
    const list = photos.filter(p => p.finding_id === f.id && p.kind === kind);
    const up = uploads[f.id + ":" + kind] || 0;
    return `<div class="fld"><span>${label}</span><div class="shots">${list.map(p => `<span class="shot"><button type="button" data-view="${p.id}" aria-label="Open photo"><img src="${esc(urls[p.path] || "")}" alt="" loading="lazy"></button><button type="button" class="shot-x" data-delph="${p.id}" aria-label="Remove photo">${ICON.x}</button></span>`).join("")}
      ${Array.from({ length: up }, () => `<span class="shot up"><i class="spin"></i></span>`).join("")}
      <label class="shot-add">${ICON.cam}<span>Photo</span><input type="file" accept="image/*" multiple data-up="${kind}" data-fid="${f.id}"></label></div></div>`;
  }

  function ncPanel(f) {
    const rc = (f.root_cause || "").split("\n").filter(Boolean);
    return `<div class="nc" data-fid="${f.id}">
      <label class="fld"><span>Location / area</span><input data-f="area" value="${esc(f.area)}" placeholder="e.g. MBBR area – grid C4"></label>
      <label class="fld"><span>What did you find?</span><textarea data-f="observation" rows="2" placeholder="Describe the condition and the hazard">${esc(f.observation)}</textarea></label>
      <div class="fld"><span>Risk level</span><div class="seg sm">${["High", "Med", "Low"].map(r => `<button type="button" class="rk-${r}" data-risk="${r}" aria-pressed="${f.risk === r}">${r === "Med" ? "Medium" : r}</button>`).join("")}</div></div>
      ${shots(f, "violation", "Photo of violation")}
      <div class="fld"><span>Root cause</span><div class="chips-pick">${RC_LIST.map(r => `<button type="button" class="pick ${rc.includes(r) ? "on" : ""}" data-rc="${esc(r)}">${esc(r)}</button>`).join("")}</div></div>
      <div class="fld"><span>Corrected on the spot?</span><div class="seg sm two"><button type="button" class="fx" data-fix="y" aria-pressed="${f.fixed_on_spot}">Yes, corrected now</button><button type="button" class="fx" data-fix="n" aria-pressed="${!f.fixed_on_spot && f._decided}">No, needs time</button></div></div>
      ${f.fixed_on_spot ? `<label class="fld"><span>Action taken</span><textarea data-f="immediate_action" rows="2" placeholder="What the site team did">${esc(f.immediate_action)}</textarea></label>${shots(f, "closure", "Photo after correction")}` : ""}
      ${!f.fixed_on_spot && f._decided ? `<label class="fld"><span>Interim control</span><textarea data-f="interim_control" rows="2" placeholder="What protects people until it is fixed">${esc(f.interim_control)}</textarea></label>
        <label class="fld"><span>Action plan</span><textarea data-f="action_plan" rows="2" placeholder="Permanent fix agreed with the site team">${esc(f.action_plan)}</textarea></label>
        <div class="row2"><label class="fld"><span>Owner</span><input data-f="owner" value="${esc(f.owner)}" placeholder="Name and role"></label><label class="fld"><span>Target date</span><input type="date" data-f="target_date" value="${esc(f.target_date || "")}"></label></div>` : ""}
      <label class="check"><input type="checkbox" data-sup ${f.needs_support ? "checked" : ""}> Needs management support (resources, contracts, coordination)</label>
      ${f.needs_support ? `<label class="fld"><span>Issue title for management</span><input data-f="support_title" value="${esc(f.support_title)}" placeholder="e.g. PPE shortage"></label>` : ""}
      ${!f.item_id ? `<div class="btnrow"><button type="button" class="btn sm ghost danger" data-delf="${f.id}">Remove this finding</button></div>` : ""}
    </div>`;
  }

  function itemCard(it) {
    const s = checks[it.id] || "", f = byItem[it.id];
    return `<article class="item ${s ? "is-" + s : ""}" id="i-${it.id}" data-item="${it.id}">
      <div class="ihead"><span class="iid">${it.id}</span><span class="chip rk-${it.risk}" title="Suggested risk if not OK">${it.risk === "Med" ? "Medium" : it.risk} if NC</span></div>
      <p class="itxt">${esc(it.text)}</p>
      <div class="seg">${[["ok", "OK"], ["nc", "NC"], ["na", "N/A"]].map(([v, l]) => `<button type="button" class="s-${v}" data-s="${v}" aria-pressed="${s === v}">${l}</button>`).join("")}</div>
      ${s === "nc" && f ? ncPanel(f) : s === "nc" ? `<p class="muted small">Creating the finding…</p>` : ""}
    </article>`;
  }

  function topicView(code) {
    const t = TOPIC[code], i = TOPICS.indexOf(t), prev = TOPICS[i - 1], next = TOPICS[i + 1];
    const extra = findings.filter(f => !f.item_id && f.topic === code);
    return `<div class="tophead"><button class="btn sm ghost" data-act="topics">‹ All topics</button><span class="muted small">${i + 1} of ${TOPICS.length}</span><button class="btn sm ghost" data-act="finish">Finish &amp; submit</button></div>
      <h2 class="ttl"><span class="tc-code">${t.code}</span> ${esc(t.name)}</h2>
      <p class="tip"><b>Photograph:</b> ${esc(t.photo)}</p>
      <div class="items">${t.items.map(itemCard).join("")}
      ${extra.map(f => `<article class="item is-nc" id="x-${f.id}"><div class="ihead"><span class="iid">Other finding</span></div>${ncPanel(f)}</article>`).join("")}</div>
      <div class="btnrow"><button class="btn ghost" data-act="custom" data-topic="${code}">+ Add a finding not on the checklist</button></div>
      <div class="nextnav">${prev ? `<button class="btn ghost" data-topic="${prev.code}">‹ ${esc(prev.name)}</button>` : "<span></span>"}${next ? `<button class="btn primary" data-topic="${next.code}">${esc(next.name)} ›</button>` : `<button class="btn primary" data-act="finish">Finish &amp; submit ›</button>`}</div>`;
  }

  function gapsOf(f) {
    const m = [];
    if (!f.area) m.push("location"); if (!f.observation) m.push("description");
    if (!photos.some(p => p.finding_id === f.id && p.kind === "violation")) m.push("violation photo");
    if (f.fixed_on_spot) { if (!f.immediate_action) m.push("action taken"); if (!photos.some(p => p.finding_id === f.id && p.kind === "closure")) m.push("after photo"); }
    else { if (!f.interim_control) m.push("interim control"); if (!f.owner) m.push("owner"); if (!f.target_date) m.push("target date"); }
    return m;
  }

  function finishView() {
    const t = tally();
    const gaps = findings.map(f => ({ f, g: gapsOf(f) })).filter(x => x.g.length);
    return `<div class="tophead"><button class="btn sm ghost" data-act="topics">‹ Back to checklist</button></div>
      <h2 class="ttl">Review &amp; submit</h2>
      <div class="kpis small"><div class="kpi"><span>Checked</span><b>${t.done}/${TOTAL_CHECKS}</b></div><div class="kpi"><span>Compliance</span><b>${t.comp == null ? "—" : t.comp + "%"}</b></div><div class="kpi"><span>Findings</span><b>${t.findings}</b></div><div class="kpi"><span>Corrected on the spot</span><b>${findings.filter(f => f.fixed_on_spot).length}</b></div></div>
      ${gaps.length ? `<div class="panel warn"><b>${gaps.length} finding(s) are missing details for the report</b><ul>${gaps.map(({ f, g }) => `<li><button class="linkish" data-goto="${f.item_id || "x:" + f.id}" data-topic-of="${f.topic}">${esc(f.item_id || "Other finding")}</button> — ${g.join(", ")}</li>`).join("")}</ul></div>` : `<div class="panel ok">All findings have the details the report needs.</div>`}
      <label class="fld"><span>Purpose &amp; scope</span><textarea id="fx-scope" rows="4">${esc(audit.scope || defaultScope(audit, audit.projects?.name))}</textarea></label>
      <label class="fld"><span>Conclusion</span><textarea id="fx-concl" rows="4">${esc(audit.conclusion || defaultConclusion({ ...audit, checks }, findings))}</textarea></label>
      <div class="btnrow"><button class="btn primary" data-act="submit">Submit audit</button><button class="btn ghost" data-act="savedraft">Save and continue later</button></div>
      <p class="muted small">${isAdmin ? "After submitting, the project sees the findings and submits closures for your review." : "After submitting, findings can't be edited. Close each one through “Submit closure” on the finding page."}</p>`;
  }

  function draw() {
    root.innerHTML = header() + `<div class="form-body">${view.finish ? finishView() : view.topic ? topicView(view.topic) : topicsView()}</div>`;
    status();
  }
  findings.forEach(f => { f._decided = f.fixed_on_spot || !!(f.interim_control || f.action_plan || f.owner || f.target_date); });
  draw();

  const rerenderItem = itemId => {
    const el = root.querySelector("#i-" + itemId); if (el) el.outerHTML = itemCard(ITEM[itemId]);
    const top = root.querySelector(".form-top"); if (top) top.outerHTML = header();
  };
  const rerenderFinding = f => { if (f.item_id) return rerenderItem(f.item_id); const el = root.querySelector("#x-" + f.id); if (el) el.querySelector(".nc").outerHTML = ncPanel(f); };
  const findingOf = el => { const p = el.closest("[data-fid]"); return p && findings.find(f => f.id === p.dataset.fid); };
  const nextSeq = () => findings.reduce((m, f) => Math.max(m, f.seq || 0), 0) + 1;

  async function setCheck(itemId, v) {
    const cur = checks[itemId] || "";
    const nv = cur === v ? "" : v;
    const f = byItem[itemId];
    if (cur === "nc" && nv !== "nc" && f) {
      const n = photos.filter(p => p.finding_id === f.id).length;
      if (!(await confirmBox(`This removes the finding for ${itemId}${n ? ` and its ${n} photo(s)` : ""}. Continue?`, { ok: "Remove finding", danger: true }))) return;
      try { await track(api.deleteFinding(f.id)); } catch (e) { return; }
      findings = findings.filter(x => x.id !== f.id); photos = photos.filter(p => p.finding_id !== f.id); delete byItem[itemId];
    }
    if (nv) checks[itemId] = nv; else delete checks[itemId];
    saveChecks();
    if (nv === "nc" && !byItem[itemId]) {
      rerenderItem(itemId);
      try {
        const it = ITEM[itemId];
        const row = await track(api.createFinding({ audit_id: id, project_id: audit.project_id, item_id: itemId, topic: it.topic, risk: it.risk, seq: nextSeq(), status: "open", created_by_name: by() }));
        row._decided = false; findings.push(row); byItem[itemId] = row;
      } catch (e) { delete checks[itemId]; saveChecks(); }
    }
    rerenderItem(itemId);
    if (nv === "nc") { const el = root.querySelector("#i-" + itemId); if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
    store.markStale();
  }

  async function uploadFiles(f, kind, files) {
    const key = f.id + ":" + kind;
    uploads[key] = (uploads[key] || 0) + files.length; rerenderFinding(f);
    for (const file of files) {
      try {
        const blob = await shrinkImage(file);
        const row = await track(api.uploadPhoto({ projectId: audit.project_id, findingId: f.id, kind, blob, by: by() }));
        photos.push(row); Object.assign(urls, await api.urls([row.path]));
      } catch (e) { /* toast shown */ }
      uploads[key]--; rerenderFinding(f);
    }
    store.markStale();
  }

  root.addEventListener("click", async e => {
    const tb = e.target.closest("[data-topic]");
    if (tb && !e.target.closest("[data-act=custom]")) { view = { topic: tb.dataset.topic, finish: false }; draw(); window.scrollTo(0, 0); return; }
    const sb = e.target.closest("[data-s]"); if (sb) return setCheck(sb.closest("[data-item]").dataset.item, sb.dataset.s);
    const rb = e.target.closest("[data-risk]"); if (rb) { const f = findingOf(rb); patchFinding(f, { risk: rb.dataset.risk }); return rerenderFinding(f); }
    const rc = e.target.closest("[data-rc]"); if (rc) { const f = findingOf(rc); const list = (f.root_cause || "").split("\n").filter(Boolean); const v = rc.dataset.rc; const nl = list.includes(v) ? list.filter(x => x !== v) : [...list, v]; patchFinding(f, { root_cause: nl.join("\n") }); return rerenderFinding(f); }
    const fx = e.target.closest("[data-fix]");
    if (fx) {
      const f = findingOf(fx); const yes = fx.dataset.fix === "y";
      f._decided = true;
      patchFinding(f, yes ? { fixed_on_spot: true, status: "closed", target_date: audit.audit_date } : { fixed_on_spot: false, status: "open", ...(f.target_date === audit.audit_date ? { target_date: null } : {}) });
      return rerenderFinding(f);
    }
    const v = e.target.closest("[data-view]"); if (v) { const p = photos.find(x => x.id === v.dataset.view); const same = photos.filter(x => x.finding_id === p.finding_id && x.kind === p.kind); return lightbox(same.map(x => urls[x.path]), same.indexOf(p)); }
    const dp = e.target.closest("[data-delph]");
    if (dp) { const p = photos.find(x => x.id === dp.dataset.delph); if (!(await confirmBox("Remove this photo?", { ok: "Remove", danger: true }))) return; try { await track(api.deletePhoto(p)); photos = photos.filter(x => x.id !== p.id); rerenderFinding(findings.find(f => f.id === p.finding_id)); } catch (x) { /* shown */ } return; }
    const df = e.target.closest("[data-delf]");
    if (df) { const f = findings.find(x => x.id === df.dataset.delf); if (!(await confirmBox("Remove this finding and its photos?", { ok: "Remove", danger: true }))) return; try { await track(api.deleteFinding(f.id)); findings = findings.filter(x => x.id !== f.id); draw(); } catch (x) { /* shown */ } return; }
    const go2 = e.target.closest("[data-goto]");
    if (go2) { view = { topic: go2.dataset.topicOf, finish: false }; draw(); const t = go2.dataset.goto; const el = root.querySelector(t.startsWith("x:") ? "#x-" + t.slice(2) : "#i-" + t); if (el) el.scrollIntoView({ block: "center" }); return; }
    const b = e.target.closest("[data-act]"); if (!b) return;
    const act = b.dataset.act;
    if (act === "topics") { view = { topic: null, finish: false }; draw(); window.scrollTo(0, 0); }
    if (act === "finish") { await flushFinding.flush(); view = { topic: null, finish: true }; draw(); window.scrollTo(0, 0); }
    if (act === "custom") {
      try {
        const row = await track(api.createFinding({ audit_id: id, project_id: audit.project_id, item_id: "", topic: b.dataset.topic, risk: "Med", seq: nextSeq(), status: "open", created_by_name: by() }));
        row._decided = false; findings.push(row); draw();
        const el = root.querySelector("#x-" + row.id); if (el) el.scrollIntoView({ block: "center" });
      } catch (x) { /* shown */ }
    }
    if (act === "savedraft" || act === "submit") {
      const scope = root.querySelector("#fx-scope").value.trim(), conclusion = root.querySelector("#fx-concl").value.trim();
      if (act === "submit" && !(await confirmBox(isAdmin ? "Submit this audit?" : "Submit this audit to the administration? Findings can't be edited after this.", { ok: "Submit audit" }))) return;
      b.disabled = true;
      try {
        await flushFinding.flush(); await saveChecks.flush();
        // order findings as on the checklist, and fill empty descriptions
        const order = f => (f.item_id ? Object.keys(ITEM).indexOf(f.item_id) : 10000 + (f.seq || 0));
        const sorted = [...findings].sort((x, y) => order(x) - order(y));
        for (let i = 0; i < sorted.length; i++) {
          const f = sorted[i], patch = {};
          if (f.seq !== i + 1) patch.seq = i + 1;
          if (!f.observation && f.item_id) patch.observation = "Not compliant: " + ITEM[f.item_id].text;
          if (Object.keys(patch).length) { await track(api.updateFinding(f.id, patch)); Object.assign(f, patch); }
        }
        await track(api.updateAudit(id, { checks, scope, conclusion, ...(act === "submit" ? { status: "submitted" } : {}) }));
        store.markStale();
        toast(act === "submit" ? "Audit submitted." : "Saved. Continue any time from Audits.");
        go("#/audit/" + id);
      } catch (x) { b.disabled = false; }
    }
  });
  root.addEventListener("input", e => {
    const el = e.target; if (!el.dataset.f) return;
    const f = findingOf(el); if (!f) return;
    patchFinding(f, { [el.dataset.f]: el.type === "date" ? (el.value || null) : el.value });
  });
  root.addEventListener("change", e => {
    const el = e.target;
    if (el.dataset.up) { const f = findings.find(x => x.id === el.dataset.fid); const files = Array.from(el.files || []); el.value = ""; if (files.length) uploadFiles(f, el.dataset.up, files); return; }
    if (el.hasAttribute("data-sup")) { const f = findingOf(el); patchFinding(f, { needs_support: el.checked }); rerenderFinding(f); }
  });
  return { unmount() { flushFinding.flush(); saveChecks.flush(); } };
}
