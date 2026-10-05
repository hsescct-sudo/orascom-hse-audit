import { esc, fmtDate, fRef, findingState, stateChip, riskChip, toast, saveBlob, todayISO, confirmBox, busyOverlay, ICON } from "../ui.js";
import { ALL_TOPICS, topicName } from "../checklist.js";
import { buildRegister } from "../report.js";

const STATES = [["", "All statuses"], ["notclosed", "Not closed"], ["open", "Open"], ["overdue", "Overdue"], ["pending", "Pending review"], ["closed", "Closed"]];

export function filterFindings(list, q) {
  const s = (q.q || "").trim().toLowerCase();
  return list.filter(f => {
    const st = findingState(f);
    if (q.project && f.project_id !== q.project) return false;
    if (q.status === "notclosed" ? st === "closed" : q.status && st !== q.status) return false;
    if (q.risk && f.risk !== q.risk) return false;
    if (q.topic && f.topic !== q.topic) return false;
    if (q.type && (f.audits?.audit_type || "") !== q.type) return false;
    if (q.support && !f.needs_support) return false;
    const d = f.audits?.audit_date || f.created_at.slice(0, 10);
    if (q.from && d < q.from) return false;
    if (q.to && d > q.to) return false;
    if (q.root && !(f.root_cause || "").toLowerCase().includes(q.root.toLowerCase())) return false;
    if (q.item && f.item_id !== q.item) return false;
    if (s && !`${fRef(f.ref)} ${f.observation} ${f.area} ${f.owner} ${f.projects?.name || ""} ${f.root_cause}`.toLowerCase().includes(s)) return false;
    return true;
  });
}

