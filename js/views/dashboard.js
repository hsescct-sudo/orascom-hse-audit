import { esc, fmtDate, fRef, findingState, STATE_LABEL, RISK_LABEL, COLORS, todayISO, addDays, daysBetween, monthKey, monthLabel, pct, riskChip, stateChip, ensureExcelJS, saveBlob, toast } from "../ui.js";
import { TOPICS, TOPIC, ITEM, topicName } from "../checklist.js";

const INK = "#1b2430", MUTED = "#6b7280", GRID = "#e8e8e4", AXIS = "#c3c2b7";
const STATES = ["closed", "pending", "open", "overdue"];
const RISKS = ["High", "Med", "Low"];
const PERIODS = [["all", "All time"], ["30", "Last 30 days"], ["90", "Last 90 days"], ["180", "Last 6 months"], ["year", "This year"], ["custom", "Custom range"]];

export async function render(root, ctx) {
  const { store, isAdmin, me, query } = ctx;
  await store.load();
  const f = { project: query.project || "", period: query.period || "all", from: query.from || "", to: query.to || "", type: query.type || "", risk: query.risk || "", topic: query.topic || "" };
  const charts = [];
  const sel = (id, opts, v) => `<select id="${id}">${opts.map(([k, l]) => `<option value="${esc(k)}" ${k === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;

  root.innerHTML = `
    <div class="page-head"><div><h1>${isAdmin ? "HSE Flash Audit Dashboard" : esc(me.project_name)}</h1><p class="muted" id="asof"></p></div>
      <div class="actions"><button class="btn ghost" id="dl">Download summary</button>${isAdmin ? "" : `<a class="btn primary" href="#/new">New audit</a>`}</div></div>
    <div class="slicers card">
      ${isAdmin ? `<label class="fld"><span>Project</span>${sel("s-project", [["", "All projects"], ...store.projects.map(p => [p.id, p.name])], f.project)}</label>` : ""}
      <label class="fld"><span>Period</span>${sel("s-period", PERIODS, f.period)}</label>
      <label class="fld" id="w-from" ${f.period === "custom" ? "" : "hidden"}><span>From</span><input type="date" id="s-from" value="${esc(f.from)}"></label>
      <label class="fld" id="w-to" ${f.period === "custom" ? "" : "hidden"}><span>To</span><input type="date" id="s-to" value="${esc(f.to)}"></label>
      <label class="fld"><span>Audit type</span>${sel("s-type", [["", "All"], ["corporate", "Corporate"], ["project", "Project"]], f.type)}</label>
      <label class="fld"><span>Risk</span>${sel("s-risk", [["", "All"], ["High", "High"], ["Med", "Medium"], ["Low", "Low"]], f.risk)}</label>
      <label class="fld"><span>Topic</span>${sel("s-topic", [["", "All topics"], ...TOPICS.map(t => [t.code, t.name])], f.topic)}</label>
      <button class="btn ghost sm" id="s-reset">Reset</button>
    </div>
    <div id="dash"></div>`;

  function range() {
    const t = todayISO();
    if (f.period === "30" || f.period === "90" || f.period === "180") return [addDays(t, -+f.period), t];
    if (f.period === "year") return [t.slice(0, 4) + "-01-01", t];
    if (f.period === "custom") return [f.from || "0000", f.to || "9999"];
    return ["0000", "9999"];
  }
  function data() {
    const [from, to] = range();
    const audits = store.audits.filter(a => (!f.project || a.project_id === f.project) && (!f.type || a.audit_type === f.type) && a.audit_date >= from && a.audit_date <= to);
    const aIds = new Set(audits.map(a => a.id));
    const findings = store.findings.filter(x => aIds.has(x.audit_id) && (!f.risk || x.risk === f.risk) && (!f.topic || x.topic === f.topic));
    return { audits, findings, from, to };
  }
  const regLink = extra => {
    const [from, to] = range();
    const q = { project: f.project, type: f.type, risk: f.risk, topic: f.topic, ...(f.period !== "all" ? { from: from === "0000" ? "" : from, to: to === "9999" ? "" : to } : {}), ...extra };
    return "#/register?" + new URLSearchParams(Object.entries(q).filter(([, v]) => v)).toString();
  };

  function draw() {
    charts.splice(0).forEach(c => c.dispose());
    const { audits, findings } = data();
    const today = todayISO();
    const st = { open: 0, overdue: 0, pending: 0, closed: 0 }; findings.forEach(x => st[findingState(x, today)]++);
    const notClosed = st.open + st.overdue + st.pending;
    const highOpen = findings.filter(x => x.risk === "High" && x.status !== "closed").length;
    const closedLate = findings.filter(x => x.status === "closed" && x.closed_at && !x.fixed_on_spot);
    const avgClose = closedLate.length ? Math.round(closedLate.reduce((s, x) => s + Math.max(0, daysBetween(x.audits?.audit_date || x.created_at.slice(0, 10), x.closed_at.slice(0, 10))), 0) / closedLate.length) : null;
    let ok = 0, nc = 0;
    audits.forEach(a => Object.entries(a.checks || {}).forEach(([id, v]) => { if (f.topic && ITEM[id]?.topic !== f.topic) return; if (v === "ok") ok++; if (v === "nc") nc++; }));
    const overdueList = findings.filter(x => findingState(x, today) === "overdue").map(x => ({ x, d: daysBetween(x.target_date, today) })).sort((a, b) => b.d - a.d);
    const support = findings.filter(x => x.needs_support && x.status !== "closed");
    root.querySelector("#asof").textContent = `${audits.length} audits · ${findings.length} findings · updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

    const kpi = (label, value, sub, href, tone = "") => `<a class="kpi ${tone}" href="${href}"><span>${label}</span><b>${value}</b><small>${sub || "&nbsp;"}</small></a>`;
    const dash = root.querySelector("#dash");
    dash.innerHTML = `
      <div class="kpis">
        ${kpi("Audits", audits.length, `${audits.filter(a => a.audit_type === "corporate").length} corporate · ${audits.filter(a => a.audit_type === "project").length} project`, "#/audits")}
        ${kpi("Findings", findings.length, `${findings.filter(x => x.risk === "High").length} high risk`, regLink({}))}
        ${kpi("Not closed", notClosed, `${st.pending} waiting for review`, regLink({ status: "notclosed" }), notClosed ? "warn" : "")}
        ${kpi("Overdue", st.overdue, overdueList.length ? `oldest ${overdueList[0].d} days late` : "none late", regLink({ status: "overdue" }), st.overdue ? "bad" : "good")}
        ${kpi("High risk not closed", highOpen, "", regLink({ status: "notclosed", risk: "High" }), highOpen ? "bad" : "good")}
        ${kpi("Closure rate", findings.length ? pct(st.closed, findings.length) + "%" : "—", `${st.closed} closed`, regLink({ status: "closed" }))}
        ${kpi("Average days to close", avgClose == null ? "—" : avgClose, "excluding on-the-spot fixes", regLink({ status: "closed" }))}
        ${kpi("Checklist compliance", ok + nc ? pct(ok, ok + nc) + "%" : "—", ok + nc ? `${ok + nc} checks rated` : "no checklist audits", "#/audits")}
      </div>
      ${findings.length ? `
      <div class="dgrid">
        <section class="card c8"><div class="ch"><h2>${isAdmin && !f.project ? "Findings by project" : "Findings by area"}</h2><span class="muted small">by status · click a bar to open the list</span></div><div class="chart" id="c-proj"></div></section>
        <section class="card c4"><div class="ch"><h2>Status</h2></div><div class="statlist">${STATES.map(s => `<a href="${regLink({ status: s })}" class="srow"><span class="sw" style="background:${COLORS.state[s]}"></span><span>${STATE_LABEL[s]}</span><b>${st[s]}</b><span class="hbar"><i style="width:${pct(st[s], findings.length)}%;background:${COLORS.state[s]}"></i></span><small>${pct(st[s], findings.length)}%</small></a>`).join("")}</div>
          <div class="ch sub"><h2>Risk</h2></div><div class="statlist">${RISKS.map(r => { const n = findings.filter(x => x.risk === r).length; return `<a href="${regLink({ risk: r })}" class="srow"><span class="sw" style="background:${COLORS.risk[r]}"></span><span>${RISK_LABEL[r]}</span><b>${n}</b><span class="hbar"><i style="width:${pct(n, findings.length)}%;background:${COLORS.risk[r]}"></i></span><small>${pct(n, findings.length)}%</small></a>`; }).join("")}</div></section>
        <section class="card c6"><div class="ch"><h2>Findings raised and closed per month</h2></div><div class="chart" id="c-trend"></div></section>
        <section class="card c6"><div class="ch"><h2>Findings by topic</h2><span class="muted small">by risk</span></div><div class="chart tall" id="c-topic"></div></section>
        ${isAdmin && !f.project && store.projects.length > 1 ? `<section class="card c12"><div class="ch"><h2>Where findings concentrate</h2><span class="muted small">number of findings · project × topic · click a cell to open them</span></div><div class="chart" id="c-heat"></div></section>` : ""}
        <section class="card c4"><div class="ch"><h2>Top root causes</h2></div><div class="chart" id="c-rc"></div></section>
        <section class="card c4"><div class="ch"><h2>Most repeated checklist items</h2></div><div id="c-items" class="rank"></div></section>
        <section class="card c4"><div class="ch"><h2>Needs management support</h2><span class="muted small">${support.length} not closed</span></div>
          <div class="rank">${support.slice(0, 8).map(x => `<a class="rrow" href="#/finding/${x.id}"><span><b>${esc(x.support_title || topicName(x.topic))}</b><small class="muted">${esc(x.projects?.name || "")} · ${fRef(x.ref)}</small></span>${riskChip(x.risk)}</a>`).join("") || `<p class="muted">Nothing waiting for management.</p>`}${support.length > 8 ? `<a class="linkish" href="${regLink({ support: "1", status: "notclosed" })}">All ${support.length} ›</a>` : ""}</div></section>
        <section class="card c${isAdmin && !f.project ? 6 : 12}"><div class="ch"><h2>Overdue findings</h2><a class="linkish" href="${regLink({ status: "overdue" })}">Open the list ›</a></div>
          ${overdueList.length ? `<div class="tscroll"><table class="tbl compact"><thead><tr><th>Ref</th>${isAdmin ? "<th>Project</th>" : ""}<th>Observation</th><th class="num">Days late</th></tr></thead><tbody>
          ${overdueList.slice(0, 10).map(({ x, d }) => `<tr class="click" onclick="location.hash='#/finding/${x.id}'"><td><b>${fRef(x.ref)}</b> ${riskChip(x.risk)}</td>${isAdmin ? `<td>${esc(x.projects?.name || "")}</td>` : ""}<td class="obs">${esc(x.observation.slice(0, 80))}${x.observation.length > 80 ? "…" : ""}${x.owner ? `<div class="muted small">Owner: ${esc(x.owner)}</div>` : ""}</td><td class="num"><b class="t-over">${d}</b></td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">No overdue findings.</p>`}</section>
        ${isAdmin && !f.project ? `<section class="card c6"><div class="ch"><h2>Project performance</h2><span class="muted small">sorted by overdue</span></div><div id="c-league"></div></section>` : ""}
      </div>` : `<div class="empty"><h3>No findings in this view</h3><p>${store.findings.length ? "Change the filters above to see data." : "Findings appear here once audits are carried out or Excel reports are imported."}</p><div class="btnrow center"><a class="btn primary" href="#/new">New audit</a><a class="btn ghost" href="#/import">Import Excel report</a></div></div>`}`;
    if (!findings.length || !window.echarts) { if (!window.echarts && findings.length) toast("The chart library didn't load. Check the internet connection.", "error"); return; }

    const mk = (id, option, onClick) => {
      const el = dash.querySelector("#" + id); if (!el) return null;
      const c = window.echarts.init(el, null, { renderer: "svg" });
      c.setOption({ textStyle: { fontFamily: "Segoe UI, system-ui, sans-serif", color: INK }, animationDuration: 400, ...option });
      if (onClick) c.on("click", onClick);
      charts.push(c); return c;
    };
    const axisCat = { axisLine: { lineStyle: { color: AXIS } }, axisTick: { show: false }, axisLabel: { color: MUTED } };
    const axisVal = { splitLine: { lineStyle: { color: GRID } }, axisLine: { show: false }, axisLabel: { color: MUTED }, minInterval: 1 };
    const tip = { backgroundColor: "#fff", borderColor: "#d9dde3", textStyle: { color: INK, fontSize: 12 }, extraCssText: "box-shadow:0 4px 14px rgba(0,0,0,.12);border-radius:8px;" };
    const legend = { top: 0, left: 0, icon: "roundRect", itemWidth: 12, itemHeight: 12, textStyle: { color: INK, fontSize: 12 } };

    // findings by project (or by area for one project)
    const groupKey = isAdmin && !f.project ? (x => x.project_id) : (x => (x.area || "Not stated").trim());
    const groups = {};
    findings.forEach(x => { const k = groupKey(x); const g = groups[k] = groups[k] || { k, closed: 0, pending: 0, open: 0, overdue: 0, n: 0 }; g[findingState(x, today)]++; g.n++; });
    let gl = Object.values(groups).sort((a, b) => a.n - b.n);
    if (gl.length > 14 && !(isAdmin && !f.project)) gl = gl.slice(-14);
    const gname = g => (isAdmin && !f.project ? (store.project(g.k)?.name || "—") : g.k);
    const projEl = dash.querySelector("#c-proj"); projEl.style.height = Math.max(240, gl.length * 34 + 60) + "px";
    mk("c-proj", {
      grid: { left: 8, right: 24, top: 34, bottom: 8, containLabel: true }, legend: { ...legend, data: STATES.map(s => STATE_LABEL[s]) },
      tooltip: { ...tip, trigger: "axis", axisPointer: { type: "shadow", shadowStyle: { color: "rgba(0,56,118,.06)" } } },
      xAxis: { type: "value", ...axisVal },
      yAxis: { type: "category", data: gl.map(gname), ...axisCat, axisLabel: { color: INK, width: 220, overflow: "truncate" } },
      series: STATES.map((s, i) => ({ name: STATE_LABEL[s], type: "bar", stack: "s", barMaxWidth: 20, data: gl.map(g => g[s]), itemStyle: { color: COLORS.state[s], borderColor: "#fff", borderWidth: 1, borderRadius: i === STATES.length - 1 ? [0, 4, 4, 0] : 0 }, emphasis: { focus: "series" } })),
    }, p => { const g = gl[p.dataIndex]; location.hash = regLink(isAdmin && !f.project ? { project: g.k, status: STATES[p.seriesIndex] } : { q: g.k, status: STATES[p.seriesIndex] }); });

    // monthly trend
    const months = [];
    const minDate = findings.reduce((m, x) => { const d = x.audits?.audit_date || x.created_at.slice(0, 10); return d < m ? d : m; }, today);
    let k = monthKey(minDate); const endK = monthKey(today);
    while (k <= endK && months.length < 24) { months.push(k); const [y, m] = k.split("-").map(Number); k = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`; }
    const raised = months.map(mk2 => findings.filter(x => monthKey(x.audits?.audit_date || x.created_at) === mk2).length);
    const closed = months.map(mk2 => findings.filter(x => x.status === "closed" && x.closed_at && monthKey(x.closed_at) === mk2).length);
    mk("c-trend", {
      grid: { left: 8, right: 36, top: 34, bottom: 8, containLabel: true }, legend: { ...legend, data: ["Raised", "Closed"] },
      tooltip: { ...tip, trigger: "axis", axisPointer: { type: "line", lineStyle: { color: AXIS } } },
      xAxis: { type: "category", data: months.map(monthLabel), boundaryGap: false, ...axisCat }, yAxis: { type: "value", ...axisVal },
      series: [
        { name: "Raised", type: "line", data: raised, symbol: "circle", symbolSize: 8, lineStyle: { width: 2, color: COLORS.series[0] }, itemStyle: { color: COLORS.series[0], borderColor: "#fff", borderWidth: 2 }, endLabel: { show: true, color: INK, formatter: "{c}" } },
        { name: "Closed", type: "line", data: closed, symbol: "circle", symbolSize: 8, lineStyle: { width: 2, color: COLORS.series[1] }, itemStyle: { color: COLORS.series[1], borderColor: "#fff", borderWidth: 2 }, endLabel: { show: true, color: INK, formatter: "{c}" } },
      ],
    });

    // by topic and risk
    const tl = TOPICS.map(t => ({ t, r: RISKS.map(r => findings.filter(x => x.topic === t.code && x.risk === r).length) })).filter(x => x.r.some(Boolean)).sort((a, b) => a.r.reduce((s, v) => s + v, 0) - b.r.reduce((s, v) => s + v, 0));
    dash.querySelector("#c-topic").style.height = Math.max(260, tl.length * 30 + 60) + "px";
    mk("c-topic", {
      grid: { left: 8, right: 24, top: 34, bottom: 8, containLabel: true }, legend: { ...legend, data: RISKS.map(r => RISK_LABEL[r]) },
      tooltip: { ...tip, trigger: "axis", axisPointer: { type: "shadow", shadowStyle: { color: "rgba(0,56,118,.06)" } } },
      xAxis: { type: "value", ...axisVal }, yAxis: { type: "category", data: tl.map(x => x.t.name), ...axisCat, axisLabel: { color: INK } },
      series: RISKS.map((r, i) => ({ name: RISK_LABEL[r], type: "bar", stack: "r", barMaxWidth: 18, data: tl.map(x => x.r[i]), itemStyle: { color: COLORS.risk[r], borderColor: "#fff", borderWidth: 1, borderRadius: i === 2 ? [0, 4, 4, 0] : 0 } })),
    }, p => { location.hash = regLink({ topic: tl[p.dataIndex].t.code, risk: RISKS[p.seriesIndex] }); });

    // heat map: project × topic
    if (dash.querySelector("#c-heat")) {
      const projs = store.projects.filter(p => findings.some(x => x.project_id === p.id));
      const cells = []; let max = 1;
      projs.forEach((p, yi) => TOPICS.forEach((t, xi) => { const n = findings.filter(x => x.project_id === p.id && x.topic === t.code).length; max = Math.max(max, n); cells.push([xi, yi, n || "-"]); }));
      dash.querySelector("#c-heat").style.height = Math.max(220, projs.length * 36 + 90) + "px";
      mk("c-heat", {
        grid: { left: 8, right: 16, top: 8, bottom: 56, containLabel: true },
        tooltip: { ...tip, formatter: p => `<b>${esc(projs[p.value[1]].name)}</b><br>${esc(TOPICS[p.value[0]].name)}: <b>${p.value[2] === "-" ? 0 : p.value[2]}</b> findings` },
        xAxis: { type: "category", data: TOPICS.map(t => t.code), ...axisCat, axisLabel: { color: INK }, splitArea: { show: false } },
        yAxis: { type: "category", data: projs.map(p => p.name), ...axisCat, axisLabel: { color: INK, width: 220, overflow: "truncate" } },
        visualMap: { min: 0, max, calculable: false, orient: "horizontal", left: "center", bottom: 4, itemWidth: 12, itemHeight: 160, text: ["More", "Fewer"], textStyle: { color: MUTED }, inRange: { color: COLORS.seq.slice(0, 7) } },
        series: [{ type: "heatmap", data: cells, label: { show: true, color: INK, formatter: p => (p.value[2] === "-" ? "" : p.value[2]) }, itemStyle: { borderColor: "#fff", borderWidth: 2, borderRadius: 4 }, emphasis: { itemStyle: { borderColor: INK, borderWidth: 1 } } }],
      }, p => { if (p.value[2] !== "-") location.hash = regLink({ project: projs[p.value[1]].id, topic: TOPICS[p.value[0]].code }); });
      // dark cells need light labels
      const c = charts[charts.length - 1];
      c.setOption({ series: [{ label: { color: "#1b2430", textBorderColor: "#fff", textBorderWidth: 2 } }] });
    }

    // root causes
    const rcs = {}; findings.forEach(x => (x.root_cause || "").split("\n").map(s => s.trim()).filter(Boolean).forEach(r => { const key = r.replace(/\s+/g, " "); rcs[key] = (rcs[key] || 0) + 1; }));
    const rcl = Object.entries(rcs).sort((a, b) => b[1] - a[1]).slice(0, 8).reverse();
    if (rcl.length) mk("c-rc", {
      grid: { left: 8, right: 30, top: 8, bottom: 8, containLabel: true }, tooltip: { ...tip, trigger: "axis", axisPointer: { type: "shadow", shadowStyle: { color: "rgba(0,56,118,.06)" } } },
      xAxis: { type: "value", ...axisVal }, yAxis: { type: "category", data: rcl.map(x => x[0]), ...axisCat, axisLabel: { color: INK, width: 150, overflow: "truncate" } },
      series: [{ type: "bar", name: "Findings", data: rcl.map(x => x[1]), barMaxWidth: 16, itemStyle: { color: COLORS.series[0], borderRadius: [0, 4, 4, 0] }, label: { show: true, position: "right", color: MUTED } }],
    }, p => { location.hash = regLink({ root: rcl[p.dataIndex][0] }); });
    else dash.querySelector("#c-rc").innerHTML = `<p class="muted">No root causes recorded.</p>`;

    // repeated checklist items
    const items = {}; findings.forEach(x => { if (x.item_id) items[x.item_id] = (items[x.item_id] || 0) + 1; });
    const il = Object.entries(items).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const imax = il.length ? il[0][1] : 1;
    dash.querySelector("#c-items").innerHTML = il.map(([id, n]) => `<a class="rrow" href="${regLink({ item: id })}"><span><b>${esc(id)}</b> <small class="muted">${esc(ITEM[id]?.text.slice(0, 70) || "")}${(ITEM[id]?.text.length || 0) > 70 ? "…" : ""}</small><span class="hbar"><i style="width:${(100 * n) / imax}%"></i></span></span><b>${n}</b></a>`).join("") || `<p class="muted">Checklist findings appear here.</p>`;

    // league table
    const lg = dash.querySelector("#c-league");
    if (lg) {
      const rows = store.projects.map(p => {
        const pf = findings.filter(x => x.project_id === p.id), pa = audits.filter(a => a.project_id === p.id);
        let o = 0, n = 0; pa.forEach(a => Object.values(a.checks || {}).forEach(v => { if (v === "ok") o++; if (v === "nc") n++; }));
        const s = { overdue: 0, closed: 0 }; pf.forEach(x => { const q = findingState(x, today); if (q in s) s[q]++; });
        return { p, audits: pa.length, n: pf.length, high: pf.filter(x => x.risk === "High").length, open: pf.filter(x => x.status !== "closed").length, overdue: s.overdue, closure: pct(s.closed, pf.length), comp: pct(o, o + n) };
      }).filter(r => r.audits || r.n).sort((a, b) => b.overdue - a.overdue || b.open - a.open);
      lg.innerHTML = `<div class="tscroll"><table class="tbl compact"><thead><tr><th>Project</th><th class="num">Findings</th><th class="num">Not closed</th><th class="num">Overdue</th><th class="num">Closed</th><th class="num">Compliance</th></tr></thead><tbody>
        ${rows.map(r => `<tr class="click" data-p="${r.p.id}"><td><b>${esc(r.p.name)}</b><div class="muted small">${r.audits} audit${r.audits === 1 ? "" : "s"}</div></td><td class="num">${r.n}</td><td class="num">${r.open}</td><td class="num">${r.overdue ? `<b class="t-over">${r.overdue}</b>` : 0}</td>
        <td class="num">${r.closure == null ? "—" : r.closure + "%"}</td><td class="num">${r.comp == null ? "—" : r.comp + "%"}</td></tr>`).join("")}</tbody></table></div>`;
      lg.addEventListener("click", e => { const tr = e.target.closest("tr[data-p]"); if (tr) { f.project = tr.dataset.p; const s = root.querySelector("#s-project"); if (s) s.value = f.project; sync(); draw(); window.scrollTo({ top: 0, behavior: "smooth" }); } });
    }
  }

  function sync() { history.replaceState(null, "", "#/dashboard?" + new URLSearchParams(Object.entries(f).filter(([k, v]) => v && !(k === "period" && v === "all"))).toString()); }
  root.querySelector(".slicers").addEventListener("input", e => {
    const map = { "s-project": "project", "s-period": "period", "s-from": "from", "s-to": "to", "s-type": "type", "s-risk": "risk", "s-topic": "topic" };
    const k = map[e.target.id]; if (!k) return;
    f[k] = e.target.value;
    root.querySelector("#w-from").hidden = root.querySelector("#w-to").hidden = f.period !== "custom";
    sync(); draw();
  });
  root.querySelector("#s-reset").addEventListener("click", () => { Object.assign(f, { project: "", period: "all", from: "", to: "", type: "", risk: "", topic: "" }); root.querySelectorAll(".slicers select, .slicers input").forEach(i => { i.value = i.id === "s-period" ? "all" : ""; }); root.querySelector("#w-from").hidden = root.querySelector("#w-to").hidden = true; sync(); draw(); });
  root.querySelector("#dl").addEventListener("click", async e => {
    const b = e.target; b.disabled = true;
    try { saveBlob(await summaryWorkbook(data(), store, isAdmin), `HSE_Flash_Audit_Summary_${todayISO()}.xlsx`); }
    catch (x) { toast(x.message, "error"); } finally { b.disabled = false; }
  });
  const ro = new ResizeObserver(() => charts.forEach(c => c.resize()));
  ro.observe(root);
  draw();
  return { unmount() { ro.disconnect(); charts.forEach(c => c.dispose()); } };
}

async function summaryWorkbook({ audits, findings }, store, isAdmin) {
  const ExcelJS = await ensureExcelJS();
  const wb = new ExcelJS.Workbook();
  const head = ws => { const r = ws.getRow(1); r.font = { bold: true, color: { argb: "FFFFFFFF" } }; r.eachCell(c => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF003876" } }; }); ws.views = [{ state: "frozen", ySplit: 1 }]; };
  const today = todayISO();
  const s1 = wb.addWorksheet("Projects");
  s1.columns = [{ header: "Project", width: 40 }, { header: "Audits", width: 10 }, { header: "Findings", width: 10 }, { header: "High risk", width: 10 }, { header: "Not closed", width: 11 }, { header: "Overdue", width: 10 }, { header: "Closed", width: 10 }, { header: "Closure %", width: 11 }, { header: "Checklist compliance %", width: 14 }];
  store.projects.forEach(p => {
    const pf = findings.filter(x => x.project_id === p.id), pa = audits.filter(a => a.project_id === p.id);
    if (!pf.length && !pa.length) return;
    let o = 0, n = 0; pa.forEach(a => Object.values(a.checks || {}).forEach(v => { if (v === "ok") o++; if (v === "nc") n++; }));
    const closed = pf.filter(x => x.status === "closed").length;
    s1.addRow([p.name, pa.length, pf.length, pf.filter(x => x.risk === "High").length, pf.length - closed, pf.filter(x => findingState(x, today) === "overdue").length, closed, pf.length ? closed / pf.length : null, o + n ? o / (o + n) : null]);
  });
  s1.getColumn(8).numFmt = "0%"; s1.getColumn(9).numFmt = "0%"; head(s1);
  const s2 = wb.addWorksheet("Topics");
  s2.columns = [{ header: "Topic", width: 30 }, { header: "High", width: 8 }, { header: "Medium", width: 9 }, { header: "Low", width: 8 }, { header: "Total", width: 8 }, { header: "Not closed", width: 11 }];
  TOPICS.forEach(t => { const tf = findings.filter(x => x.topic === t.code); if (tf.length) s2.addRow([t.name, ...["High", "Med", "Low"].map(r => tf.filter(x => x.risk === r).length), tf.length, tf.filter(x => x.status !== "closed").length]); });
  head(s2);
  const s3 = wb.addWorksheet("Overdue");
  s3.columns = [{ header: "Ref", width: 10 }, { header: "Project", width: 36 }, { header: "Observation", width: 60 }, { header: "Risk", width: 8 }, { header: "Owner", width: 22 }, { header: "Target date", width: 12 }, { header: "Days late", width: 10 }];
  findings.filter(x => findingState(x, today) === "overdue").sort((a, b) => a.target_date.localeCompare(b.target_date)).forEach(x => s3.addRow([fRef(x.ref), x.projects?.name || "", x.observation, x.risk, x.owner, x.target_date, daysBetween(x.target_date, today)]));
  s3.getColumn(3).alignment = { wrapText: true, vertical: "top" }; head(s3);
  return new Blob([await wb.xlsx.writeBuffer()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
