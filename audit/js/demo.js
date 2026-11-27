// Demo data for a presentation: realistic audits, NCRs, good practices and plans on all
// company projects, saved on the server with demo: true so they can be removed in one go.
// The real auditors are used as the auditors of the demo audits.
import * as S from "./store.js";
import * as M from "./model.js";
import { sampleData } from "./seed.js";
import { todayISO } from "./ui.js";

const KINDS = ["plan", "audit", "ncr", "good"];
export const demoDocs = () => KINDS.flatMap(k => S.all(k)).filter(d => d.demo);
export function demoCounts() {
  const d = demoDocs();
  return { total: d.length, audits: d.filter(x => x.kind === "audit").length, ncrs: d.filter(x => x.kind === "ncr").length };
}

export async function loadDemo() {
  const now = new Date().toISOString();
  const all = sampleData(now, todayISO());
  const projects = new Set(M.projects().map(p => p.id));
  const real = M.auditors().filter(m => m.role === "auditor");
  const pool = real.length ? real : M.auditors().length ? M.auditors() : [M.me()];
  const sampleIds = new Map(all.filter(d => d.kind === "member").map(m => [m.name, m.id]));
  const map = new Map(); let k = 0;
  const who = id => { if (!map.has(id)) map.set(id, pool[k++ % pool.length]); return map.get(id); };
  const realName = name => (sampleIds.has(name) ? who(sampleIds.get(name)).name : name);
  // years where the real plan already has this project: keep the real plan, add no demo plan
  const realPlans = new Set(S.all("plan").filter(p => !p.demo).map(p => `${p.module}|${p.project_id}|${p.year}`));
  const skipped = new Set(), out = [];
  for (const d0 of all) {
    if (!KINDS.includes(d0.kind) || !projects.has(d0.project_id)) continue;
    const d = { ...d0, demo: true }; delete d.sample;
    if (d.kind === "plan") {
      if (realPlans.has(`${d.module}|${d.project_id}|${d.year}`)) { skipped.add(d.id); continue; }
      d.lead_id = who(d.lead_id).id; d.team_ids = (d.team_ids || []).map(x => who(x).id);
    }
    if (d.kind === "audit") {
      d.lead_id = who(d.lead_id).id;
      d.auditors = (d.auditors || []).map(a => ({ ...a, name: realName(a.name) }));
      if (d.sent) d.sent = { ...d.sent, by: realName(d.sent.by) };
    }
    if (d.kind === "ncr" && d.followup_name) d.followup_name = realName(d.followup_name);
    out.push(d);
  }
  for (const d of out) if (d.kind === "audit" && skipped.has(d.plan_id)) d.plan_id = null;
  await S.putMany(out); // new save time, so a second load after a removal reaches the server too
  await S.saveSettings({ demo: { loaded_at: now, by: M.me().name, count: out.length }, reminders: { ...(S.settings().reminders || {}), on: false } });
  return out.length;
}

export async function removeDemo() {
  const list = demoDocs();
  if (list.length) await S.putMany(list.map(d => ({ ...d, deleted: true })));
  await S.saveSettings({ demo: null });
  return list.length;
}
