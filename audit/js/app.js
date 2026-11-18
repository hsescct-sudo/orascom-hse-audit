// App frame: start-up, sign-in gate, navigation, routing.
import * as S from "./store.js";
import * as M from "./model.js";
import * as Sync from "./sync.js";
import { MODULES, MODULE_IDS } from "./templates.js";
import { sampleData, projectDocs, memberDocs } from "./seed.js";
import { $, esc, ICON, toast, confirmBox, debounce } from "./ui.js";

const CFG = window.HSE_AUDIT_CONFIG || {};
const VIEWS = {
  home: () => import("./views/home.js"),
  dashboard: () => import("./views/dashboard.js"),
  plan: () => import("./views/plan.js"),
  audits: () => import("./views/audits.js"),
  audit: () => import("./views/audit.js"),
  ncrs: () => import("./views/ncrs.js"),
  ncr: () => import("./views/ncr.js"),
  good: () => import("./views/good.js"),
  projects: () => import("./views/projects.js"),
  team: () => import("./views/team.js"),
  settings: () => import("./views/settings.js"),
  report: () => import("./views/report.js"),
};
const MODULE_PAGES = ["home", "dashboard", "plan", "audits", "audit", "ncrs", "ncr", "good", "report"];

let state = { module: "full", page: "dashboard", id: null, query: {} };
let cleanup = null;
let renderToken = 0;

export const go = hash => { if (location.hash === hash) route(); else location.hash = hash; };
export const link = (page, id, m = state.module) => `#/${MODULE_PAGES.includes(page) ? m + "/" : ""}${page}${id ? "/" + id : ""}`;
export const currentModule = () => state.module;

