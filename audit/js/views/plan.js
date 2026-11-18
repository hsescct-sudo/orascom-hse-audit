// Annual audit plan: projects by month, with who audits and the status.
import * as S from "../store.js";
import * as M from "../model.js";
import { setTitle, setActions, go, link, rerender } from "../app.js";
import { esc, ICON, dialog, toast, todayISO, confirmBox } from "../ui.js";
import { monthName, planChip } from "../components.js";
import { startAudit } from "../widgets.js";

const YKEY = "oc-audit-plan-year";
export async function render(ctx) {
  const { module: mod, def, view } = ctx;
  const today = todayISO();
  const nowY = +today.slice(0, 4), nowM = +today.slice(5, 7);
  let year = +(sessionStorage.getItem(YKEY) || nowY);
  const allPlans = M.plans(mod);
  const years = [...new Set([nowY, nowY + 1, ...allPlans.map(p => p.year)])].sort();
  setTitle("Audit plan", `${def.name} · ${year}`);
  const admin = M.isAdmin();
  const act = setActions(`${admin ? `<button class="btn" type="button" id="gen">${ICON.cal}<span>Build the year plan</span></button>` : ""}<button class="btn" type="button" id="xl">${ICON.xls}<span>Excel</span></button>`);
  const g = act.querySelector("#gen"); if (g) g.onclick = () => buildPlan(mod, year);
  act.querySelector("#xl").onclick = async () => { const m = await import("../report/export.js"); m.planExcel(mod, year); };

  const plans = allPlans.filter(p => p.year === year);
  const st = s => plans.filter(p => M.planStatus(p, today) === s).length;
  const projs = M.activeProjects();
  const withPlan = new Set(plans.map(p => p.project_id));
  let showAll = sessionStorage.getItem("oc-audit-plan-all") === "1";
  const auditors = M.auditors();
  view.innerHTML = `
    <div class="row" style="margin-bottom:14px;justify-content:space-between">
      <div class="row"><div class="seg" role="group" aria-label="Year">${years.map(y => `<button type="button" data-y="${y}" aria-pressed="${y === year}">${y}</button>`).join("")}</div>
        <label class="tick"><input type="checkbox" id="all" ${showAll ? "checked" : ""}>Show projects with no plan</label></div>
      <div class="row small">${["done", "progress", "due", "overdue", "planned"].map(s => `<span class="chip pl-${s}">${M.PLAN_STATE[s]} ${st(s)}</span>`).join("")}</div>
    </div>
    <div class="panel" style="padding:0"><div class="tscroll" style="max-height:calc(100vh - 240px)"><div class="plan" id="board"></div></div></div>
    <section class="panel" style="margin-top:16px"><div class="panel-h"><h2>Auditor workload ${year}</h2></div><div class="tscroll"><table class="tbl"><thead><tr><th>Auditor</th><th>Planned as lead</th><th>Done</th><th>Overdue</th><th>As team member</th></tr></thead><tbody>
      ${auditors.filter(m => m.role === "auditor" || plans.some(p => p.lead_id === m.id)).map(m => { const lead = plans.filter(p => p.lead_id === m.id); return `<tr><td><b style="font-weight:600">${esc(m.name)}</b></td><td class="num">${lead.length}</td><td class="num">${lead.filter(p => M.planStatus(p, today) === "done").length}</td><td class="num" style="${lead.some(p => M.planStatus(p, today) === "overdue") ? "color:var(--g-red);font-weight:700" : ""}">${lead.filter(p => M.planStatus(p, today) === "overdue").length}</td><td class="num">${plans.filter(p => (p.team_ids || []).includes(m.id)).length}</td></tr>`; }).join("")}
    </tbody></table></div></section>`;
  const board = view.querySelector("#board");
  const rows = projs.filter(p => showAll || withPlan.has(p.id));
  const initials = id => { const m = M.member(id); if (!m) return "?"; const num = m.name.match(/^Auditor\s+(\d+)$/i); return num ? num[1] : m.name.split(/\s+/).filter(Boolean).map(w => w[0]).join("").slice(0, 3).toUpperCase(); };
  board.innerHTML = `<div class="ph" style="justify-content:flex-start;padding-left:10px;left:0;position:sticky;z-index:2">Project</div>${Array.from({ length: 12 }, (_, i) => `<div class="ph ${year === nowY && i + 1 === nowM ? "cm" : ""}">${monthName(i + 1)}</div>`).join("")}` +
    (rows.length ? rows.map(p => `<div class="pn">${esc(p.name)}<small>${esc(p.code)} · ${esc(p.city)}</small></div>` + Array.from({ length: 12 }, (_, i) => {
      const items = plans.filter(x => x.project_id === p.id && x.month === i + 1);
      return `<div class="${year === nowY && i + 1 === nowM ? "cm" : ""}" data-cell="${esc(p.id)}|${i + 1}">${items.map(x => `<button class="pcell ${M.planStatus(x, today)}" type="button" data-plan="${esc(x.id)}" title="${esc(M.PLAN_STATE[M.planStatus(x, today)])}: ${esc((M.member(x.lead_id) || {}).name || "")}">${esc(initials(x.lead_id))}</button>`).join("")}</div>`;
    }).join("")).join("") : `<div style="grid-column:1/-1" class="empty"><h3>No plan for ${year}</h3><p>${admin ? "Use “Build the year plan” to plan every active project, or click a month to add one audit." : "Corporate HSE hasn't published the plan yet."}</p></div>`);
  view.querySelector(".seg").onclick = e => { const b = e.target.closest("[data-y]"); if (b) { sessionStorage.setItem(YKEY, b.dataset.y); rerender(); } };
  view.querySelector("#all").onchange = e => { sessionStorage.setItem("oc-audit-plan-all", e.target.checked ? "1" : "0"); rerender(); };
  board.addEventListener("click", async e => {
    const pb = e.target.closest("[data-plan]");
    if (pb) return planItem(mod, S.get(pb.dataset.plan));
    const cell = e.target.closest("[data-cell]");
    if (cell && admin) { const [pid, m] = cell.dataset.cell.split("|"); return addPlan(mod, pid, year, +m); }
  });
}

