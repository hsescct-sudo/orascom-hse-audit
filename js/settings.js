// Settings that administrators change in the app (no code): checklist, lists, dashboard, reports, names.
// Stored in the app_settings table; every value has a built-in default so the app works without it.
import { applyChecklist, applyRootCauses } from "./checklist.js";

export const DASH_PANELS = [
  ["hero", "Closure rate (headline tile)"], ["kpis", "Key figure tiles"], ["c-proj", "Findings by project / area"], ["c-status", "Close-out status"],
  ["c-trend", "Raised, closed and still open per month"], ["c-age", "How long open findings wait"], ["c-topic", "Findings by topic"], ["c-rc", "Top root causes"],
  ["c-heat", "Where findings concentrate (heat map)"], ["c-league", "Project performance table"], ["c-over", "Overdue findings"], ["c-sup", "Needs management support"],
  ["c-items", "Checks that fail most often"], ["c-cov", "Audit coverage by location"],
];
export const DEFAULTS = {
  general: { appName: "HSE Flash Audit", unitName: "Corporate HSE", company: "Orascom Construction" },
  dashboard: { title: "HSE Performance Dashboard", eyebrow: "Corporate HSE · Flash Audit", closureTarget: 90, complianceTarget: 90, defaultPeriod: "all", hidden: [] },
  report: { title: "HSE Flash Audit Report", formRef: "F-HSE-0075", formRev: "01", dept: "HSE Dept.", footer: "HSE Flash Audit · Orascom Construction · Corporate HSE" },
  lists: { rootCauses: null },
  checklist: null,
};
export const SETTINGS = JSON.parse(JSON.stringify(DEFAULTS));
export const settingsState = { loaded: false, missingTable: false, updated: {} };

function apply() {
  applyChecklist(SETTINGS.checklist);
  applyRootCauses(SETTINGS.lists && SETTINGS.lists.rootCauses);
}
export async function loadSettings(api) {
  try {
    const rows = await api.getSettings();
    settingsState.missingTable = false;
    Object.keys(DEFAULTS).forEach(k => { SETTINGS[k] = JSON.parse(JSON.stringify(DEFAULTS[k])); });
    rows.forEach(r => {
      if (!(r.key in DEFAULTS)) return;
      const d = DEFAULTS[r.key];
      SETTINGS[r.key] = d && typeof d === "object" && !Array.isArray(d) ? { ...d, ...(r.value || {}) } : r.value;
      settingsState.updated[r.key] = { at: r.updated_at, by: r.updated_by };
    });
  } catch (e) {
    settingsState.missingTable = /app_settings|does not exist|schema cache|PGRST20/i.test(e.message || "");
    console.warn("Settings not loaded, using defaults:", e.message);
  }
  settingsState.loaded = true;
  apply();
  return SETTINGS;
}
export async function saveSettings(api, key, value, by) {
  await api.saveSetting(key, value, by);
  SETTINGS[key] = DEFAULTS[key] && typeof DEFAULTS[key] === "object" ? { ...DEFAULTS[key], ...value } : value;
  settingsState.updated[key] = { at: new Date().toISOString(), by };
  apply();
}
export const panelOn = id => !(SETTINGS.dashboard.hidden || []).includes(id);
// The corporate form's reference (Settings › Reports & names). Blank = no form number shown anywhere.
export const formRef = () => String(SETTINGS.report.formRef || "").trim();
export const formLabel = () => (formRef() ? `${formRef()} form` : "corporate audit form");

// The SQL an administrator runs once in Supabase (also in supabase/schema.sql).
export const SETTINGS_SQL = `create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text not null default ''
);
alter table public.app_settings enable row level security;
drop policy if exists settings_read on public.app_settings;
drop policy if exists settings_admin on public.app_settings;
create policy settings_read on public.app_settings for select to authenticated using (true);
create policy settings_admin on public.app_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.app_settings to authenticated;
revoke all on public.app_settings from anon;`;
