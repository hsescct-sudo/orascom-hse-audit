// Domain rules: refs, previous audits, carried NCRs, plan status, NCR state.
import * as S from "./store.js";
import { moduleDef } from "./templates.js";
import { scoreAudit } from "./scoring.js";
import { todayISO, daysBetween } from "./ui.js";

export const def = m => moduleDef(m, S.settings());
export const projects = () => S.all("project").sort((a, b) => a.code.localeCompare(b.code));
export const activeProjects = () => projects().filter(p => p.active !== false);
export const project = id => S.get(id) || { id, name: "Unknown project", code: "?", city: "", country: "" };
export const members = () => S.all("member").sort((a, b) => (a.role === "admin" ? -1 : 0) - (b.role === "admin" ? -1 : 0) || a.name.localeCompare(b.name));
export const auditors = () => members().filter(m => m.active !== false && (m.role === "auditor" || m.role === "admin"));
export const member = id => S.get(id);

let current = null;
export const me = () => current;
export const setMe = m => { current = m; S.setActor(m ? (m.name || m.email || "") : ""); };
export const isAdmin = () => !!current && current.role === "admin";
export const canEdit = () => !!current && (current.role === "admin" || current.role === "auditor");

const byDate = (a, b) => (a.date || "").localeCompare(b.date || "") || (a.created_at || "").localeCompare(b.created_at || "");
export const audits = m => S.all("audit").filter(a => a.module === m).sort(byDate).reverse();
export const ncrs = m => S.all("ncr").filter(n => n.module === m);
export const goods = m => S.all("good").filter(g => g.module === m);
export const plans = m => S.all("plan").filter(p => p.module === m);
export const auditNCRs = a => S.all("ncr").filter(n => n.audit_id === a.id).sort((x, y) => (x.seq || 0) - (y.seq || 0));
export const auditGoods = a => S.all("good").filter(g => g.audit_id === a.id).sort((x, y) => (x.created_at || "").localeCompare(y.created_at || ""));

export function score(a) {
  return scoreAudit(def(a.module), a, auditNCRs(a), { zeroIsNA: !!S.settings().zeroIsNA });
}
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