async function addPlan(mod, project_id, year, month) {
  const auditors = M.auditors();
  const p = M.project(project_id);
  const r = await dialog({
    title: `Plan an audit · ${monthName(month)} ${year}`,
    body: `<p><b>${esc(p.name)}</b></p><label class="fld"><span>Lead auditor</span><select id="pl-l">${auditors.map(m => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join("")}</select></label>
      <fieldset class="fld" style="border:0;padding:0;margin:0"><span>Team (optional)</span><div class="row">${auditors.map(m => `<label class="tick"><input type="checkbox" value="${esc(m.id)}">${esc(m.name)}</label>`).join("")}</div></fieldset>`,
    actions: [{ label: "Cancel", value: null }, { label: "Add to plan", kind: "primary", value: w => ({ lead: w.querySelector("#pl-l").value, team: [...w.querySelectorAll(".tick input:checked")].map(i => i.value) }) }],
  });
  if (!r) return;
  await S.put({ id: S.uid("pln"), kind: "plan", module: mod, year, month, project_id, lead_id: r.lead, team_ids: r.team.filter(x => x !== r.lead) });
  toast("Added to the plan."); rerender();
}

async function planItem(mod, pl) {
  if (!pl) return;
  const p = M.project(pl.project_id); const a = pl.audit_id ? S.get(pl.audit_id) : null;
  const admin = M.isAdmin(); const auditors = M.auditors();
  const r = await dialog({
    title: `${p.name}`,
    body: `<div class="row">${planChip(pl)}<span class="muted">${monthName(pl.month)} ${pl.year}</span></div>
      ${admin ? `<div class="grid2"><label class="fld"><span>Month</span><select id="pi-m">${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}" ${i + 1 === pl.month ? "selected" : ""}>${monthName(i + 1)}</option>`).join("")}</select></label>
        <label class="fld"><span>Lead auditor</span><select id="pi-l">${auditors.map(m => `<option value="${esc(m.id)}" ${m.id === pl.lead_id ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</select></label></div>`
        : `<p>Lead auditor: <b>${esc((M.member(pl.lead_id) || {}).name || "")}</b></p>`}
      ${a ? `<p>Audit: <b>${esc(a.ref)}</b> · ${esc(a.date)}</p>` : ""}`,
    actions: [
      ...(admin && !a ? [{ label: "Remove from plan", kind: "ghost", value: "del" }] : []),
      ...(admin ? [{ label: "Save", kind: "ghost", value: w => ({ save: true, month: +w.querySelector("#pi-m").value, lead: w.querySelector("#pi-l").value }) }] : []),
      a ? { label: "Open audit", kind: "primary", value: "open" } : (M.canEdit() ? { label: "Start audit", kind: "primary", value: "start" } : { label: "Close", value: null }),
    ],
  });
  if (!r) return;
  if (r === "open") return go(link("audit", a.id, mod));
  if (r === "start") return startAudit(mod, { plan_id: pl.id, project_id: pl.project_id });
  if (r === "del") { if (await confirmBox("Remove this audit from the plan?", { title: "Remove", ok: "Remove", danger: true })) { await S.remove(pl.id); rerender(); } return; }
  if (r.save) { await S.put({ ...pl, month: r.month, lead_id: r.lead }); toast("Plan updated."); rerender(); }
}

// Plan every active project for the year: HSE audit twice, lifting once; leads take turns.
async function buildPlan(mod, year) {
  const def = M.def(mod);
  const auditors = M.auditors().filter(m => m.role === "auditor");
  if (!auditors.length) { toast("Add auditors first (Auditors and users).", "error"); return; }
  const existing = M.plans(mod).filter(p => p.year === year);
  const r = await dialog({
    title: `Build the ${year} plan · ${def.short}`,
    body: `<p>Plans every active project${existing.length ? `. Projects that already have a plan in ${year} are left as they are` : ""}. Lead auditors take turns so the work is shared.</p>
      <label class="fld"><span>Audits per project in ${year}</span><select id="bp-n">${mod === "full" ? `<option value="2" selected>2 (every 6 months)</option><option value="1">1</option><option value="4">4 (every 3 months)</option>` : `<option value="1" selected>1</option><option value="2">2 (every 6 months)</option>`}</select></label>`,
    actions: [{ label: "Cancel", value: null }, { label: "Build plan", kind: "primary", value: w => +w.querySelector("#bp-n").value }],
  });
  if (!r) return;
  const projs = M.activeProjects().filter(p => !existing.some(x => x.project_id === p.id));
  const docs = []; let k = 0;
  projs.forEach((p, i) => {
    const gap = 12 / r;
    for (let j = 0; j < r; j++) {
      const month = 1 + ((i % gap) + j * gap) % 12;
      const lead = auditors[k++ % auditors.length];
      docs.push({ id: S.uid("pln"), kind: "plan", module: mod, year, month: Math.round(month), project_id: p.id, lead_id: lead.id, team_ids: [] });
    }
  });
  await S.putMany(docs);
  toast(`${docs.length} audits added to the ${year} plan.`, "ok"); rerender();
}
