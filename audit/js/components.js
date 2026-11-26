// Small shared pieces: score tags, chips, chart setup.
import { esc, ensureECharts, COLORS, fmtDate } from "./ui.js";
import { gradeOf, fmtScore } from "./scoring.js";
import * as M from "./model.js";

export function tag(score, { size = "", sub = "", white = false } = {}) {
  const g = gradeOf(score);
  const v = score == null ? "–" : (Math.round(score * 10) / 10).toFixed(Number.isInteger(Math.round(score * 10) / 10) ? 0 : 1);
  return `<div class="stag ${g ? g.code : "none"} ${size} ${white ? "on-white" : ""}" role="img" aria-label="Score ${esc(v)}%${g ? ", " + esc(g.label) : ""}"><b class="s-score">${esc(v)}${score == null ? "" : "<small>%</small>"}</b><span class="s-label">${esc(g ? g.label : "Not scored")}</span>${sub ? `<span class="s-sub">${esc(sub)}</span>` : ""}</div>`;
}
export function mtag(score) {
  const g = gradeOf(score);
  return `<span class="mtag ${g ? g.code : "none"}" title="${esc(g ? g.label : "Not scored")}">${esc(fmtScore(score))}</span>`;
}
export const sevChip = s => `<span class="chip sev-${esc(s)}">${esc(s)}</span>`;
export const ncrChip = n => { const s = M.ncrState(n); return `<span class="chip st-${s}">${esc(M.NCR_STATE[s])}</span>`; };
export const repChip = n => (n.repeated ? `<span class="chip rep" title="Found before on this project">Repeated</span>` : "");
export const planChip = p => { const s = M.planStatus(p); return `<span class="chip pl-${s}">${esc(M.PLAN_STATE[s])}</span>`; };
export const AUDIT_STATUS = { draft: "In progress", submitted: "Waiting approval", approved: "Approved" };
export const auditChip = a => `<span class="chip au-${esc(a.status)}">${esc(AUDIT_STATUS[a.status] || a.status)}</span>`;
export const projLabel = p => `${esc(p.code)} · ${esc(p.name)}`;

export function projectOptions(selected = "", { all = "All projects", list = M.projects() } = {}) {
  return (all ? `<option value="">${esc(all)}</option>` : "") + list.map(p => `<option value="${esc(p.id)}" ${p.id === selected ? "selected" : ""}>${esc(p.code)} · ${esc(p.name)}</option>`).join("");
}
export function optionList(values, selected = "", empty = "") {
  return (empty !== null ? `<option value="">${esc(empty)}</option>` : "") + values.map(v => `<option ${v === selected ? "selected" : ""}>${esc(v)}</option>`).join("");
}
export const monthName = m => ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1];
export const dateCell = d => `<span class="nowrap">${esc(fmtDate(d))}</span>`;

// ---- charts ----
const FONT = '"Barlow Semi Condensed", Barlow, system-ui, sans-serif';
export async function chart(el, option) {
  const echarts = await ensureECharts();
  const c = echarts.getInstanceByDom(el) || echarts.init(el, null, { renderer: "svg" });
  c.setOption({
    textStyle: { fontFamily: FONT, color: COLORS.ink },
    animationDuration: 500,
    tooltip: { confine: true, textStyle: { fontFamily: FONT }, ...(option.tooltip || {}) },
    ...option,
  }, true);
  return c;
}
export function watchResize(charts) {
  const ro = new ResizeObserver(() => charts.forEach(c => c && c.resize()));
  charts.forEach(c => c && ro.observe(c.getDom()));
  return () => { ro.disconnect(); charts.forEach(c => c && c.dispose()); };
}
export const axisStyle = { axisLine: { lineStyle: { color: COLORS.line } }, axisTick: { show: false }, axisLabel: { color: COLORS.muted, fontFamily: FONT }, splitLine: { lineStyle: { color: "#edf1f6" } } };
export const gradeColor = s => { const g = gradeOf(s); return g ? COLORS.grade[g.code] : "#c8d2de"; };
