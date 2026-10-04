// Dashboard: one filter bar scopes every figure, chart and table below it.
import { esc, fmtDate, fRef, findingState, STATE_LABEL, RISK_LABEL, COLORS, todayISO, addDays, daysBetween, monthKey, monthLabel, pct, riskChip, stateChip, ensureExcelJS, saveBlob, toast, busyOverlay, ICON } from "../ui.js";
import { TOPICS, ITEM, topicName } from "../checklist.js";

const INK = "#1b2430", INK2 = "#3d4654", MUTED = "#6b7280", GRID = "#eceef1", AXIS = "#c9ced6", SURF = "#ffffff";
const FONT = '"Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif';
const STATES = ["closed", "pending", "open", "overdue"];
const RISKS = ["High", "Med", "Low"];
const AGE = [["0–7 days", 0, 7], ["8–14 days", 8, 14], ["15–30 days", 15, 30], ["31–60 days", 31, 60], ["Over 60 days", 61, 1e9]];
const AGE_COLORS = ["#86b6ef", "#5598e7", "#2a78d6", "#1c5cab", "#104281"]; // ordinal blue ramp, validated
const SERIES = { raised: "#2a78d6", closed: "#1baf7a", backlog: "#eb6834" };
const PERIODS = [["all", "All time"], ["30", "30 days"], ["90", "90 days"], ["180", "6 months"], ["year", "This year"], ["custom", "Custom"]];
const nf = n => (n == null ? "—" : Number(n).toLocaleString());