export async function render(root, ctx) {
  const { api, store, isAdmin, query } = ctx;
  await store.load();
  const q = { ...query };
  const picked = new Set();
  let sort = { key: "ref", dir: -1 }, limit = 100;
  const sel = (id, opts, val) => `<select id="${id}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${v === (val || "") ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;

  root.innerHTML = `
    <div class="page-head"><div><h1>Findings register</h1><p class="muted" id="sum"></p></div>
      <div class="actions"><button class="btn ghost" id="xl">Export to Excel</button></div></div>
    <div class="filters card">
      ${isAdmin ? `<label class="fld"><span>Project</span>${sel("f-project", [["", "All projects"], ...store.projects.map(p => [p.id, p.name])], q.project)}</label>` : ""}
      <label class="fld"><span>Status</span>${sel("f-status", STATES, q.status)}</label>
      <label class="fld"><span>Risk</span>${sel("f-risk", [["", "All"], ["High", "High"], ["Med", "Medium"], ["Low", "Low"]], q.risk)}</label>
      <label class="fld"><span>Topic</span>${sel("f-topic", [["", "All topics"], ...ALL_TOPICS.filter(t => t.active || store.findings.some(x => x.topic === t.code)).map(t => [t.code, t.name])], q.topic)}</label>
      <label class="fld"><span>Audit type</span>${sel("f-type", [["", "All"], ["corporate", "Corporate"], ["project", "Project"]], q.type)}</label>
      <label class="fld"><span>From</span><input type="date" id="f-from" value="${esc(q.from || "")}"></label>
      <label class="fld"><span>To</span><input type="date" id="f-to" value="${esc(q.to || "")}"></label>
      <label class="fld grow"><span>Search</span><input id="f-q" value="${esc(q.q || "")}" placeholder="Ref, observation, area, owner…"></label>
      <button class="btn ghost sm" id="f-clear">Clear</button>
    </div>
    <div id="chips"></div>
    ${isAdmin ? `<div class="selbar" id="selbar" hidden><span><b id="sel-n">0</b> selected</span><button class="linkish" id="sel-clear">Clear selection</button><span class="grow"></span><button class="btn sm danger" id="sel-del">${ICON.trash} Delete selected</button></div>` : ""}
    <div class="card table-card"><div class="tscroll"><table class="tbl reg">
      <thead><tr>
        ${isAdmin ? `<th class="selcol"><input type="checkbox" id="sel-all" aria-label="Select every finding that matches the filters"></th>` : ""}<th data-k="ref">Ref</th><th data-k="date">Audit date</th>${isAdmin ? `<th data-k="project" class="pcol">Project</th>` : ""}<th data-k="area">Area</th><th data-k="topic">Topic</th>
        <th>Observation</th><th data-k="risk">Risk</th><th data-k="state">Status</th><th data-k="owner">Owner</th><th data-k="target">Target</th><th class="num" title="Photos">Photos</th></tr></thead>
      <tbody id="rows"></tbody></table></div><div class="more" id="more"></div></div>`;

  const RISK_ORDER = { High: 0, Med: 1, Low: 2 }, ST_ORDER = { overdue: 0, open: 1, pending: 2, closed: 3 };
  const val = (f, k) => ({ ref: f.ref, date: f.audits?.audit_date || "", project: f.projects?.name || "", area: f.area, topic: topicName(f.topic), risk: RISK_ORDER[f.risk], state: ST_ORDER[findingState(f)], owner: f.owner, target: f.target_date || "9999" })[k];
  let rows = [];
  function draw() {
    rows = filterFindings(store.findings, q).sort((a, b) => { const x = val(a, sort.key), y = val(b, sort.key); return (x < y ? -1 : x > y ? 1 : 0) * sort.dir || b.ref - a.ref; });
    const st = { open: 0, overdue: 0, pending: 0, closed: 0 }; rows.forEach(f => st[findingState(f)]++);
    root.querySelector("#sum").textContent = `${rows.length} findings · ${st.open + st.overdue} open (${st.overdue} overdue) · ${st.pending} pending review · ${st.closed} closed`;
    const extra = [q.root && `Root cause: ${q.root}`, q.item && `Check item: ${q.item}`, q.support && "Needs management support"].filter(Boolean);
    root.querySelector("#chips").innerHTML = extra.length ? `<div class="filter-chips">${extra.map(t => `<span class="chip st-pending">${esc(t)}</span>`).join("")}<button class="linkish" id="x-extra">Remove</button></div>` : "";
    root.querySelector("#rows").innerHTML = rows.slice(0, limit).map(f => {
      const pc = store.photoCount?.[f.id]; const n = pc ? pc.violation + pc.closure : 0;
      return `<tr class="click${picked.has(f.id) ? " picked" : ""}" data-id="${f.id}">${isAdmin ? `<td class="selcol"><input type="checkbox" class="rsel" data-id="${f.id}" ${picked.has(f.id) ? "checked" : ""} aria-label="Select ${fRef(f.ref)}"></td>` : ""}<td class="nowrap"><a href="#/finding/${f.id}"><b>${fRef(f.ref)}</b></a></td><td class="nowrap">${fmtDate(f.audits?.audit_date)}</td>
        ${isAdmin ? `<td class="pcol">${esc(f.projects?.name || "")}</td>` : ""}<td>${esc(f.area)}</td><td>${esc(topicName(f.topic))}</td>
        <td class="obs">${esc(f.observation.length > 140 ? f.observation.slice(0, 140) + "…" : f.observation)}</td><td>${riskChip(f.risk)}</td><td>${stateChip(f)}</td>
        <td>${esc(f.owner)}</td><td class="nowrap">${f.fixed_on_spot ? "Immediately" : fmtDate(f.target_date)}</td><td class="num">${n || ""}</td></tr>`;
    }).join("") || `<tr><td colspan="12" class="empty-row">No findings match these filters.</td></tr>`;
    root.querySelector("#more").innerHTML = rows.length > limit ? `<button class="btn ghost" id="more-btn">Show ${Math.min(100, rows.length - limit)} more of ${rows.length - limit}</button>` : "";
    root.querySelectorAll("th[data-k]").forEach(th => th.classList.toggle("sorted", th.dataset.k === sort.key));
    root.querySelector("table.reg").classList.toggle("hide-proj", !!q.project); // one project chosen: its name on every row adds nothing
    if (isAdmin) { const vis = new Set(rows.map(f => f.id)); [...picked].forEach(id => { if (!vis.has(id)) picked.delete(id); }); selUi(); }
  }
  function selUi() {
    const bar = root.querySelector("#selbar"); if (!bar) return;
    bar.hidden = !picked.size; root.querySelector("#sel-n").textContent = picked.size;
    root.querySelectorAll(".rsel").forEach(cb => { cb.checked = picked.has(cb.dataset.id); cb.closest("tr").classList.toggle("picked", cb.checked); });
    const all = root.querySelector("#sel-all");
    all.checked = rows.length > 0 && picked.size === rows.length; all.indeterminate = picked.size > 0 && picked.size < rows.length;
  }
  root.addEventListener("change", e => {
    if (e.target.id === "sel-all") { picked.clear(); if (e.target.checked) rows.forEach(f => picked.add(f.id)); selUi(); }
    else if (e.target.classList.contains("rsel")) { e.target.checked ? picked.add(e.target.dataset.id) : picked.delete(e.target.dataset.id); selUi(); }
  });
  const sync = () => { const h = "#/register?" + new URLSearchParams(Object.entries(q).filter(([, v]) => v)).toString(); history.replaceState(null, "", h); };
  root.querySelector(".filters").addEventListener("input", e => {
    const map = { "f-project": "project", "f-status": "status", "f-risk": "risk", "f-topic": "topic", "f-type": "type", "f-from": "from", "f-to": "to", "f-q": "q" };
    const k = map[e.target.id]; if (!k) return; q[k] = e.target.value; limit = 100; sync(); draw();
  });
  root.addEventListener("click", async e => {
    if (e.target.id === "f-clear") { Object.keys(q).forEach(k => delete q[k]); root.querySelectorAll(".filters select, .filters input").forEach(i => { i.value = ""; }); sync(); draw(); return; }
    if (e.target.id === "x-extra") { delete q.root; delete q.item; delete q.support; sync(); draw(); return; }
    if (e.target.id === "more-btn") { limit += 100; draw(); return; }
    if (e.target.closest(".selcol")) return;
    if (e.target.id === "sel-clear") { picked.clear(); selUi(); return; }
    if (e.target.closest("#sel-del")) {
      const ids = [...picked], n = ids.length;
      const photos = ids.reduce((s, id) => { const c = store.photoCount?.[id]; return s + (c ? c.violation + c.closure : 0); }, 0);
      const ok = await confirmBox(`Delete ${n} finding${n > 1 ? "s" : ""}${photos ? ` and ${photos} photo${photos > 1 ? "s" : ""}` : ""}, with their comments? This can't be undone.`, { title: "Delete findings", ok: `Delete ${n}`, danger: true, typeToConfirm: n > 10 ? "DELETE" : "" });
      if (!ok) return;
      const b = busyOverlay(`Deleting ${n} findings…`);
      try { await api.deleteFindings(ids, (d, t) => b.set(`Deleting findings ${d} of ${t}…`)); toast(`${n} finding${n > 1 ? "s" : ""} deleted.`); }
      catch (x) { toast(x.message, "error"); }
      finally { b.done(); picked.clear(); await store.load(true); draw(); }
      return;
    }
    const th = e.target.closest("th[data-k]"); if (th) { sort = { key: th.dataset.k, dir: sort.key === th.dataset.k ? -sort.dir : (th.dataset.k === "ref" || th.dataset.k === "date" ? -1 : 1) }; draw(); return; }
    const tr = e.target.closest("tr[data-id]"); if (tr && !e.target.closest("a")) { location.hash = "#/finding/" + tr.dataset.id; return; }
    if (e.target.id === "xl") {
      const b = e.target; b.disabled = true; b.textContent = "Preparing…";
      try { saveBlob(await buildRegister(rows, { photoCount: store.photoCount }), `HSE_Findings_Register_${todayISO()}.xlsx`); toast(`${rows.length} findings exported.`); }
      catch (x) { toast(x.message, "error"); } finally { b.disabled = false; b.textContent = "Export to Excel"; }
    }
  });
  draw();
}
