// Dashboard for one audit type. Full and Lifting never mix.
import * as M from "../model.js";
import * as S from "../store.js";
import { setTitle, link, go } from "../app.js";
import { tag, mtag, chart, watchResize, axisStyle, gradeColor, projectOptions, monthName } from "../components.js";
import { esc, todayISO, COLORS, pct } from "../ui.js";
import { GRADES } from "../templates.js";
import { fmtScore } from "../scoring.js";

const FKEY = "oc-audit-dash-filters";
export async function render(ctx) {
  const { module: mod, def, view } = ctx;
  setTitle("Dashboard", `${def.name} · ${def.formRef}`);
  const today = todayISO();
  const years = [...new Set([+today.slice(0, 4), ...M.audits(mod).map(a => +a.date.slice(0, 4)), ...M.plans(mod).map(p => p.year)])].sort((a, b) => b - a);
  let f = {}; try { f = JSON.parse(localStorage.getItem(FKEY) || "{}"); } catch (e) { /* none */ }
  f = { year: years.includes(+f.year) ? +f.year : (years.includes(+today.slice(0, 4)) ? +today.slice(0, 4) : years[0]), country: f.country || "", project: f.project || "" };
  const countries = [...new Set(M.projects().map(p => p.country))].sort();

  view.innerHTML = `
    <div class="filters" style="margin-bottom:16px">
      <select id="f-year" aria-label="Year">${years.map(y => `<option ${y === f.year ? "selected" : ""}>${y}</option>`).join("")}</select>
      <select id="f-country" aria-label="Country"><option value="">All countries</option>${countries.map(c => `<option ${c === f.country ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>
      <select id="f-project" aria-label="Project">${projectOptions(f.project)}</select>
    </div>
    <div class="dash" id="dash"></div>`;
  const onF = () => {
    f = { year: +view.querySelector("#f-year").value, country: view.querySelector("#f-country").value, project: view.querySelector("#f-project").value };
    try { localStorage.setItem(FKEY, JSON.stringify(f)); } catch (e) { /* ignore */ }
    draw();
  };
  view.querySelectorAll(".filters select").forEach(s => s.addEventListener("change", onF));

  let disposeCharts = () => {};
  async function draw() {
    disposeCharts();
    const inScope = p => (!f.country || p.country === f.country) && (!f.project || p.id === f.project);
    const projIds = new Set(M.projects().filter(inScope).map(p => p.id));
    const audits = M.audits(mod).filter(a => M.finished(a) && projIds.has(a.project_id) && +a.date.slice(0, 4) === f.year);
    const scored = audits.map(a => ({ a, s: M.score(a) })).filter(x => x.s.total != null);
    const plan = M.plans(mod).filter(p => p.year === f.year && projIds.has(p.project_id));
    const planDone = plan.filter(p => M.planStatus(p, today) === "done").length;
    const planOver = plan.filter(p => M.planStatus(p, today) === "overdue").length;
    const ncrs = M.ncrs(mod).filter(n => projIds.has(n.project_id) && +String(n.date).slice(0, 4) === f.year);
    const openN = ncrs.filter(n => ["open", "overdue"].includes(M.ncrState(n, today)));
    const overdueN = ncrs.filter(n => M.ncrState(n, today) === "overdue");
    const seriousN = ncrs.filter(n => n.severity === "Serious");
    const reviewN = ncrs.filter(n => M.ncrState(n, today) === "review");
    const unsentN = audits.filter(a => M.sendOverdue(a, today));
    const closed = ncrs.filter(n => n.status === "Closed");
    const onTime = closed.filter(n => M.onTime(n) === true).length;
    const avg = scored.length ? scored.reduce((t, x) => t + x.s.total, 0) / scored.length : null;
    // latest score per project
    const latest = new Map();
    for (const x of scored.slice().sort((p, q) => p.a.date.localeCompare(q.a.date))) latest.set(x.a.project_id, x);
    const byGrade = Object.fromEntries(GRADES.map(g => [g.code, 0]));
    for (const x of latest.values()) byGrade[x.s.grade.code]++;
    const nProj = latest.size;

    const dash = view.querySelector("#dash");
    if (!audits.length && !plan.length) {
      dash.innerHTML = `<div class="panel span-12 empty"><h3>No ${esc(def.short)} audits in ${f.year} yet</h3><p>Start from the audit plan, or start an audit on any project.</p><a class="btn primary" href="${link("plan")}">Open the audit plan</a></div>`;
      return;
    }
    const weakest = weakItems(def, scored);
    dash.innerHTML = `
      <section class="panel hero span-7" aria-label="Company score">
        ${tag(avg, { size: "xl", white: true, sub: scored.length ? `${scored.length} audit${scored.length > 1 ? "s" : ""}` : "" })}
        <div class="hero-txt">
          <h2>${avg == null ? "No scored audits yet" : `${esc(M.grade(avg).appraisal)}`}</h2>
          <p>Average ${esc(def.scoreLabel.toLowerCase())} of ${scored.length} ${esc(def.short)} audit${scored.length === 1 ? "" : "s"} in ${f.year}${f.country ? " in " + esc(f.country) : ""}. The bar shows each project's latest grade.</p>
          <div class="gradebar" role="img" aria-label="Projects by grade">${GRADES.map(g => byGrade[g.code] ? `<span class="${g.code}" style="flex:${byGrade[g.code]}" title="${esc(g.label)}: ${byGrade[g.code]} project${byGrade[g.code] > 1 ? "s" : ""}">${byGrade[g.code]}</span>` : "").join("")}</div>
          <div class="gradekey">${GRADES.map(g => `<span><i style="background:${COLORS.grade[g.code]}"></i>${esc(g.label)} ${g.min === 0 ? "below 65%" : g.min + "%+"}</span>`).join("")}</div>
        </div>
      </section>
      <section class="panel span-5"><div class="panel-h"><h2>Weakest areas</h2><span class="muted">Average rating across ${nProj} project${nProj === 1 ? "" : "s"}</span></div>
        <div class="chart" id="c-weak" style="height:${Math.max(220, weakest.length * 30 + 20)}px"></div></section>
      <section class="kpis span-12" aria-label="Key figures">
        <div class="kpi"><div class="k-v num">${planDone}<small>/${plan.length}</small></div><div class="k-l">Planned audits done${planOver ? `, <b style="color:var(--g-red)">${planOver} overdue</b>` : ""}</div><div class="k-meter"><b style="width:${pct(planDone, plan.length) || 0}%"></b></div></div>
        <div class="kpi"><div class="k-v num">${openN.length}</div><div class="k-l">Open NCRs</div></div>
        <div class="kpi ${reviewN.length ? "alert" : ""}"><div class="k-v num">${reviewN.length}</div><div class="k-l">NCR evidence waiting for review</div></div>
        <div class="kpi ${unsentN.length ? "alert" : ""}"><div class="k-v num">${unsentN.length}</div><div class="k-l">Reports not sent after 7 days</div></div>
        <div class="kpi ${overdueN.length ? "alert" : ""}"><div class="k-v num">${overdueN.length}</div><div class="k-l">NCRs past the deadline</div></div>
        <div class="kpi ${seriousN.length ? "alert" : ""}"><div class="k-v num">${seriousN.length}</div><div class="k-l">Serious NCRs this year</div></div>
        <div class="kpi"><div class="k-v num">${closed.length ? pct(onTime, closed.length) : "–"}<small>${closed.length ? "%" : ""}</small></div><div class="k-l">NCRs closed on time</div></div>
      </section>
      <section class="panel span-5"><div class="panel-h"><h2>Projects</h2><span class="muted">Latest score, last audits</span></div>
        <div class="league" id="league" style="max-height:470px;overflow-y:auto"></div></section>
      <section class="panel span-7"><div class="panel-h"><h2>${mod === "full" ? "Ratings by element" : "Ratings by section"}</h2><span class="muted">Latest audit of each project</span></div>
        <div class="chart tall" id="c-heat"></div></section>
      <section class="panel span-6"><div class="panel-h"><h2>Score by month</h2><span class="muted">Average score and number of audits</span></div><div class="chart" id="c-trend"></div></section>
      <section class="panel span-6"><div class="panel-h"><h2>Audit plan ${f.year}</h2><span class="muted">${planDone} done of ${plan.length}</span><a class="act btn sm ghost" href="${link("plan")}">Open plan</a></div><div class="chart" id="c-plan"></div></section>
      <section class="panel span-6"><div class="panel-h"><h2>NCRs by type</h2><span class="muted">${ncrs.length} NCRs in ${f.year}</span><a class="act btn sm ghost" href="${link("ncrs")}">NCR register</a></div><div class="chart tall" id="c-cls"></div></section>
      <section class="panel span-3"><div class="panel-h"><h2>Root causes</h2></div><div class="chart tall" id="c-root"></div></section>
      <section class="panel span-3"><div class="panel-h"><h2>Open NCRs by project</h2></div><div class="chart tall" id="c-open"></div></section>`;

    // league
    const rows = [...latest.values()].sort((p, q) => q.s.total - p.s.total);
    view.querySelector("#league").innerHTML = rows.length ? rows.map((x, i) => {
      const p = M.project(x.a.project_id);
      const hist = M.audits(mod).filter(a => a.project_id === p.id && M.finished(a)).slice(0, 5).reverse().map(a => M.score(a).total);
      return `<div class="league-row" data-p="${esc(p.id)}" role="link" tabindex="0"><span class="rk">${i + 1}</span><span class="nm"><b>${esc(p.name)}</b><small>${esc(p.code)} · ${esc(p.city)}</small></span>${spark(hist)}${mtag(x.s.total)}</div>`;
    }).join("") : `<p class="muted">No scored audits yet.</p>`;
    view.querySelector("#league").onclick = e => { const r = e.target.closest("[data-p]"); if (r) go(link("audits") + "?project=" + r.dataset.p); };

    const charts = [];
    charts.push(await chart(view.querySelector("#c-weak"), {
      grid: { left: 8, right: 46, top: 4, bottom: 4, containLabel: true },
      xAxis: { type: "value", max: 100, show: false },
      yAxis: { type: "category", inverse: true, data: weakest.map(w => w.title), ...axisStyle, axisLabel: { ...axisStyle.axisLabel, width: 210, overflow: "truncate" } },
      tooltip: { trigger: "axis", axisPointer: { type: "none" }, valueFormatter: v => v.toFixed(0) + "%" },
      series: [{ type: "bar", barWidth: 14, data: weakest.map(w => ({ value: Math.round(w.avg * 10) / 10, itemStyle: { color: gradeColor(w.avg), borderRadius: [0, 4, 4, 0] } })), label: { show: true, position: "right", formatter: p => p.value.toFixed(0) + "%", fontWeight: 700 } }],
    }));
    charts.push(await heat(view.querySelector("#c-heat"), def, mod, [...latest.values()]));
    // trend by month
    const months = Array.from({ length: 12 }, (_, i) => i + 1);
    const mAvg = months.map(m => { const l = scored.filter(x => +x.a.date.slice(5, 7) === m); return l.length ? Math.round(l.reduce((t, x) => t + x.s.total, 0) / l.length * 10) / 10 : null; });
    const mCnt = months.map(m => scored.filter(x => +x.a.date.slice(5, 7) === m).length);
    charts.push(await chart(view.querySelector("#c-trend"), {
      grid: { left: 8, right: 8, top: 30, bottom: 4, containLabel: true },
      legend: { top: 0, right: 0, icon: "roundRect", textStyle: { color: COLORS.muted } },
      tooltip: { trigger: "axis" },
      xAxis: { type: "category", data: months.map(monthName), ...axisStyle },
      yAxis: [{ type: "value", min: 40, max: 100, ...axisStyle, axisLabel: { ...axisStyle.axisLabel, formatter: "{value}%" } }, { type: "value", show: false }],
      series: [
        { name: "Audits", type: "bar", yAxisIndex: 1, data: mCnt, barWidth: 16, itemStyle: { color: "#dbe4ee", borderRadius: [3, 3, 0, 0] } },
        { name: "Average score", type: "line", data: mAvg, connectNulls: true, smooth: 0.25, symbolSize: 9, lineStyle: { color: COLORS.navy, width: 3 }, itemStyle: { color: p => gradeColor(p.value) },
          markLine: { silent: true, symbol: "none", label: { formatter: "{c}%", color: COLORS.muted, position: "insideEndTop" }, lineStyle: { type: "dashed", color: "#9fb0c4" }, data: [{ yAxis: 85 }, { yAxis: 65 }] } },
      ],
    }));
    // plan by month
    const ps = ["done", "progress", "due", "overdue", "planned"], pc = { done: COLORS.grade.green, progress: "#3d7dd8", due: COLORS.grade.orange, overdue: COLORS.grade.red, planned: "#cfd9e5" };
    charts.push(await chart(view.querySelector("#c-plan"), {
      grid: { left: 8, right: 8, top: 30, bottom: 4, containLabel: true },
      legend: { top: 0, right: 0, icon: "roundRect", textStyle: { color: COLORS.muted } },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      xAxis: { type: "category", data: months.map(monthName), ...axisStyle },
      yAxis: { type: "value", minInterval: 1, ...axisStyle },
      series: ps.map(s => ({ name: M.PLAN_STATE[s], type: "bar", stack: "p", barWidth: 18, itemStyle: { color: pc[s] }, data: months.map(m => plan.filter(p => p.month === m && M.planStatus(p, today) === s).length || null) })),
    }));
    // NCR classes (top 12) stacked by severity
    const cls = {}; for (const n of ncrs) { cls[n.classification] = cls[n.classification] || { Serious: 0, Major: 0, Minor: 0, t: 0 }; cls[n.classification][n.severity]++; cls[n.classification].t++; }
    const top = Object.entries(cls).sort((a, b) => b[1].t - a[1].t).slice(0, 12);
    charts.push(await chart(view.querySelector("#c-cls"), {
      grid: { left: 8, right: 16, top: 30, bottom: 4, containLabel: true },
      legend: { top: 0, right: 0, icon: "roundRect", textStyle: { color: COLORS.muted } },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      xAxis: { type: "value", minInterval: 1, ...axisStyle },
      yAxis: { type: "category", inverse: true, data: top.map(t => t[0]), ...axisStyle, axisLabel: { ...axisStyle.axisLabel, width: 190, overflow: "truncate" } },
      series: ["Serious", "Major", "Minor"].map(s => ({ name: s, type: "bar", stack: "s", barWidth: 14, itemStyle: { color: COLORS.sev[s] }, data: top.map(t => t[1][s] || null) })),
    }));
    const rc = {}; for (const n of ncrs) for (const r of (n.root_causes || [])) rc[r] = (rc[r] || 0) + 1;
    const rcs = Object.entries(rc).sort((a, b) => b[1] - a[1]);
    charts.push(await chart(view.querySelector("#c-root"), {
      grid: { left: 8, right: 34, top: 4, bottom: 4, containLabel: true },
      xAxis: { type: "value", show: false },
      yAxis: { type: "category", inverse: true, data: rcs.map(r => r[0]), ...axisStyle, axisLabel: { ...axisStyle.axisLabel, width: 110, overflow: "break" } },
      series: [{ type: "bar", barWidth: 16, data: rcs.map(r => r[1]), itemStyle: { color: COLORS.navy, borderRadius: [0, 4, 4, 0] }, label: { show: true, position: "right", fontWeight: 700 } }],
    }));
    const op = {}; for (const n of openN) op[n.project_id] = op[n.project_id] || { o: 0, d: 0 };
    for (const n of openN) { if (M.ncrState(n, today) === "overdue") op[n.project_id].d++; else op[n.project_id].o++; }
    const ops = Object.entries(op).sort((a, b) => (b[1].o + b[1].d) - (a[1].o + a[1].d)).slice(0, 10);
    charts.push(await chart(view.querySelector("#c-open"), {
      grid: { left: 8, right: 10, top: 30, bottom: 4, containLabel: true },
      legend: { top: 0, right: 0, icon: "roundRect", textStyle: { color: COLORS.muted } },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, formatter: ps2 => `${esc(M.project(ops[ps2[0].dataIndex][0]).name)}<br>` + ps2.map(p => `${p.marker}${p.seriesName}: ${p.value || 0}`).join("<br>") },
      xAxis: { type: "value", minInterval: 1, ...axisStyle },
      yAxis: { type: "category", inverse: true, data: ops.map(o => M.project(o[0]).code), ...axisStyle },
      series: [
        { name: "Past deadline", type: "bar", stack: "o", barWidth: 14, itemStyle: { color: COLORS.grade.red }, data: ops.map(o => o[1].d || null) },
        { name: "Open", type: "bar", stack: "o", itemStyle: { color: COLORS.grade.orange }, data: ops.map(o => o[1].o || null) },
      ],
    }));
    disposeCharts = watchResize(charts);
  }
  await draw();
  return () => disposeCharts();
}

function weakItems(def, scored) {
  const latest = new Map();
  for (const x of scored.slice().sort((p, q) => p.a.date.localeCompare(q.a.date))) latest.set(x.a.project_id, x);
  const rows = [];
  for (const p of def.parts) for (const it of p.items) {
    const vals = [...latest.values()].map(x => x.a.ratings && x.a.ratings[it.id]).filter(v => typeof v === "number");
    if (vals.length) rows.push({ title: it.title, avg: vals.reduce((a, b) => a + b, 0) / vals.length });
  }
  return rows.sort((a, b) => a.avg - b.avg).slice(0, 8);
}

function spark(vals) {
  const v = vals.filter(x => x != null);
  if (v.length < 2) return `<span class="spark muted small">${v.length ? "1 audit" : ""}</span>`;
  const w = 110, h = 28, lo = 40, hi = 100;
  const pts = v.map((x, i) => [4 + (i * (w - 8)) / (v.length - 1), h - 4 - ((Math.max(lo, x) - lo) / (hi - lo)) * (h - 8)]);
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${pts.map(p => p.join(",")).join(" ")}" fill="none" stroke="#9fb0c4" stroke-width="2"/>${pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="${gradeColor(v[i])}"/>`).join("")}</svg>`;
}

async function heat(el, def, mod, rows) {
  rows = rows.slice().sort((a, b) => b.s.total - a.s.total);
  const projs = rows.map(x => M.project(x.a.project_id));
  let yLabels, data = [];
  if (mod === "full") {
    const items = def.parts.flatMap(p => p.items);
    yLabels = items.map(it => it.title);
    rows.forEach((x, xi) => items.forEach((it, yi) => { const v = x.a.ratings[it.id]; data.push([xi, yi, typeof v === "number" ? v : "-"]); }));
  } else {
    yLabels = def.parts.map(p => `${p.code}. ${p.name}`);
    rows.forEach((x, xi) => x.s.parts.forEach((p, yi) => data.push([xi, yi, p.score == null ? "-" : Math.round(p.score * 1000) / 10])));
  }
  el.style.height = Math.max(320, yLabels.length * 22 + 70) + "px";
  const narrow = el.clientWidth < 600;
  return chart(el, {
    grid: { left: 8, right: 8, top: 6, bottom: 50, containLabel: true },
    tooltip: { formatter: p => `${esc(projs[p.value[0]].name)}<br>${esc(yLabels[p.value[1]])}: <b>${p.value[2] === "-" ? "N/A" : p.value[2] + "%"}</b>` },
    xAxis: { type: "category", data: projs.map(p => p.code), ...axisStyle, axisLabel: { ...axisStyle.axisLabel, rotate: 60, fontSize: 11 }, splitArea: { show: false } },
    yAxis: { type: "category", data: yLabels, inverse: true, ...axisStyle, axisLabel: { ...axisStyle.axisLabel, width: narrow ? 120 : 200, overflow: "truncate", fontSize: narrow ? 10 : 12 } },
    visualMap: { show: false, type: "piecewise", dimension: 2, pieces: [{ min: 85, color: COLORS.grade.green }, { min: 75, max: 85, color: COLORS.grade.orange }, { min: 65, max: 75, color: COLORS.grade.yellow }, { max: 65, color: COLORS.grade.red }], outOfRange: { color: "#e8edf3" } },
    series: [{ type: "heatmap", data, itemStyle: { borderColor: "#fff", borderWidth: 2, borderRadius: 3 }, emphasis: { itemStyle: { borderColor: COLORS.ink } } }],
  });
}
