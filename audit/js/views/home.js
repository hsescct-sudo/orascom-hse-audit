// "My audits": what this auditor has to do now. The first screen on a phone.
import * as M from "../model.js";
import { setTitle, go, link } from "../app.js";
import { esc, ICON, fmtDate, todayISO } from "../ui.js";
import { mtag, auditChip, planChip, monthName } from "../components.js";
import { startAudit } from "../widgets.js";

export async function render(ctx) {
  const { module: mod, def, view } = ctx;
  const me = M.me();
  setTitle(`Hello, ${me.name.split(" ")[0]}`, `${def.name} · my audits`);
  const today = todayISO(), y = +today.slice(0, 4), m = +today.slice(5, 7);
  const mine = p => p.lead_id === me.id || (p.team_ids || []).includes(me.id) || M.isAdmin();
  const drafts = M.audits(mod).filter(a => a.status === "draft" && (a.lead_id === me.id || a.created_by === me.id || M.isAdmin()));
  const planned = M.plans(mod).filter(p => p.year === y && mine(p) && ["due", "overdue", "planned"].includes(M.planStatus(p, today)) && p.month <= m + 1)
    .sort((a, b) => a.month - b.month);
  const waiting = M.isAdmin() ? M.audits(mod).filter(a => a.status === "submitted") : [];
  const recent = M.audits(mod).filter(a => M.finished(a) && (a.lead_id === me.id || M.isAdmin())).slice(0, 5);
  const card = (title, sub, right, attrs) => `<div class="ncr-card" ${attrs} role="button" tabindex="0"><div class="thumb">${ICON.clip}</div><div style="min-width:0"><div class="nc-t">${title}</div><div class="nc-m">${sub}</div></div><div>${right}</div></div>`;
  view.className = "view narrow";
  view.innerHTML = `<div class="stack">
    ${M.canEdit() ? `<button class="btn primary lg" type="button" id="start" style="justify-self:start">${ICON.play}<span>${def.id === "full" ? "Start an HSE audit" : "Start a lifting assessment"}</span></button>` : ""}
    ${waiting.length ? `<section class="panel"><div class="panel-h"><h2>Waiting for your approval</h2><span class="muted">${waiting.length}</span></div>${waiting.map(a => card(esc(M.project(a.project_id).name), `<span class="ref num" style="font:700 13px var(--f-cond);color:var(--navy)">${esc(a.ref)}</span><span class="muted small">${esc(fmtDate(a.date))}</span>`, mtag(M.score(a).total), `data-a="${esc(a.id)}"`)).join("")}</section>` : ""}
    <section class="panel"><div class="panel-h"><h2>In progress</h2><span class="muted">Saved on this device</span></div>
      ${drafts.length ? drafts.map(a => { const s = M.score(a); return card(esc(M.project(a.project_id).name), `<span class="ref num" style="font:700 13px var(--f-cond);color:var(--navy)">${esc(a.ref)}</span>${auditChip(a)}<span class="muted small">${s.ratedCount}/${s.itemCount} rated · ${M.auditNCRs(a).length} NCRs</span>`, mtag(s.total), `data-a="${esc(a.id)}"`); }).join("") : `<p class="muted">No audit in progress.</p>`}</section>
    <section class="panel"><div class="panel-h"><h2>From the audit plan</h2><span class="muted">This month and next</span><a class="act btn sm ghost" href="${link("plan")}">Full plan</a></div>
      ${planned.length ? planned.map(p => { const pr = M.project(p.project_id); return card(esc(pr.name), `${planChip(p)}<span class="muted small">${monthName(p.month)} ${p.year} · ${esc(pr.code)}</span>`, M.canEdit() ? `<button class="btn sm primary" type="button" data-start="${esc(p.id)}">Start</button>` : "", `data-plan="${esc(p.id)}"`); }).join("") : `<p class="muted">Nothing planned for you this month.</p>`}</section>
    <section class="panel"><div class="panel-h"><h2>Recent audits</h2><a class="act btn sm ghost" href="${link("audits")}">All audits</a></div>
      ${recent.length ? recent.map(a => card(esc(M.project(a.project_id).name), `<span class="ref num" style="font:700 13px var(--f-cond);color:var(--navy)">${esc(a.ref)}</span><span class="muted small">${esc(fmtDate(a.date))}</span>${auditChip(a)}`, mtag(M.score(a).total), `data-a="${esc(a.id)}"`)).join("") : `<p class="muted">No audits yet.</p>`}</section>
  </div>`;
  const st = view.querySelector("#start"); if (st) st.onclick = () => startAudit(mod);
  view.addEventListener("click", e => {
    const s = e.target.closest("[data-start]"); if (s) { e.stopPropagation(); const p = M.plans(mod).find(x => x.id === s.dataset.start); return startAudit(mod, { plan_id: p.id, project_id: p.project_id }); }
    const a = e.target.closest("[data-a]"); if (a) go(link("audit", a.dataset.a));
  });
}