export async function render(root, ctx) {
  const { store, isAdmin, me, query } = ctx;
  await store.load();
  const f = { period: query.period || "all", from: query.from || "", to: query.to || "", location: query.location || "", project: query.project || "", type: query.type || "", risk: query.risk || "", topic: query.topic || "" };
  const charts = [], tables = {};
  let showIdle = query.idle !== "0";
  let league = { key: "overdue", dir: -1 };
  const locations = [...new Set(store.projects.map(p => (p.location || "").trim()).filter(Boolean))].sort();
  const opt = (opts, v) => opts.map(([k, l]) => `<option value="${esc(k)}" ${k === v ? "selected" : ""}>${esc(l)}</option>`).join("");

  root.innerHTML = `
    <div class="dash">
      <header class="dhead">
        <div class="dhead-t">
          <p class="eyebrow">${isAdmin ? "Corporate HSE · Flash Audit" : "Project dashboard"}</p>
          <h1>${isAdmin ? "HSE Performance Dashboard" : esc(me.project_name || "Project")}</h1>
          <p class="dscope" id="scope"></p>
        </div>
        <div class="dhead-a">
          ${isAdmin ? "" : `<a class="btn onnavy solid" href="#/new">New audit</a>`}
          <button class="btn onnavy solid" id="dl-ppt">${ICON.ppt}<span>PowerPoint</span></button>
          <button class="btn onnavy" id="dl-xls">${ICON.xls}<span>Excel</span></button>
          <button class="btn onnavy icon" id="fs" title="Full screen for presenting" aria-label="Full screen">${ICON.expand}</button>
        </div>
      </header>
      <div class="slicerbar">
        <div class="seg period" role="group" aria-label="Period">${PERIODS.map(([k, l]) => `<button type="button" data-period="${k}" aria-pressed="${k === f.period}">${l}</button>`).join("")}</div>
        <label class="fld sm" id="w-from" ${f.period === "custom" ? "" : "hidden"}><span>From</span><input type="date" id="s-from" value="${esc(f.from)}"></label>
        <label class="fld sm" id="w-to" ${f.period === "custom" ? "" : "hidden"}><span>To</span><input type="date" id="s-to" value="${esc(f.to)}"></label>
        ${isAdmin && locations.length > 1 ? `<label class="fld sm"><span>Location</span><select id="s-location">${opt([["", "All locations"], ...locations.map(l => [l, l])], f.location)}</select></label>` : ""}
        ${isAdmin ? `<label class="fld sm wide"><span>Project</span><select id="s-project"></select></label>` : ""}
        <label class="fld sm"><span>Audit type</span><select id="s-type">${opt([["", "All"], ["corporate", "Corporate"], ["project", "Project"]], f.type)}</select></label>
        <label class="fld sm"><span>Risk</span><select id="s-risk">${opt([["", "All"], ["High", "High"], ["Med", "Medium"], ["Low", "Low"]], f.risk)}</select></label>
        <label class="fld sm"><span>Topic</span><select id="s-topic">${opt([["", "All topics"], ...TOPICS.map(t => [t.code, t.name])], f.topic)}</select></label>
        <button class="btn ghost sm" id="s-reset">Reset</button>
      </div>
      <div id="dash"></div>
    </div>`;

  const fillProjects = () => {
    const s = root.querySelector("#s-project"); if (!s) return;
    const list = store.projects.filter(p => !f.location || (p.location || "").trim() === f.location);
    if (f.project && !list.some(p => p.id === f.project)) f.project = "";
    s.innerHTML = opt([["", f.location ? `All projects in ${f.location}` : "All projects"], ...list.map(p => [p.id, p.name])], f.project);
  };
  fillProjects();

  // ---------------------------------------------------------------- the model
  function range() {
    const t = todayISO();
    if (f.period === "30" || f.period === "90" || f.period === "180") return [addDays(t, -+f.period), t];
    if (f.period === "year") return [t.slice(0, 4) + "-01-01", t];
    if (f.period === "custom") return [f.from || "0000", f.to || "9999"];
    return ["0000", "9999"];
  }
  function model() {
    const [from, to] = range(), today = todayISO();
    const projects = store.projects.filter(p => (!f.location || (p.location || "").trim() === f.location) && (!f.project || p.id === f.project));
    const pset = new Set(projects.map(p => p.id));
    const audits = store.audits.filter(a => pset.has(a.project_id) && (!f.type || a.audit_type === f.type) && a.audit_date >= from && a.audit_date <= to);
    const aIds = new Set(audits.map(a => a.id));
    const findings = store.findings.filter(x => aIds.has(x.audit_id) && (!f.risk || x.risk === f.risk) && (!f.topic || x.topic === f.topic));
    const adate = x => x.audits?.audit_date || x.created_at.slice(0, 10);
    const st = { open: 0, overdue: 0, pending: 0, closed: 0 }; findings.forEach(x => st[findingState(x, today)]++);
    const notClosed = st.open + st.overdue + st.pending;
    const highOpen = findings.filter(x => x.risk === "High" && x.status !== "closed").length;
    const closedLate = findings.filter(x => x.status === "closed" && x.closed_at && !x.fixed_on_spot);
    const avgClose = closedLate.length ? Math.round(closedLate.reduce((s, x) => s + Math.max(0, daysBetween(adate(x), x.closed_at.slice(0, 10))), 0) / closedLate.length) : null;
    let ok = 0, nc = 0;
    audits.forEach(a => Object.entries(a.checks || {}).forEach(([id, v]) => { if (f.topic && ITEM[id]?.topic !== f.topic) return; if (v === "ok") ok++; if (v === "nc") nc++; }));
    const overdue = findings.filter(x => findingState(x, today) === "overdue").map(x => ({ x, d: daysBetween(x.target_date, today) })).sort((a, b) => b.d - a.d);
    const support = findings.filter(x => x.needs_support && x.status !== "closed");

    // months: from the first audit in view to the end of the period (max 18)
    const end = to === "9999" ? today : (to < today ? to : today);
    const startD = audits.reduce((m, a) => (a.audit_date < m ? a.audit_date : m), end);
    const months = []; let k = monthKey(startD); const endK = monthKey(end);
    while (k <= endK) { months.push(k); const [y, m] = k.split("-").map(Number); k = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`; }
    const mlist = months.slice(-18);
    const monthEnd = key => { const [y, m] = key.split("-").map(Number); const d = new Date(y, m, 0); return `${key}-${String(d.getDate()).padStart(2, "0")}`; };
    const monthly = {
      keys: mlist, labels: mlist.map(monthLabel),
      audits: mlist.map(m => audits.filter(a => monthKey(a.audit_date) === m).length),
      raised: mlist.map(m => findings.filter(x => monthKey(adate(x)) === m).length),
      closed: mlist.map(m => findings.filter(x => x.status === "closed" && x.closed_at && monthKey(x.closed_at) === m).length),
      backlog: mlist.map(m => { const e = monthEnd(m); return findings.filter(x => adate(x) <= e && !(x.status === "closed" && x.closed_at && x.closed_at.slice(0, 10) <= e)).length; }),
    };
    const aging = AGE.map(([label, lo, hi]) => ({ label, n: findings.filter(x => x.status !== "closed" && (d => d >= lo && d <= hi)(daysBetween(adate(x), today))).length }));

    // grouping: by project (all projects) or by area (one project)
    const byProjectView = isAdmin && !f.project;
    const groups = {};
    findings.forEach(x => { const key = byProjectView ? x.project_id : ((x.area || "Not stated").trim() || "Not stated"); const g = groups[key] = groups[key] || { key, closed: 0, pending: 0, open: 0, overdue: 0, n: 0 }; g[findingState(x, today)]++; g.n++; });
    const glist = Object.values(groups).sort((a, b) => b.n - a.n).map(g => ({ ...g, name: byProjectView ? (store.project(g.key)?.name || "—") : g.key }));

    const topics = TOPICS.map(t => ({ t, r: RISKS.map(r => findings.filter(x => x.topic === t.code && x.risk === r).length) })).map(x => ({ ...x, n: x.r.reduce((s, v) => s + v, 0) })).filter(x => x.n).sort((a, b) => b.n - a.n);
    const rcs = {}; findings.forEach(x => (x.root_cause || "").split("\n").map(s => s.trim().replace(/\s+/g, " ")).filter(Boolean).forEach(r => { rcs[r] = (rcs[r] || 0) + 1; }));
    const rcTotal = Object.values(rcs).reduce((s, v) => s + v, 0);
    const rootCauses = Object.entries(rcs).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const items = {}; findings.forEach(x => { if (x.item_id) items[x.item_id] = (items[x.item_id] || 0) + 1; });
    const repeated = Object.entries(items).sort((a, b) => b[1] - a[1]).slice(0, 8);

    // projects: performance and coverage
    const perf = projects.filter(p => p.active || audits.some(a => a.project_id === p.id)).map(p => {
      const pa = audits.filter(a => a.project_id === p.id), pf = findings.filter(x => x.project_id === p.id);
      let o = 0, n = 0; pa.forEach(a => Object.values(a.checks || {}).forEach(v => { if (v === "ok") o++; if (v === "nc") n++; }));
      const s = { overdue: 0, closed: 0 }; pf.forEach(x => { const q = findingState(x, today); if (q in s) s[q]++; });
      return { p, name: p.name, location: (p.location || "").trim(), audits: pa.length, last: pa.reduce((m, a) => (!m || a.audit_date > m ? a.audit_date : m), ""), n: pf.length, high: pf.filter(x => x.risk === "High").length, open: pf.filter(x => x.status !== "closed").length, overdue: s.overdue, closure: pct(s.closed, pf.length), comp: pct(o, o + n) };
    });
    const activeInScope = projects.filter(p => p.active);
    const audited = activeInScope.filter(p => audits.some(a => a.project_id === p.id));
    const byLoc = {};
    activeInScope.forEach(p => { const l = (p.location || "").trim() || "Not stated"; const b = byLoc[l] = byLoc[l] || { l, done: 0, total: 0 }; b.total++; if (audits.some(a => a.project_id === p.id)) b.done++; });
    const coverage = { audited, missing: activeInScope.filter(p => !audited.includes(p)), byLoc: Object.values(byLoc).sort((a, b) => b.total - a.total || a.l.localeCompare(b.l)) };
    return { from, to, today, projects, audits, findings, st, notClosed, highOpen, avgClose, ok, nc, overdue, support, monthly, aging, byProjectView, glist, topics, rootCauses, rcTotal, repeated, perf, coverage };
  }
  function scopeText(m) {
    const parts = [];
    parts.push(f.project ? store.project(f.project)?.name : f.location ? `${f.location} · ${m.projects.length} projects` : isAdmin ? `All ${m.projects.length} projects` : "");
    parts.push(f.period === "all" ? "All time" : f.period === "custom" ? `${f.from ? fmtDate(f.from) : "start"} – ${f.to ? fmtDate(f.to) : "today"}` : PERIODS.find(p => p[0] === f.period)[1].replace(/^(\d)/, "Last $1"));
    if (f.type) parts.push(f.type === "corporate" ? "Corporate audits" : "Project audits");
    if (f.risk) parts.push(RISK_LABEL[f.risk] + " risk");
    if (f.topic) parts.push(topicName(f.topic));
    return parts.filter(Boolean).join(" · ");
  }
  const regLink = extra => {
    const [from, to] = range();
    const q = { project: f.project, type: f.type, risk: f.risk, topic: f.topic, ...(f.period !== "all" ? { from: from === "0000" ? "" : from, to: to === "9999" ? "" : to } : {}), ...extra };
    return "#/register?" + new URLSearchParams(Object.entries(q).filter(([, v]) => v)).toString();
  };

  // ---------------------------------------------------------------- pieces
  const spark = (vals, color = "#2a78d6") => {
    if (!vals || vals.length < 3 || vals.filter(v => v > 0).length < 2) return "";
    const w = 80, h = 30, max = Math.max(1, ...vals), step = w / (vals.length - 1);
    const pts = vals.map((v, i) => [i * step, h - 3 - (v / max) * (h - 8)]);
    const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
    const [lx, ly] = pts[pts.length - 1];
    return `<svg class="spark" viewBox="-4 0 ${w + 8} ${h}" width="${w + 8}" height="${h}" aria-hidden="true"><path d="${d}" fill="none" stroke="#a7b0bd" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${lx}" cy="${ly}" r="4" fill="${color}" stroke="${SURF}" stroke-width="2"/></svg>`;
  };
  const tileHtml = ({ label, value, note, href, tone = "", trend, icon }) =>
    `<a class="ktile ${tone}" href="${href}"><span class="kl">${label}</span><span class="krow"><b class="kv">${value}</b>${trend || ""}</span><span class="kn">${icon ? `<i class="ki">${icon}</i>` : ""}${note || "&nbsp;"}</span></a>`;
  const card = (id, cls, title, sub, body, { table = true } = {}) =>
    `<section class="dcard ${cls}" data-card="${id}"><div class="dch"><div><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ""}</div>${table ? `<button class="icon-btn sm tbtn" data-tbl="${id}" aria-pressed="false" title="Show as table" aria-label="Show ${esc(title)} as a table">${ICON.table}</button>` : ""}</div>${body}<div class="ctable" id="t-${id}" hidden></div></section>`;

  // ---------------------------------------------------------------- draw
  function draw() {
    charts.splice(0).forEach(c => c.dispose());
    Object.keys(tables).forEach(k => delete tables[k]);
    const m = model();
    root.querySelector("#scope").textContent = `${scopeText(m)} · updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    const has = m.findings.length > 0;
    const closeRate = has ? pct(m.st.closed, m.findings.length) : null;
    const tiles = [
      { label: "Audits", value: nf(m.audits.length), note: `${m.audits.filter(a => a.audit_type === "corporate").length} corporate · ${m.audits.filter(a => a.audit_type === "project").length} project`, href: "#/audits", trend: spark(m.monthly.audits) },
      { label: "Findings", value: nf(m.findings.length), note: `${m.findings.filter(x => x.risk === "High").length} high risk`, href: regLink({}), trend: spark(m.monthly.raised) },
      { label: "Not closed", value: nf(m.notClosed), note: `${m.st.pending} waiting for review`, href: regLink({ status: "notclosed" }), tone: m.notClosed ? "warn" : "", trend: spark(m.monthly.backlog, SERIES.backlog) },
      { label: "Overdue", value: nf(m.st.overdue), note: m.overdue.length ? `oldest ${m.overdue[0].d} days late` : "none late", href: regLink({ status: "overdue" }), tone: m.st.overdue ? "bad" : "good", icon: m.st.overdue ? ICON.warn : ICON.check },
      { label: "High risk not closed", value: nf(m.highOpen), note: m.highOpen ? "need priority action" : "none open", href: regLink({ status: "notclosed", risk: "High" }), tone: m.highOpen ? "bad" : "good", icon: m.highOpen ? ICON.warn : ICON.check },
      { label: "Average days to close", value: m.avgClose == null ? "—" : nf(m.avgClose), note: "excluding on-the-spot fixes", href: regLink({ status: "closed" }) },
      { label: "Checklist compliance", value: m.ok + m.nc ? pct(m.ok, m.ok + m.nc) + "%" : "—", note: m.ok + m.nc ? `${nf(m.ok + m.nc)} checks rated` : "no checklist audits yet", href: "#/audits" },
      isAdmin
        ? { label: "Projects audited", value: `${m.coverage.audited.length}<small> / ${m.coverage.audited.length + m.coverage.missing.length}</small>`, note: m.coverage.missing.length ? `${m.coverage.missing.length} not audited yet` : "all audited", href: "#cov", tone: m.coverage.missing.length ? "" : "good" }
        : { label: "Pending review", value: nf(m.st.pending), note: "closures sent to Corporate HSE", href: regLink({ status: "pending" }) },
    ];
    const dash = root.querySelector("#dash");
    dash.innerHTML = `
      <div class="kgrid">
        <a class="ktile hero" href="${regLink({ status: "closed" })}">
          <span class="kl">Closure rate</span>
          <b class="kv">${closeRate == null ? "—" : closeRate + "%"}</b>
          <span class="meter" role="img" aria-label="${closeRate ?? 0}% of findings closed"><i style="width:${closeRate ?? 0}%"></i></span>
          <span class="kn">${has ? `${nf(m.st.closed)} of ${nf(m.findings.length)} findings closed` : "No findings in this view yet"}</span>
          <span class="hero-split">${STATES.map(s => `<span><i class="sw" style="background:${COLORS.state[s]}"></i>${STATE_LABEL[s]} <b>${nf(m.st[s])}</b></span>`).join("")}</span>
        </a>
        ${tiles.map(tileHtml).join("")}
      </div>
      ${has ? `
      <div class="dgrid">
        ${card("c-proj", "c8", m.byProjectView ? "Findings by project" : "Findings by area", "by close-out status · click a bar to open those findings", `<div class="chart" id="c-proj"></div>`)}
        ${card("c-status", "c4", "Close-out status", "share of findings in view", `<div class="statlist">${STATES.map(s => `<a href="${regLink({ status: s })}" class="srow"><span class="sw" style="background:${COLORS.state[s]}"></span><span>${STATE_LABEL[s]}</span><b>${nf(m.st[s])}</b><span class="hbar"><i style="width:${pct(m.st[s], m.findings.length)}%;background:${COLORS.state[s]}"></i></span><small>${pct(m.st[s], m.findings.length)}%</small></a>`).join("")}</div>
          <h3 class="dsub">Risk</h3><div class="statlist">${RISKS.map(r => { const n = m.findings.filter(x => x.risk === r).length; return `<a href="${regLink({ risk: r })}" class="srow"><span class="sw" style="background:${COLORS.risk[r]}"></span><span>${RISK_LABEL[r]}</span><b>${nf(n)}</b><span class="hbar"><i style="width:${pct(n, m.findings.length)}%;background:${COLORS.risk[r]}"></i></span><small>${pct(n, m.findings.length)}%</small></a>`; }).join("")}</div>`, { table: false })}
        ${card("c-trend", "c8", "Raised, closed and still open", "findings per month · the orange line is what was still open at each month end", `<div class="chart" id="c-trend"></div>`)}
        ${card("c-age", "c4", "How long open findings wait", "not closed, by days since the audit", `<div class="chart" id="c-age"></div>`)}
        ${card("c-topic", "c6", "Findings by topic", "life-saving controls · by risk", `<div class="chart tall" id="c-topic"></div>`)}
        ${card("c-rc", "c6", "Top root causes", "times recorded · share of all root causes", `<div class="chart tall" id="c-rc"></div>`)}
        ${isAdmin && m.byProjectView && m.glist.length > 1 ? card("c-heat", "c12", "Where findings concentrate", "number of findings · project × topic · click a cell to open them", `<div class="chart" id="c-heat"></div>`) : ""}
      </div>` : `<div class="empty dempty"><h3>No findings in this view yet</h3><p>${store.findings.length ? "Change the filters above to see data." : "Charts appear here as soon as audits are carried out on the phone or F-HSE-0075 Excel reports are imported."}</p><div class="btnrow center"><a class="btn primary" href="#/new">New audit</a><a class="btn ghost" href="#/import">Import Excel report</a></div></div>`}
      <div class="dgrid">
        ${isAdmin && m.byProjectView ? card("c-league", "c12", "Project performance", `${m.perf.filter(r => r.audits).length} audited · click a project to focus the dashboard on it`, `<div class="lg-tools"><label class="check"><input type="checkbox" id="idle" ${showIdle ? "checked" : ""}> Show projects without audits in this period</label></div><div id="c-league" class="tscroll"></div>`, { table: false }) : ""}
        ${has ? card("c-over", isAdmin ? "c7" : "c12", "Overdue findings", `${m.overdue.length} past target date · <a class="linkish" href="${regLink({ status: "overdue" })}">open the list ›</a>`, m.overdue.length ? `<div class="tscroll"><table class="tbl compact"><thead><tr><th>Ref</th>${isAdmin ? "<th>Project</th>" : ""}<th>Observation</th><th class="num">Days late</th></tr></thead><tbody>${m.overdue.slice(0, 6).map(({ x, d }) => `<tr class="click" data-href="#/finding/${x.id}"><td class="nowrap"><b>${fRef(x.ref)}</b><div>${riskChip(x.risk)}</div></td>${isAdmin ? `<td>${esc(x.projects?.name || "")}</td>` : ""}<td class="obs">${esc(x.observation.slice(0, 80))}${x.observation.length > 80 ? "…" : ""}${x.owner ? `<div class="muted small">Owner: ${esc(x.owner)}</div>` : ""}</td><td class="num"><b class="t-over">${d}</b></td></tr>`).join("")}</tbody></table></div>` : `<p class="okmsg">${ICON.check} No overdue findings.</p>`, { table: false }) : ""}
        ${has ? card("c-sup", isAdmin ? "c5" : "c6", "Needs management support", `${m.support.length} not closed`, `<div class="rank">${m.support.slice(0, 7).map(x => `<a class="rrow" href="#/finding/${x.id}"><span><b>${esc(x.support_title || topicName(x.topic))}</b><small class="muted">${esc(x.projects?.name || "")} · ${fRef(x.ref)}</small></span>${riskChip(x.risk)}</a>`).join("") || `<p class="okmsg">${ICON.check} Nothing waiting for management.</p>`}${m.support.length > 7 ? `<a class="linkish" href="${regLink({ support: "1", status: "notclosed" })}">All ${m.support.length} ›</a>` : ""}</div>`, { table: false }) : ""}
        ${has ? card("c-items", isAdmin && m.byProjectView ? "c6" : "c6", "Checks that fail most often", "checklist items raised as findings", `<div id="c-items" class="rank"></div>`, { table: false }) : ""}
        ${isAdmin && m.byProjectView ? `<div id="cov" class="c6 covwrap">${card("c-cov", "", "Audit coverage by location", `${m.coverage.audited.length} of ${m.coverage.audited.length + m.coverage.missing.length} active projects audited in this period`, `<div class="chart" id="c-cov"></div>`)}</div>` : ""}
      </div>`;

    if (isAdmin && m.byProjectView) drawLeague(m);
    if (has) {
      dash.querySelector("#c-items").innerHTML = m.repeated.map(([id, n]) => `<a class="rrow" href="${regLink({ item: id })}"><span><b>${esc(id)}</b> <small class="muted">${esc(ITEM[id]?.text.slice(0, 80) || "")}${(ITEM[id]?.text.length || 0) > 80 ? "…" : ""}</small><span class="hbar"><i style="width:${(100 * n) / m.repeated[0][1]}%"></i></span></span><b>${n}</b></a>`).join("") || `<p class="muted">Only checklist audits feed this list. Imported Excel findings have no check item.</p>`;
    }
    if (!window.echarts) { if (has) toast("The chart library didn't load. Check the internet connection.", "error"); return; }
    drawCharts(dash, m);
  }

  function drawLeague(m) {
    const el = root.querySelector("#c-league"); if (!el) return;
    const val = (r, k) => ({ name: r.name.toLowerCase(), location: r.location.toLowerCase(), audits: r.audits, last: r.last || "", n: r.n, high: r.high, open: r.open, overdue: r.overdue, closure: r.closure ?? -1, comp: r.comp ?? -1 })[k];
    const rows = m.perf.filter(r => showIdle || r.audits).sort((a, b) => {
      const x = val(a, league.key), y = val(b, league.key);
      return (x < y ? -1 : x > y ? 1 : 0) * league.dir || (b.audits ? 1 : 0) - (a.audits ? 1 : 0) || b.open - a.open || a.name.localeCompare(b.name);
    });
    const th = (k, l, num) => `<th data-sort="${k}" class="${num ? "num" : ""} ${league.key === k ? "sorted" : ""}" aria-sort="${league.key === k ? (league.dir > 0 ? "ascending" : "descending") : "none"}">${l}${league.key === k ? (league.dir > 0 ? " ▲" : " ▼") : ""}</th>`;
    const meter = (v, good = 80, warn = 50) => v == null ? `<span class="muted">—</span>` : `<span class="mcell"><span class="meter sm ${v >= good ? "good" : v >= warn ? "mid" : "low"}"><i style="width:${v}%"></i></span><b>${v}%</b></span>`;
    el.innerHTML = `<table class="tbl compact league"><thead><tr>${th("name", "Project")}${th("location", "Location")}${th("audits", "Audits", 1)}${th("last", "Last audit")}${th("n", "Findings", 1)}${th("high", "High", 1)}${th("open", "Not closed", 1)}${th("overdue", "Overdue", 1)}${th("closure", "Closure rate")}${th("comp", "Compliance")}</tr></thead><tbody>
      ${rows.map(r => `<tr class="click${r.audits ? "" : " idle"}" data-p="${r.p.id}"><td><b>${esc(r.name)}</b></td><td>${esc(r.location)}</td><td class="num">${r.audits || `<span class="chip st-open">None</span>`}</td><td class="nowrap">${r.last ? fmtDate(r.last) : "—"}</td>
      <td class="num">${r.n}</td><td class="num">${r.high || ""}</td><td class="num">${r.open || ""}</td><td class="num">${r.overdue ? `<b class="t-over">${r.overdue}</b>` : ""}</td><td>${meter(r.closure)}</td><td>${meter(r.comp, 90, 75)}</td></tr>`).join("") || `<tr><td colspan="10" class="empty-row">No projects in this view.</td></tr>`}</tbody></table>`;
  }

  function drawCharts(dash, m) {
    const narrow = dash.clientWidth < 640, LT = narrow ? 64 : 36; // room for a legend that wraps on phones
    const mk = (id, option, onClick, table) => {
      const el = dash.querySelector("#" + id); if (!el) return null;
      const c = window.echarts.init(el, null, { renderer: "svg" });
      c.setOption({ textStyle: { fontFamily: FONT, color: INK }, animationDuration: 450, ...option });
      if (onClick) c.on("click", onClick);
      charts.push(c);
      if (table) tables[id] = table;
      return c;
    };
    const axisCat = { axisLine: { lineStyle: { color: AXIS } }, axisTick: { show: false }, axisLabel: { color: MUTED, fontSize: 12 } };
    const axisVal = { splitLine: { lineStyle: { color: GRID } }, axisLine: { show: false }, axisLabel: { color: MUTED, fontSize: 12 }, minInterval: 1 };
    const tip = { backgroundColor: SURF, borderColor: "#d9dde3", padding: [8, 12], textStyle: { color: INK, fontSize: 12.5 }, extraCssText: "box-shadow:0 8px 24px rgba(16,24,40,.14);border-radius:8px;" };
    const legend = { top: 0, left: 0, icon: "roundRect", itemWidth: 12, itemHeight: 12, itemGap: 16, textStyle: { color: INK2, fontSize: 12 } };
    const shadow = { type: "shadow", shadowStyle: { color: "rgba(0,56,118,.05)" } };
    // value first, then the series name, keyed with a short stroke
    const rowsTip = (title, items) => `<div style="font-weight:600;margin-bottom:6px">${esc(title)}</div>` + items.map(([name, v, color]) => `<div style="display:flex;align-items:center;gap:8px;min-width:170px"><span style="width:12px;height:3px;border-radius:2px;background:${color}"></span><b style="min-width:28px;text-align:right">${v}</b><span style="color:${MUTED}">${esc(name)}</span></div>`).join("");

    // 1. findings by project / area, stacked by status
    const gl = m.glist.slice(0, m.byProjectView ? 40 : 15);
    const projEl = dash.querySelector("#c-proj"); projEl.style.height = Math.max(260, gl.length * 32 + 70) + "px";
    mk("c-proj", {
      grid: { left: 8, right: 40, top: LT, bottom: 8, containLabel: true }, legend: { ...legend, data: STATES.map(s => STATE_LABEL[s]) },
      tooltip: { ...tip, trigger: "axis", axisPointer: shadow, formatter: ps => rowsTip(gl[ps[0].dataIndex].name, [...ps].reverse().map(p => [p.seriesName, p.value, COLORS.state[STATES[p.seriesIndex]]]).concat([["Total", gl[ps[0].dataIndex].n, "transparent"]])) },
      xAxis: { type: "value", ...axisVal }, yAxis: { type: "category", inverse: true, data: gl.map(g => g.name), ...axisCat, axisLabel: { color: INK, fontSize: 12, width: narrow ? 110 : 240, overflow: "truncate" } },
      series: STATES.map((s, i) => ({ name: STATE_LABEL[s], type: "bar", stack: "s", barMaxWidth: 20, data: gl.map(g => g[s]), itemStyle: { color: COLORS.state[s], borderColor: SURF, borderWidth: 1, borderRadius: i === STATES.length - 1 ? [0, 4, 4, 0] : 0 }, emphasis: { focus: "series" },
        ...(i === STATES.length - 1 ? { label: { show: true, position: "right", color: INK2, fontSize: 12, formatter: p => gl[p.dataIndex].n } } : {}) })),
    }, p => { const g = gl[p.dataIndex]; location.hash = regLink(m.byProjectView ? { project: g.key, status: STATES[p.seriesIndex] } : { q: g.key, status: STATES[p.seriesIndex] }); },
    { cols: [m.byProjectView ? "Project" : "Area", ...STATES.map(s => STATE_LABEL[s]), "Total"], rows: m.glist.map(g => [g.name, ...STATES.map(s => g[s]), g.n]) });

    // 2. monthly: raised & closed columns, still-open line (same unit, one axis)
    const mo = m.monthly;
    mk("c-trend", {
      grid: { left: 8, right: 44, top: LT + 4, bottom: 8, containLabel: true }, legend: { ...legend, data: [{ name: "Raised" }, { name: "Closed" }, { name: "Still open", icon: "circle" }] },
      tooltip: { ...tip, trigger: "axis", axisPointer: { type: "line", lineStyle: { color: AXIS } }, formatter: ps => rowsTip(mo.labels[ps[0].dataIndex], ps.map(p => [p.seriesName, p.value, p.color])) },
      xAxis: { type: "category", data: mo.labels, ...axisCat }, yAxis: { type: "value", ...axisVal },
      series: [
        { name: "Raised", type: "bar", data: mo.raised, barMaxWidth: 18, barGap: "15%", itemStyle: { color: SERIES.raised, borderRadius: [4, 4, 0, 0] } },
        { name: "Closed", type: "bar", data: mo.closed, barMaxWidth: 18, itemStyle: { color: SERIES.closed, borderRadius: [4, 4, 0, 0] } },
        { name: "Still open", type: "line", data: mo.backlog, symbol: "circle", symbolSize: 8, lineStyle: { width: 2, color: SERIES.backlog }, itemStyle: { color: SERIES.backlog, borderColor: SURF, borderWidth: 2 }, endLabel: { show: true, color: INK, fontWeight: 600, formatter: "{c}" }, z: 5 },
      ],
    }, null, { cols: ["Month", "Raised", "Closed", "Still open at month end"], rows: mo.labels.map((l, i) => [l, mo.raised[i], mo.closed[i], mo.backlog[i]]) });

    // 3. aging of findings not closed (ordinal ramp)
    mk("c-age", {
      grid: { left: 8, right: 8, top: 28, bottom: 8, containLabel: true },
      tooltip: { ...tip, trigger: "item", formatter: p => rowsTip(p.name, [["not closed", p.value, AGE_COLORS[p.dataIndex]]]) },
      xAxis: { type: "category", data: AGE.map(a => a[0].replace(" days", "")), ...axisCat, axisLabel: { color: MUTED, fontSize: 11.5, interval: 0 } }, yAxis: { type: "value", ...axisVal },
      series: [{ type: "bar", barMaxWidth: 24, data: m.aging.map((a, i) => ({ value: a.n, itemStyle: { color: AGE_COLORS[i], borderRadius: [4, 4, 0, 0] } })), label: { show: true, position: "top", color: INK2, fontWeight: 600, formatter: p => (p.value ? p.value : "") } }],
    }, () => { location.hash = regLink({ status: "notclosed" }); }, { cols: ["Days since audit", "Not closed"], rows: m.aging.map(a => [a.label, a.n]) });

    // 4. topics by risk
    const tl = m.topics;
    dash.querySelector("#c-topic").style.height = Math.max(300, tl.length * 30 + 70) + "px";
    mk("c-topic", {
      grid: { left: 8, right: 40, top: LT, bottom: 8, containLabel: true }, legend: { ...legend, data: RISKS.map(r => RISK_LABEL[r]) },
      tooltip: { ...tip, trigger: "axis", axisPointer: shadow, formatter: ps => rowsTip(tl[ps[0].dataIndex].t.name, ps.map(p => [p.seriesName + " risk", p.value, COLORS.risk[RISKS[p.seriesIndex]]])) },
      xAxis: { type: "value", ...axisVal }, yAxis: { type: "category", inverse: true, data: tl.map(x => x.t.name), ...axisCat, axisLabel: { color: INK, fontSize: 12 } },
      series: RISKS.map((r, i) => ({ name: RISK_LABEL[r], type: "bar", stack: "r", barMaxWidth: 18, data: tl.map(x => x.r[i]), itemStyle: { color: COLORS.risk[r], borderColor: SURF, borderWidth: 1, borderRadius: i === 2 ? [0, 4, 4, 0] : 0 },
        ...(i === 2 ? { label: { show: true, position: "right", color: INK2, fontSize: 12, formatter: p => tl[p.dataIndex].n } } : {}) })),
    }, p => { location.hash = regLink({ topic: tl[p.dataIndex].t.code, risk: RISKS[p.seriesIndex] }); },
    { cols: ["Topic", "High", "Medium", "Low", "Total"], rows: tl.map(x => [x.t.name, ...x.r, x.n]) });

    // 5. root causes with share
    const rcl = m.rootCauses;
    const rcEl = dash.querySelector("#c-rc"); rcEl.style.height = Math.max(300, rcl.length * 34 + 40) + "px";
    if (rcl.length) mk("c-rc", {
      grid: { left: 8, right: 70, top: 8, bottom: 8, containLabel: true },
      tooltip: { ...tip, trigger: "item", formatter: p => rowsTip(rcl[p.dataIndex][0], [["times recorded", p.value, SERIES.raised], ["of all root causes", pct(p.value, m.rcTotal) + "%", "transparent"]]) },
      xAxis: { type: "value", ...axisVal }, yAxis: { type: "category", inverse: true, data: rcl.map(x => x[0]), ...axisCat, axisLabel: { color: INK, fontSize: 12, width: 260, overflow: "truncate" } },
      series: [{ type: "bar", data: rcl.map(x => x[1]), barMaxWidth: 18, itemStyle: { color: SERIES.raised, borderRadius: [0, 4, 4, 0] }, label: { show: true, position: "right", color: INK2, fontSize: 12, formatter: p => `${p.value} · ${pct(p.value, m.rcTotal)}%` } }],
    }, p => { location.hash = regLink({ root: rcl[p.dataIndex][0] }); }, { cols: ["Root cause", "Times recorded", "Share"], rows: rcl.map(x => [x[0], x[1], pct(x[1], m.rcTotal) + "%"]) });
    else rcEl.outerHTML = `<p class="muted">No root causes recorded yet.</p>`;

    // 6. heat map project × topic (sequential blue)
    if (dash.querySelector("#c-heat")) {
      const projs = m.glist.map(g => ({ id: g.key, name: g.name }));
      const cells = []; let max = 1;
      projs.forEach((p, yi) => TOPICS.forEach((t, xi) => { const n = m.findings.filter(x => x.project_id === p.id && x.topic === t.code).length; max = Math.max(max, n); cells.push([xi, yi, n]); }));
      dash.querySelector("#c-heat").style.height = Math.max(240, projs.length * 34 + 96) + "px";
      mk("c-heat", {
        grid: { left: 8, right: 16, top: 8, bottom: 52, containLabel: true },
        tooltip: { ...tip, formatter: p => rowsTip(projs[p.value[1]].name, [[TOPICS[p.value[0]].name, p.value[2], "transparent"]]) },
        xAxis: { type: "category", data: TOPICS.map(t => t.code), ...axisCat, axisLabel: { color: INK, fontSize: 12, fontWeight: 600 }, splitArea: { show: false } },
        yAxis: { type: "category", inverse: true, data: projs.map(p => p.name), ...axisCat, axisLabel: { color: INK, fontSize: 12, width: 240, overflow: "truncate" } },
        visualMap: { min: 0, max, calculable: false, orient: "horizontal", left: "center", bottom: 4, itemWidth: 12, itemHeight: 180, text: ["More findings", "Fewer"], textStyle: { color: MUTED }, inRange: { color: ["#f3f7fd", "#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"] } },
        series: [{ type: "heatmap", data: cells.map(c => ({ value: c, label: { color: c[2] > max * 0.5 ? "#ffffff" : INK } })), label: { show: true, fontSize: 12, fontWeight: 600, formatter: p => (p.value[2] ? p.value[2] : "") }, itemStyle: { borderColor: SURF, borderWidth: 2, borderRadius: 4 }, emphasis: { itemStyle: { borderColor: INK, borderWidth: 1 } } }],
      }, p => { if (p.value[2]) location.hash = regLink({ project: projs[p.value[1]].id, topic: TOPICS[p.value[0]].code }); },
      { cols: ["Project", ...TOPICS.map(t => t.code)], rows: projs.map((p, yi) => [p.name, ...TOPICS.map((t, xi) => cells.find(c => c[0] === xi && c[1] === yi)[2])]) });
    }

    // 7. coverage by location: audited vs not yet
    if (dash.querySelector("#c-cov")) {
      const bl = m.coverage.byLoc;
      dash.querySelector("#c-cov").style.height = Math.max(220, bl.length * 32 + 70) + "px";
      mk("c-cov", {
        grid: { left: 8, right: 48, top: LT, bottom: 8, containLabel: true }, legend: { ...legend, data: ["Audited", "Not audited yet"] },
        tooltip: { ...tip, trigger: "axis", axisPointer: shadow, formatter: ps => rowsTip(bl[ps[0].dataIndex].l, ps.map(p => [p.seriesName, p.value, p.color])) },
        xAxis: { type: "value", ...axisVal }, yAxis: { type: "category", inverse: true, data: bl.map(b => b.l), ...axisCat, axisLabel: { color: INK, fontSize: 12 } },
        series: [
          { name: "Audited", type: "bar", stack: "c", barMaxWidth: 18, data: bl.map(b => b.done), itemStyle: { color: "#2a78d6", borderColor: SURF, borderWidth: 1 } },
          { name: "Not audited yet", type: "bar", stack: "c", barMaxWidth: 18, data: bl.map(b => b.total - b.done), itemStyle: { color: "#d5dae1", borderColor: SURF, borderWidth: 1, borderRadius: [0, 4, 4, 0] }, label: { show: true, position: "right", color: INK2, fontSize: 12, formatter: p => `${bl[p.dataIndex].done}/${bl[p.dataIndex].total}` } },
        ],
      }, p => { const l = bl[p.dataIndex].l; if (l !== "Not stated") { f.location = l; const s = root.querySelector("#s-location"); if (s) s.value = l; fillProjects(); sync(); draw(); } },
      { cols: ["Location", "Audited", "Active projects", "Not audited yet"], rows: bl.map(b => [b.l, b.done, b.total, b.total - b.done]) });
    }
  }

  // ---------------------------------------------------------------- events
  function sync() { const q = Object.entries(f).filter(([k, v]) => v && !(k === "period" && v === "all")); if (!showIdle) q.push(["idle", "0"]); history.replaceState(null, "", "#/dashboard?" + new URLSearchParams(q).toString()); }
  root.querySelector(".slicerbar").addEventListener("input", e => {
    const map = { "s-location": "location", "s-project": "project", "s-from": "from", "s-to": "to", "s-type": "type", "s-risk": "risk", "s-topic": "topic" };
    const k = map[e.target.id]; if (!k) return;
    f[k] = e.target.value;
    if (k === "location") fillProjects();
    sync(); draw();
  });
  root.querySelector(".slicerbar").addEventListener("click", e => {
    const b = e.target.closest("[data-period]");
    if (b) {
      f.period = b.dataset.period;
      root.querySelectorAll("[data-period]").forEach(x => x.setAttribute("aria-pressed", x === b));
      root.querySelector("#w-from").hidden = root.querySelector("#w-to").hidden = f.period !== "custom";
      sync(); draw(); return;
    }
    if (e.target.id === "s-reset") {
      Object.assign(f, { period: "all", from: "", to: "", location: "", project: "", type: "", risk: "", topic: "" });
      root.querySelectorAll(".slicerbar select, .slicerbar input").forEach(i => { i.value = ""; });
      root.querySelectorAll("[data-period]").forEach(x => x.setAttribute("aria-pressed", x.dataset.period === "all"));
      root.querySelector("#w-from").hidden = root.querySelector("#w-to").hidden = true;
      fillProjects(); sync(); draw();
    }
  });
  root.querySelector("#dash").addEventListener("click", e => {
    const tb = e.target.closest("[data-tbl]");
    if (tb) {
      const id = tb.dataset.tbl, on = tb.getAttribute("aria-pressed") !== "true", t = tables[id], box = root.querySelector("#t-" + id), ch = root.querySelector("#" + id);
      if (!t || !box) return;
      tb.setAttribute("aria-pressed", on); tb.title = on ? "Show as chart" : "Show as table"; tb.innerHTML = on ? ICON.chart : ICON.table;
      if (on) {
        box.innerHTML = `<div class="tscroll"><table class="tbl compact"><thead><tr>${t.cols.map((c, i) => `<th class="${i ? "num" : ""}">${esc(c)}</th>`).join("")}</tr></thead><tbody>${t.rows.map(r => `<tr>${r.map((v, i) => `<td class="${i ? "num" : ""}">${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
      }
      box.hidden = !on; if (ch) ch.hidden = on;
      if (!on) charts.forEach(c => c.resize());
      return;
    }
    const srt = e.target.closest("th[data-sort]");
    if (srt) { const k = srt.dataset.sort; league = { key: k, dir: league.key === k ? -league.dir : (k === "name" || k === "location" ? 1 : -1) }; drawLeague(model()); return; }
    const lr = e.target.closest("#c-league tr[data-p]");
    if (lr) { f.project = lr.dataset.p; const s = root.querySelector("#s-project"); if (s) { fillProjects(); s.value = f.project; } sync(); draw(); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    const tr = e.target.closest("tr[data-href]"); if (tr) { location.hash = tr.dataset.href; return; }
    const cov = e.target.closest('a[href="#cov"]'); if (cov) { e.preventDefault(); root.querySelector("#cov")?.scrollIntoView({ behavior: "smooth", block: "center" }); }
  });
  root.querySelector("#dash").addEventListener("change", e => { if (e.target.id === "idle") { showIdle = e.target.checked; sync(); drawLeague(model()); } });

  // full screen for presenting
  const fsBtn = root.querySelector("#fs");
  const exitPresent = () => { document.body.classList.remove("present"); setTimeout(() => charts.forEach(c => c.resize()), 60); };
  fsBtn.addEventListener("click", async () => {
    if (document.body.classList.contains("present")) { if (document.fullscreenElement) await document.exitFullscreen().catch(() => {}); exitPresent(); return; }
    document.body.classList.add("present");
    try { await document.documentElement.requestFullscreen(); } catch (e) { /* the page still switches to presenting layout */ }
    setTimeout(() => charts.forEach(c => c.resize()), 120);
  });
  const onFs = () => { if (!document.fullscreenElement) exitPresent(); };
  document.addEventListener("fullscreenchange", onFs);

  // downloads
  root.querySelector("#dl-xls").addEventListener("click", async e => {
    const b = e.currentTarget; b.disabled = true;
    try { saveBlob(await summaryWorkbook(model(), store, isAdmin), `HSE_Flash_Audit_Summary_${todayISO()}.xlsx`); toast("Excel summary downloaded."); }
    catch (x) { toast(x.message, "error"); } finally { b.disabled = false; }
  });
  root.querySelector("#dl-ppt").addEventListener("click", async e => {
    const b = e.currentTarget; b.disabled = true;
    const busy = busyOverlay("Building the PowerPoint…");
    try {
      const { buildSummaryPptx } = await import("../pptx.js");
      const blob = await buildSummaryPptx(pptModel(model()));
      saveBlob(blob, `HSE_Flash_Audit_Dashboard_${todayISO()}.pptx`); toast("PowerPoint downloaded.");
    } catch (x) { toast(x.message, "error"); } finally { busy.done(); b.disabled = false; }
  });

  function pptModel(m) {
    const closeRate = m.findings.length ? pct(m.st.closed, m.findings.length) : null;
    const top = m.topics[0];
    return {
      title: isAdmin ? (f.project ? store.project(f.project)?.name || "Project" : "HSE Flash Audit Dashboard") : (me.project_name || "Project dashboard"),
      scope: scopeText(m), asOf: fmtDate(todayISO()),
      coverRows: [["Audits", nf(m.audits.length)], ["Findings", nf(m.findings.length)], ["Closure rate", closeRate == null ? "—" : closeRate + "%"], ["Overdue", nf(m.st.overdue)]],
      kpis: [
        { label: "Audits", value: nf(m.audits.length), note: `${m.audits.filter(a => a.audit_type === "corporate").length} corporate · ${m.audits.filter(a => a.audit_type === "project").length} project` },
        { label: "Findings", value: nf(m.findings.length), note: `${m.findings.filter(x => x.risk === "High").length} high risk` },
        { label: "Closure rate", value: closeRate == null ? "—" : closeRate + "%", note: `${nf(m.st.closed)} closed`, tone: "good" },
        { label: "Not closed", value: nf(m.notClosed), note: `${m.st.pending} waiting for review`, tone: m.notClosed ? "warn" : "" },
        { label: "Overdue", value: nf(m.st.overdue), note: m.overdue.length ? `oldest ${m.overdue[0].d} days late` : "none late", tone: m.st.overdue ? "bad" : "good" },
        { label: "High risk not closed", value: nf(m.highOpen), tone: m.highOpen ? "bad" : "good" },
        { label: "Average days to close", value: m.avgClose == null ? "—" : nf(m.avgClose), note: "excluding on-the-spot fixes" },
        isAdmin ? { label: "Projects audited", value: `${m.coverage.audited.length} / ${m.coverage.audited.length + m.coverage.missing.length}`, note: `${m.coverage.missing.length} not audited yet` }
          : { label: "Checklist compliance", value: m.ok + m.nc ? pct(m.ok, m.ok + m.nc) + "%" : "—" },
      ],
      headline: m.findings.length ? `${nf(m.findings.length)} findings from ${nf(m.audits.length)} audits; ${closeRate}% are closed. ${m.st.overdue ? `${m.st.overdue} are overdue, the oldest ${m.overdue[0].d} days past target.` : "None are overdue."}${top ? ` Most findings are in ${top.t.name} (${top.n}).` : ""}${m.highOpen ? ` ${m.highOpen} high-risk findings are still open.` : ""}` : "No findings in this view yet.",
      byGroup: { title: m.byProjectView ? "Findings by project" : "Findings by area", labels: m.glist.map(g => g.name), ...Object.fromEntries(STATES.map(s => [s, m.glist.map(g => g[s])])) },
      status: m.st, aging: { labels: m.aging.map(a => a.label), values: m.aging.map(a => a.n) },
      byTopic: { labels: m.topics.map(x => x.t.name), High: m.topics.map(x => x.r[0]), Med: m.topics.map(x => x.r[1]), Low: m.topics.map(x => x.r[2]) },
      monthly: { labels: m.monthly.labels, raised: m.monthly.raised, closed: m.monthly.closed },
      rootCauses: { labels: m.rootCauses.map(x => x[0]), values: m.rootCauses.map(x => x[1]) },
      league: isAdmin && m.byProjectView ? m.perf.filter(r => r.audits || r.n).sort((a, b) => b.overdue - a.overdue || b.open - a.open || a.name.localeCompare(b.name)) : [],
      coverage: isAdmin && m.byProjectView ? { audited: m.coverage.audited.map(p => p.name), missing: m.coverage.missing.map(p => p.name) } : null,
      overdue: m.overdue.map(({ x, d }) => ({ ref: fRef(x.ref), project: x.projects?.name || "", observation: x.observation, risk: RISK_LABEL[x.risk] || x.risk, owner: x.owner || "", target: fmtDate(x.target_date), days: d })),
      support: m.support.map(x => ({ ref: fRef(x.ref), project: x.projects?.name || "", title: x.support_title || topicName(x.topic), observation: x.observation, risk: RISK_LABEL[x.risk] || x.risk, status: STATE_LABEL[findingState(x)] })),
    };
  }

  const ro = new ResizeObserver(() => charts.forEach(c => c.resize()));
  ro.observe(root);
  sync();
  draw();
  return { unmount() { ro.disconnect(); charts.forEach(c => c.dispose()); document.removeEventListener("fullscreenchange", onFs); document.body.classList.remove("present"); } };
}

async function summaryWorkbook(m, store, isAdmin) {
  const ExcelJS = await ensureExcelJS();
  const wb = new ExcelJS.Workbook();
  const head = ws => { const r = ws.getRow(1); r.font = { bold: true, color: { argb: "FFFFFFFF" } }; r.eachCell(c => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF003876" } }; }); ws.views = [{ state: "frozen", ySplit: 1 }]; };
  const s1 = wb.addWorksheet("Projects");
  s1.columns = [{ header: "Project", width: 44 }, { header: "Location", width: 14 }, { header: "Audits", width: 9 }, { header: "Last audit", width: 12 }, { header: "Findings", width: 10 }, { header: "High risk", width: 10 }, { header: "Not closed", width: 11 }, { header: "Overdue", width: 10 }, { header: "Closure %", width: 11 }, { header: "Checklist compliance %", width: 14 }];
  m.perf.forEach(r => s1.addRow([r.name, r.location, r.audits, r.last || "", r.n, r.high, r.open, r.overdue, r.closure == null ? null : r.closure / 100, r.comp == null ? null : r.comp / 100]));
  s1.getColumn(9).numFmt = "0%"; s1.getColumn(10).numFmt = "0%"; head(s1);
  const s2 = wb.addWorksheet("Topics");
  s2.columns = [{ header: "Topic", width: 30 }, { header: "High", width: 8 }, { header: "Medium", width: 9 }, { header: "Low", width: 8 }, { header: "Total", width: 8 }, { header: "Not closed", width: 11 }];
  m.topics.forEach(x => s2.addRow([x.t.name, ...x.r, x.n, m.findings.filter(y => y.topic === x.t.code && y.status !== "closed").length]));
  head(s2);
  const s3 = wb.addWorksheet("Monthly");
  s3.columns = [{ header: "Month", width: 12 }, { header: "Audits", width: 9 }, { header: "Findings raised", width: 15 }, { header: "Findings closed", width: 15 }, { header: "Not closed at month end", width: 22 }];
  m.monthly.labels.forEach((l, i) => s3.addRow([l, m.monthly.audits[i], m.monthly.raised[i], m.monthly.closed[i], m.monthly.backlog[i]])); head(s3);
  const s4 = wb.addWorksheet("Overdue");
  s4.columns = [{ header: "Ref", width: 10 }, { header: "Project", width: 36 }, { header: "Observation", width: 60 }, { header: "Risk", width: 8 }, { header: "Owner", width: 22 }, { header: "Target date", width: 12 }, { header: "Days late", width: 10 }];
  m.overdue.forEach(({ x, d }) => s4.addRow([fRef(x.ref), x.projects?.name || "", x.observation, RISK_LABEL[x.risk] || x.risk, x.owner, x.target_date, d]));
  s4.getColumn(3).alignment = { wrapText: true, vertical: "top" }; head(s4);
  if (isAdmin) {
    const s5 = wb.addWorksheet("Coverage");
    s5.columns = [{ header: "Project", width: 44 }, { header: "Location", width: 14 }, { header: "Audited in period", width: 16 }];
    [...m.coverage.audited.map(p => [p, "Yes"]), ...m.coverage.missing.map(p => [p, "No"])].forEach(([p, y]) => s5.addRow([p.name, p.location || "", y])); head(s5);
  }
  return new Blob([await wb.xlsx.writeBuffer()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