function parse() {
  const [path, qs] = location.hash.replace(/^#\/?/, "").split("?");
  const parts = path.split("/").filter(Boolean);
  const query = Object.fromEntries(new URLSearchParams(qs || ""));
  if (MODULE_IDS.includes(parts[0])) return { module: parts[0], page: parts[1] || "dashboard", id: parts[2] || null, query };
  return { module: state.module, page: parts[0] || defaultPage(), id: parts[1] || null, query };
}
const defaultPage = () => (M.me() && M.me().role === "auditor" ? "home" : "dashboard");

async function boot() {
  try { await S.openStore(); }
  catch (e) { $("#root").innerHTML = `<div class="empty" style="padding-top:20vh"><h3>This browser can't save data</h3><p>${esc(e.message)}</p></div>`; return; }
  try { const saved = localStorage.getItem("oc-audit-module"); if (MODULE_IDS.includes(saved)) state.module = saved; } catch (e) { /* private mode */ }
  const mode = await S.meta("mode");
  if (!mode) return gate();
  await startSession(mode);
}

async function startSession(mode) {
  if (mode === "demo") {
    const asId = (await S.meta("demoUser")) || "mem-admin";
    M.setMe(S.get(asId) || S.get("mem-admin") || { id: "mem-admin", name: "Corporate HSE", role: "admin", position: "Corporate HSE Manager" });
  } else {
    const who = await Sync.resume();
    if (!who) { await S.meta("mode", null); return gate(); }
    M.setMe(who);
  }
  Sync.init(mode);
  frame();
  window.addEventListener("hashchange", route);
  S.on(debounce(e => { if (e.fromServer || e.type === "bulk") refreshLive(); updateBadges(); }, 350));
  Sync.on(updateSync);
  route();
  registerSW();
}

// ---------- gate: sign in or try with sample data ----------
function gate() {
  const cloud = !!CFG.supabaseUrl;
  $("#root").innerHTML = `
  <div class="gate">
    <section class="gate-art">
      <div class="brand"><span class="brand-logo"><img src="assets/orascom-logo.png" alt="Orascom Construction"></span><span class="brand-name">Corporate HSE<span>Audit system</span></span></div>
      <div>
        <h1>Every project audited, scored and followed up.</h1>
        <p>Plan the year, audit on site with or without internet, score with the company form, raise NCRs with photos, and send the report before you leave the site.</p>
      </div>
      <div class="gate-tags" aria-hidden="true">
        <div class="stag green"><b class="s-score">91<small>%</small></b><span class="s-label">Full compliance</span></div>
        <div class="stag orange sm"><b class="s-score">79<small>%</small></b><span class="s-label">Relative</span></div>
        <div class="stag yellow sm"><b class="s-score">68<small>%</small></b><span class="s-label">Low</span></div>
        <div class="stag red sm"><b class="s-score">58<small>%</small></b><span class="s-label">No compliance</span></div>
      </div>
    </section>
    <section class="gate-form">
      <form class="gate-card" id="signin" autocomplete="on">
        <h2>Sign in</h2>
        ${cloud ? `
        <label class="fld"><span>E-mail</span><input name="email" type="email" required autocomplete="username"></label>
        <label class="fld"><span>Password</span><input name="password" type="password" required autocomplete="current-password"></label>
        <button class="btn primary lg" type="submit">Sign in</button>
        <p class="muted small" id="gate-msg">Your account is created by Corporate HSE. After the first sign-in you can work offline.</p>
        <div class="row" style="justify-content:center;color:var(--faint)">or</div>` : ""}
        <button class="btn lg" type="button" id="demo">Try it with sample data</button>
        <p class="muted small">Sample data stays on this device only. It shows how the system works with the company projects.</p>
      </form>
    </section>
  </div>`;
  $("#demo").onclick = async () => {
    const btn = $("#demo"); btn.disabled = true; btn.textContent = "Loading sample data…";
    await loadSample();
    await S.meta("mode", "demo");
    await startSession("demo");
  };
  const f = $("#signin");
  if (cloud) f.onsubmit = async e => {
    e.preventDefault();
    const msg = $("#gate-msg"); const btn = f.querySelector("button[type=submit]");
    btn.disabled = true; btn.textContent = "Signing in…";
    try {
      const who = await Sync.signIn(f.email.value.trim(), f.password.value);
      M.setMe(who);
      await S.meta("mode", "cloud");
      await startSession("cloud");
    } catch (err) { msg.textContent = err.message; msg.style.color = "var(--g-red)"; btn.disabled = false; btn.textContent = "Sign in"; }
  };
}

export async function loadSample() {
  const now = new Date().toISOString();
  const docs = sampleData(now);
  await S.putMany(docs, { keepDates: true, clean: true, silent: true });
}
export async function ensureBaseData() {
  const now = new Date().toISOString();
  if (!S.all("project").length) await S.putMany(projectDocs(now));
  if (!S.all("member").length) await S.putMany(memberDocs(now));
}

// ---------- frame ----------
function frame() {
  $("#root").innerHTML = `
  <div class="app">
    <aside class="rail" aria-label="Main menu">
      <div class="brand"><span class="brand-logo"><img src="assets/orascom-logo.png" alt="Orascom Construction"></span><span class="brand-name">Corporate HSE<span>Audit system</span></span></div>
      <nav class="modsw" aria-label="Audit type" id="modsw"></nav>
      <nav class="nav" id="nav"></nav>
      <div class="rail-foot">
        <div id="sync-rail"></div>
        <div class="who" id="who"></div>
      </div>
    </aside>
    <div class="main">
      <div id="samplebar"></div>
      <header class="topbar">
        <div class="tt"><span class="crumb" id="crumb"></span><h1 id="title"></h1></div>
        <div class="spacer"></div>
        <div id="actions" class="row"></div>
        <div id="sync-top"></div>
      </header>
      <div class="modsw-top" id="modsw-top" style="padding:10px 16px 0"></div>
      <main class="view" id="view" tabindex="-1"></main>
    </div>
    <nav class="tabbar" id="tabbar" aria-label="Main menu"></nav>
  </div>`;
  drawWho();
  updateSync(Sync.status());
}

function drawNav() {
  const m = state.module, p = state.page, me = M.me();
  const cur = (page, mod = true) => (p === page || (page === "audits" && p === "audit") || (page === "ncrs" && p === "ncr")) ? ' aria-current="page"' : "";
  const counts = navCounts();
  $("#modsw").innerHTML = MODULE_IDS.map(id => {
    const d = MODULES[id];
    return `<a href="${link(MODULE_PAGES.includes(p) && !["audit", "ncr", "report"].includes(p) ? p : "dashboard", null, id)}" aria-current="${id === m}"><span class="mi">${id === "full" ? ICON.hat : ICON.crane}</span><span><b>${esc(d.short)}</b><small>${esc(d.formRef)}</small></span></a>`;
  }).join("");
  $("#modsw-top").innerHTML = `<div class="seg" role="group" aria-label="Audit type">${MODULE_IDS.map(id => `<button type="button" data-mod="${id}" aria-pressed="${id === m}">${esc(MODULES[id].short)}</button>`).join("")}</div>`;
  $("#modsw-top").onclick = e => { const b = e.target.closest("[data-mod]"); if (b) go(link(MODULE_PAGES.includes(p) && !["audit", "ncr", "report"].includes(p) ? p : "dashboard", null, b.dataset.mod)); };
  const showModSw = MODULE_PAGES.includes(p) && !["audit", "ncr", "report"].includes(p);
  $("#modsw-top").style.visibility = showModSw ? "" : "hidden";
  $("#modsw-top").style.height = showModSw ? "" : "0";
  $("#modsw-top").style.padding = showModSw ? "" : "0";
  const items = [
    me.role !== "viewer" ? ["home", "My audits", ICON.home] : null,
    ["dashboard", "Dashboard", ICON.dash],
    ["plan", "Audit plan", ICON.cal],
    ["audits", "Audits", ICON.clip],
    ["ncrs", "NCR register", ICON.flag, counts.overdue],
    ["good", "Good practice", ICON.star],
  ].filter(Boolean);
  $("#nav").innerHTML = items.map(([pg, label, ic, c]) => `<a href="${link(pg)}"${cur(pg)}>${ic}<span>${label}</span>${c ? `<span class="cnt" title="Overdue NCRs">${c}</span>` : ""}</a>`).join("") +
    `<div class="nav-h">Company</div>` +
    [["projects", "Projects", ICON.building], ["team", "Auditors and users", ICON.users], ["settings", "Settings", ICON.gear]].map(([pg, label, ic]) => `<a href="${link(pg)}"${cur(pg)}>${ic}<span>${label}</span></a>`).join("") +
    (CFG.flashAuditUrl ? `<a href="${esc(CFG.flashAuditUrl)}" target="_blank" rel="noopener">${ICON.ext}<span>Flash Audit system</span></a>` : "");
  const tabs = [
    me.role !== "viewer" ? ["home", "My audits", ICON.home] : ["dashboard", "Dashboard", ICON.dash],
    ["audits", "Audits", ICON.clip],
    ["ncrs", "NCRs", ICON.flag],
    me.role !== "viewer" ? ["dashboard", "Dashboard", ICON.dash] : ["plan", "Plan", ICON.cal],
    ["settings", "More", ICON.more],
  ];
  $("#tabbar").innerHTML = tabs.map(([pg, label, ic]) => `<a href="${link(pg)}"${cur(pg) || (pg === "settings" && ["projects", "team", "plan", "good"].includes(p) && me.role !== "viewer" ? ' aria-current="page"' : "")}>${ic}<span>${label}</span></a>`).join("");
}
function navCounts() {
  const today = new Date().toISOString().slice(0, 10);
  return { overdue: M.ncrs(state.module).filter(n => M.ncrState(n, today) === "overdue").length };
}
const updateBadges = () => { if (document.getElementById("nav")) drawNav(); };

function drawWho() {
  const me = M.me(); if (!me) return;
  const ini = me.name.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
  $("#who").innerHTML = `<span class="avatar">${esc(ini)}</span><span style="min-width:0"><b>${esc(me.name)}</b><small>${esc({ admin: "Administrator", auditor: "Auditor", viewer: "Viewer" }[me.role] || me.role)}</small></span>`;
}

function updateSync(st) {
  if (!document.getElementById("sync-top")) return;
  const label = st.mode === "demo" ? "Sample data on this device" : !st.online ? `Offline${st.pending ? ` · ${st.pending} to send` : ""}` : st.syncing ? "Sending…" : st.pending ? `${st.pending} waiting to send` : "All saved";
  const cls = st.mode === "demo" ? "local" : !st.online ? "offline" : st.pending ? "pending" : "";
  const html = `<span class="sync ${cls}" role="status" title="${esc(st.error || label)}"><i></i><span class="sync-l">${esc(label)}</span></span>`;
  $("#sync-top").innerHTML = html;
  $("#sync-rail").innerHTML = "";
  const sb = $("#samplebar");
  if (st.mode === "demo" && sb) {
    sb.innerHTML = `<div class="sample-bar"><span><b>Sample data.</b> <span class="sb-long">Audits, scores and NCRs here are made up to show how the system works. Nothing leaves this device.</span></span><button class="btn sm" id="sb-out" type="button">Leave sample mode</button></div>`;
    $("#sb-out").onclick = leaveDemo;
  } else if (sb) sb.innerHTML = "";
}

export async function leaveDemo() {
  const ok = await confirmBox("This removes the sample data from this device and goes back to the sign-in page.", { title: "Leave sample mode?", ok: "Remove sample data" });
  if (!ok) return;
  await S.wipeAll();
  location.hash = "";
  location.reload();
}

// ---------- routing ----------
export function setTitle(title, crumb = "") { $("#title").textContent = title; $("#crumb").textContent = crumb; document.title = `${title} · OC HSE Audit`; }
export function setActions(html) { $("#actions").innerHTML = html || ""; return $("#actions"); }

async function route() {
  const next = parse();
  if (next.module !== state.module) { try { localStorage.setItem("oc-audit-module", next.module); } catch (e) { /* ignore */ } }
  state = next;
  if (!VIEWS[state.page]) { state.page = defaultPage(); }
  drawNav();
  if (cleanup) { try { cleanup(); } catch (e) { /* ignore */ } cleanup = null; }
  const token = ++renderToken;
  const view = $("#view");
  view.className = "view";
  setActions("");
  try {
    const mod = await VIEWS[state.page]();
    if (token !== renderToken) return;
    view.innerHTML = "";
    const ctx = { module: state.module, def: M.def(state.module), id: state.id, query: state.query, view };
    cleanup = (await mod.render(ctx)) || null;
    window.scrollTo(0, 0);
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="empty"><h3>This page couldn't open</h3><p>${esc(e.message || e)}</p><a class="btn" href="${link("dashboard")}">Go to the dashboard</a></div>`;
  }
}
// Pages that show lists re-draw when new data arrives from the server.
const LIVE = ["home", "dashboard", "plan", "audits", "ncrs", "good", "projects", "team"];
function refreshLive() { if (LIVE.includes(state.page)) route(); }
export const rerender = () => route();

function registerSW() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (reloading) location.reload(); });
  const offer = w => {
    if (document.getElementById("upd")) return;
    const bar = document.createElement("div");
    bar.id = "upd"; bar.className = "toast"; bar.setAttribute("role", "status");
    bar.style.cssText = "position:fixed;left:50%;bottom:86px;transform:translateX(-50%);z-index:210;display:flex;gap:12px;align-items:center";
    bar.innerHTML = `<span>A new version of the system is ready.</span><button class="btn sm" type="button">Update now</button>`;
    bar.querySelector("button").onclick = () => { reloading = true; w.postMessage("update"); };
    document.body.appendChild(bar);
  };
  navigator.serviceWorker.register("sw.js").then(reg => {
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      w && w.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) offer(w); });
    });
    setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
  }).catch(() => { /* offline support unavailable */ });
}

boot();
