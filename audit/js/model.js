// Domain rules: refs, previous audits, carried NCRs, plan status, NCR state.
import * as S from "./store.js";
import { moduleDef } from "./templates.js";
import { scoreAudit, gradeOf } from "./scoring.js";
import { todayISO, daysBetween } from "./ui.js";

export const def = m => moduleDef(m, S.settings());
export const projects = () => S.all("project").sort((a, b) => a.code.localeCompare(b.code));
export const activeProjects = () => projects().filter(p => p.active !== false);
export const project = id => S.get(id) || { id, name: "Unknown project", code: "?", city: "", country: "" };
const RANK = { admin: 0, approver: 1, auditor: 2, viewer: 3 };
export const members = () => S.all("member").sort((a, b) => (RANK[a.role] ?? 4) - (RANK[b.role] ?? 4) || a.name.localeCompare(b.name));
export const auditors = () => members().filter(m => m.active !== false && ["admin", "approver", "auditor"].includes(m.role));
export const member = id => S.get(id);
// P-20 7.2 exception: JV projects and projects outside Egypt
export const planException = p => !!p && (!!p.jv || (!!p.country && !/egypt|مصر/i.test(p.country)));

let current = null;
export const me = () => current;
export const setMe = m => { current = m; S.setActor(m ? (m.name || m.email || "") : ""); };
export const isAdmin = () => !!current && current.role === "admin";
export const canEdit = () => !!current && ["admin", "approver", "auditor"].includes(current.role);
// Administrators and approvers approve audits, e-mail the report to the project,
// and change the plan and the project list. Only administrators add users.
export const canApprove = () => !!current && (current.role === "admin" || current.role === "approver");
// Was this person on the audit? Lead auditor, team list, or a name on the audit.
// The server checks the same.
export const onAudit = (a, m = current) => {
  if (!a || !m) return false;
  const nm = String(m.name || "").trim().toLowerCase();
  return a.lead_id === m.id || (Array.isArray(a.team_ids) && a.team_ids.includes(m.id))
    || (!!nm && (a.auditors || []).some(x => x && String(x.name || "").trim().toLowerCase() === nm));
};
// Nobody approves an audit they were on.
export const mayApprove = a => canApprove() && !!a && !onAudit(a);

const byDate = (a, b) => (a.date || "").localeCompare(b.date || "") || (a.created_at || "").localeCompare(b.created_at || "");
export const audits = m => S.all("audit").filter(a => a.module === m).sort(byDate).reverse();
export const ncrs = m => S.all("ncr").filter(n => n.module === m);
export const goods = m => S.all("good").filter(g => g.module === m);
export const plans = m => S.all("plan").filter(p => p.module === m);
export const findItem = (d, id) => { for (const p of d.parts) { const it = p.items.find(x => x.id === id); if (it) return { ...it, part: p.id, partName: p.name }; } return null; };
export const auditNCRs = a => S.all("ncr").filter(n => n.audit_id === a.id).sort((x, y) => (x.seq || 0) - (y.seq || 0));
export const auditGoods = a => S.all("good").filter(g => g.audit_id === a.id).sort((x, y) => (x.created_at || "").localeCompare(y.created_at || ""));

export const scoreOpts = () => { const st = S.settings(); return { zeroIsNA: !!st.zeroIsNA, seriousEach: !!st.seriousEach, deductFrom: st.deductFrom === "percent" ? "percent" : "points", gradeOn: st.gradeOn === "whole" ? "whole" : "shown" }; };
export function score(a) {
  return scoreAudit(def(a.module), a, auditNCRs(a), scoreOpts());
}
export const grade = s => gradeOf(s, scoreOpts().gradeOn);
// How the deductions work, in words for the screens and reports.
export function ruleText(d) {
  const o = scoreOpts(); const of = o.deductFrom === "percent" ? " of the score" : "";
  return { serious: `${d.deductions.serious}%${of} ${o.seriousEach ? "for each one" : "once"}`, repeated: `${d.deductions.repeated}%${of} each` };
}
const r1 = v => Math.round(v * 10) / 10;
export const minus = v => (v ? "−" + r1(v) + "%" : "0");
export const finished = a => a.status === "submitted" || a.status === "approved";

// The last audit of the same type on the same project, before this one.
export function previousAudit(a) {
  const list = S.all("audit").filter(x => x.module === a.module && x.project_id === a.project_id && x.id !== a.id && finished(x) && byDate(x, a) < 0);
  return list.sort(byDate).pop() || null;
}
export const lastAuditOf = (m, projectId) => S.all("audit").filter(x => x.module === m && x.project_id === projectId && finished(x)).sort(byDate).pop() || null;

// NCRs from the last audit that are still open: the auditor checks each one on site.
export function carryCandidates(a) {
  const prev = previousAudit(a);
  if (!prev) return [];
  return auditNCRs(prev).filter(n => n.status === "Open" || (a.carry || []).some(c => c.ncr_id === n.id));
}
// "Percentage of correcting last audit violations"
export function correctionPct(a) {
  const prev = previousAudit(a);
  if (!prev) return null;
  const list = auditNCRs(prev);
  if (!list.length) return 100;
  const closed = list.filter(n => n.status === "Closed").length;
  return Math.round((100 * closed) / list.length);
}
export function previousScore(a) { const p = previousAudit(a); return p ? score(p).total : null; }

export function nextAuditNumber(m, projectId) {
  const n = S.all("audit").filter(x => x.module === m && x.project_id === projectId).reduce((mx, x) => Math.max(mx, x.number || 0), 0);
  return n + 1;
}
export const auditRef = (d, proj, n) => `${d.prefix}-${proj.code}-${String(n).padStart(2, "0")}`;

// NCR state as people read it
export function ncrState(n, today = todayISO()) {
  if (n.status === "Closed") return "closed";
  if (n.status === "Review") return "review";
  if (n.status === "Carried") return "carried";
  if (n.due_date && n.due_date < today) return "overdue";
  return "open";
}
export const NCR_STATE = { open: "Open", overdue: "Overdue", review: "Evidence under review", closed: "Closed", carried: "Repeated in next audit" };
// P-20 7.4: the report goes to the project through Corporate HSE within 7 days of the audit date.
export const sendOverdue = (a, today = todayISO()) => finished(a) && !(a.sent && a.sent.date) && daysBetween(a.date, today) > 7;
export const daysToClose = n => (n.status === "Closed" && n.ca_date && n.date ? Math.max(0, daysBetween(n.date, n.ca_date)) : null);
export const onTime = n => (n.status === "Closed" && n.ca_date && n.due_date ? n.ca_date <= n.due_date : null);

// Plan item status
export function planStatus(p, today = todayISO()) {
  const a = p.audit_id ? S.get(p.audit_id) : null;
  if (a && finished(a)) return "done";
  if (a) return "progress";
  const ym = `${p.year}-${String(p.month).padStart(2, "0")}`;
  const now = today.slice(0, 7);
  if (ym < now) return "overdue";
  if (ym === now) return "due";
  return "planned";
}
export const PLAN_STATE = { done: "Done", progress: "In progress", overdue: "Overdue", due: "This month", planned: "Planned" };

export const DUE_DAYS = { Serious: 1, Major: 7, Minor: 14 };
