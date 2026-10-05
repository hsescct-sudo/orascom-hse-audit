// Shared UI helpers: escaping, dates, chips, toasts, dialogs, images.
export const $ = (s, root = document) => root.querySelector(s);
export const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
export const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const clone = o => JSON.parse(JSON.stringify(o));

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function todayISO() { const d = new Date(); return isoOf(d); }
export function isoOf(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
export function fmtDate(s) {
  if (!s) return "";
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(s);
  return `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}`;
}
export function fmtDateTime(s) {
  if (!s) return "";
  const d = new Date(s);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
export function addDays(iso, n) { const [y, m, d] = iso.split("-").map(Number); const t = new Date(y, m - 1, d + n); return isoOf(t); }
export function daysBetween(a, b) { const pa = new Date(a + "T00:00:00"), pb = new Date(b + "T00:00:00"); return Math.round((pb - pa) / 86400000); }
export const monthKey = iso => String(iso || "").slice(0, 7);
export function monthLabel(key) { const [y, m] = key.split("-"); return `${MONTHS[+m - 1]} ${y.slice(2)}`; }
export const fRef = n => "F-" + String(n || 0).padStart(5, "0");
export const aRef = n => "A-" + String(n || 0).padStart(4, "0");
export const pct = (a, b) => (b ? Math.round((100 * a) / b) : null);

// Finding state as people read it: Overdue beats Open
export function findingState(f, today = todayISO()) {
  if (f.status === "closed") return "closed";
  if (f.status === "pending") return "pending";
  if (f.target_date && f.target_date < today) return "overdue";
  return "open";
}
export const STATE_LABEL = { open: "Open", pending: "Pending review", closed: "Closed", overdue: "Overdue" };
export const RISK_LABEL = { High: "High", Med: "Medium", Low: "Low" };
export const stateChip = f => { const s = typeof f === "string" ? f : findingState(f); return `<span class="chip st-${s}">${STATE_LABEL[s]}</span>`; };
export const riskChip = r => `<span class="chip rk-${esc(r)}">${esc(RISK_LABEL[r] || r)}</span>`;

// Colors (validated for colour-blind separation)
export const COLORS = {
  risk: { High: "#d03b3b", Med: "#eda100", Low: "#1d7f4f" },
  state: { closed: "#0ca30c", pending: "#2a78d6", open: "#eb6834", overdue: "#a52a2a" },
  series: ["#2a78d6", "#1baf7a", "#eb6834", "#eda100"],
  seq: ["#eef4fc", "#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"],
  brand: "#003876",
};

// Phones and tablets get a direct "Camera" button next to "Gallery"; desktops get one "Add photo".
export const isTouch = () => { try { return matchMedia("(pointer: coarse)").matches; } catch (e) { return false; } };
export function photoInputs(cls, attrs, label = "Add photo") {
  const inp = extra => `<input type="file" accept="image/*" ${extra} ${attrs}>`;
  return isTouch()
    ? `<label class="${cls} cam">${ICON.cam}<span>Camera</span>${inp('capture="environment"')}</label><label class="${cls}">${ICON.img}<span>Gallery</span>${inp("multiple")}</label>`
    : `<label class="${cls}">${ICON.cam}<span>${label}</span>${inp("multiple")}</label>`;
}

export function debounce(fn, ms = 600) {
  let t = null;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(t); return fn(...a); };
  return d;
}

// ---- toasts ----
let toastHost = null;
export function toast(msg, kind = "info") {
  if (!toastHost) { toastHost = document.createElement("div"); toastHost.className = "toasts"; toastHost.setAttribute("role", "status"); document.body.appendChild(toastHost); }
  const el = document.createElement("div");
  el.className = "toast " + kind; el.textContent = msg;
  toastHost.appendChild(el);
  setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 300); }, kind === "error" ? 6000 : 3200);
}

// ---- dialogs (in-page; browser dialogs are not used) ----
export function dialog({ title, body = "", actions = [{ label: "Close", value: null }], wide = false, onMount }) {
  return new Promise(resolve => {
    const wrap = document.createElement("div");
    wrap.className = "dlg-wrap";
    wrap.innerHTML = `<div class="dlg ${wide ? "wide" : ""}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="dlg-head"><h2>${esc(title)}</h2><button class="icon-btn" data-x aria-label="Close">${ICON.x}</button></div>
      <div class="dlg-body">${body}</div>
      <div class="dlg-foot">${actions.map((a, i) => `<button class="btn ${a.kind || (i === actions.length - 1 ? "primary" : "ghost")}" data-i="${i}" type="button">${esc(a.label)}</button>`).join("")}</div>
    </div>`;
    document.body.appendChild(wrap);
    const close = v => { wrap.remove(); document.removeEventListener("keydown", onKey); resolve(v); };
    const onKey = e => { if (e.key === "Escape") close(null); };
    document.addEventListener("keydown", onKey);
    wrap.addEventListener("click", async e => {
      if (e.target === wrap || e.target.closest("[data-x]")) return close(null);
      const b = e.target.closest("[data-i]"); if (!b) return;
      const a = actions[+b.dataset.i];
      if (a.validate) { const err = await a.validate(wrap); if (err) { const m = wrap.querySelector(".dlg-err") || Object.assign(document.createElement("p"), { className: "dlg-err" }); m.textContent = err; wrap.querySelector(".dlg-body").appendChild(m); return; } }
      close(typeof a.value === "function" ? a.value(wrap) : a.value);
    });
    if (onMount) onMount(wrap);
    const first = wrap.querySelector("input, textarea, select") || wrap.querySelector(".dlg-foot .btn.primary");
    if (first) setTimeout(() => first.focus(), 30);
  });
}
export function confirmBox(text, { title = "Please confirm", ok = "Confirm", danger = false, typeToConfirm = "" } = {}) {
  const body = `<p>${esc(text)}</p>${typeToConfirm ? `<label class="fld"><span>Type <b>${esc(typeToConfirm)}</b> to confirm</span><input id="dlg-type" autocomplete="off"></label>` : ""}`;
  return dialog({
    title, body,
    actions: [{ label: "Cancel", value: false }, {
      label: ok, kind: danger ? "danger" : "primary", value: true,
      validate: typeToConfirm ? w => (w.querySelector("#dlg-type").value.trim() === typeToConfirm ? null : "The text doesn't match.") : null
    }]
  });
}

// ---- images ----
export async function shrinkImage(file, max = 1600, q = 0.82) {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    const b = await new Promise(r => c.toBlob(r, "image/jpeg", q));
    if (b) return b;
  } catch (e) { /* fall through */ }
  if (/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  throw new Error("This file isn't a photo the system can read. Use a JPG or PNG.");
}

export function lightbox(urls, start = 0) {
  if (!urls.length) return;
  let i = start;
  const wrap = document.createElement("div");
  wrap.className = "lightbox";
  const draw = () => { wrap.innerHTML = `<img src="${esc(urls[i])}" alt="Photo ${i + 1} of ${urls.length}"><div class="lb-bar">${urls.length > 1 ? `<button class="btn ghost" data-p>‹ Prev</button><span>${i + 1} / ${urls.length}</span><button class="btn ghost" data-n>Next ›</button>` : ""}<button class="btn ghost" data-c>Close</button></div>`; };
  draw();
  const close = () => { wrap.remove(); document.removeEventListener("keydown", key); };
  const key = e => { if (e.key === "Escape") close(); if (e.key === "ArrowRight") { i = (i + 1) % urls.length; draw(); } if (e.key === "ArrowLeft") { i = (i - 1 + urls.length) % urls.length; draw(); } };
  wrap.addEventListener("click", e => {
    if (e.target.closest("[data-p]")) { i = (i - 1 + urls.length) % urls.length; draw(); }
    else if (e.target.closest("[data-n]")) { i = (i + 1) % urls.length; draw(); }
    else if (e.target.closest("[data-c]") || e.target === wrap) close();
  });
  document.addEventListener("keydown", key);
  document.body.appendChild(wrap);
}

export function loadScript(src) {
  return new Promise((ok, bad) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => bad(new Error("Couldn't load " + src)); document.head.appendChild(s); });
}
export async function ensureExcelJS() {
  if (window.ExcelJS) return window.ExcelJS;
  const srcs = (window.HSE_CONFIG && window.HSE_CONFIG.excelJsUrls) || [
    "https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js"];
  for (const s of srcs) { try { await loadScript(s); if (window.ExcelJS) return window.ExcelJS; } catch (e) { /* next */ } }
  throw new Error("The Excel library couldn't load. Check the internet connection and try again.");
}
export async function ensurePptx() {
  if (window.PptxGenJS) return window.PptxGenJS;
  const srcs = (window.HSE_CONFIG && window.HSE_CONFIG.pptxUrls) || [
    "https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js",
    "https://unpkg.com/pptxgenjs@3.12.0/dist/pptxgen.bundle.js"];
  for (const s of srcs) { try { await loadScript(s); if (window.PptxGenJS) return window.PptxGenJS; } catch (e) { /* next */ } }
  throw new Error("The PowerPoint library couldn't load. Check the internet connection and try again.");
}
export async function ensureJSZip() {
  if (window.JSZip) return window.JSZip;
  for (const s of ["https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js", "https://unpkg.com/jszip@3.10.1/dist/jszip.min.js"]) { try { await loadScript(s); if (window.JSZip) return window.JSZip; } catch (e) { /* next */ } }
  return null; // pictures placed inside cells are then skipped; floating pictures still import
}
// A blocking progress note for long jobs (bulk delete, PowerPoint with photos).
export function busyOverlay(text) {
  const el = document.createElement("div");
  el.className = "busy-wrap"; el.setAttribute("role", "status");
  el.innerHTML = `<div class="busy"><span class="spin"></span><span class="busy-t"></span></div>`;
  el.querySelector(".busy-t").textContent = text;
  document.body.appendChild(el);
  return { set(t) { el.querySelector(".busy-t").textContent = t; }, done() { el.remove(); } };
}
export async function saveBlob(blob, filename) {
  // Inside a Claude preview the page must ask the viewer to save; elsewhere a normal download link works.
  try {
    if (window.claude && typeof window.claude.use === "function") {
      const dl = await window.claude.use("downloads");
      if (dl) { await dl.save({ filename, data: blob }); return; }
    }
  } catch (e) { if (e && e.code === "declined") return; }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}

export const ICON = {
  x: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
  dash: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 13h6V4H4zm0 7h6v-5H4zm10 0h6v-9h-6zm0-16v5h6V4z" fill="currentColor"/></svg>',
  list: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 6h2v2H4zm4 0h12v2H8zM4 11h2v2H4zm4 0h12v2H8zm-4 5h2v2H4zm4 0h12v2H8z" fill="currentColor"/></svg>',
  clip: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M9 3h6v2h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h3zm0 4H7v12h10V7h-2v1H9zm2-2v1h2V5zm-2 6h6v2H9zm0 4h4v2H9z" fill="currentColor"/></svg>',
  plus: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z" fill="currentColor"/></svg>',
  upload: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 3l5 5h-3v6h-4V8H7zM5 17h14v3H5z" fill="currentColor"/></svg>',
  building: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 21V5l8-3v6l8 3v10h-6v-5h-4v5zm3-12v2h2V9zm0 4v2h2v-2zm4-6v2h2V7z" fill="currentColor"/></svg>',
  users: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M9 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm8 1a3 3 0 1 1 0-6 3 3 0 0 1 0 6zM2 20c0-3.3 3.1-6 7-6s7 2.7 7 6zm15.5 0c0-1.9-.7-3.6-1.9-4.9 3 .2 5.4 2.2 5.4 4.9z" fill="currentColor"/></svg>',
  key: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M7 14a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm5.7-4A6 6 0 1 0 12.7 14H16v3h3v-3h2v-4z" fill="currentColor"/></svg>',
  out: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M10 4H5v16h5v-2H7V6h3zm5 3l-1.4 1.4 2.6 2.6H9v2h7.2l-2.6 2.6L15 17l5-5z" fill="currentColor"/></svg>',
  cam: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9 4h6l1.5 2H20a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h3.5zm3 4a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6z" fill="currentColor"/></svg>',
  menu: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z" fill="currentColor"/></svg>',
  dl: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M11 3h2v9l3-3 1.4 1.4L12 15.8 6.6 10.4 8 9l3 3zM5 18h14v2H5z" fill="currentColor"/></svg>',
  img: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm1 2v8.6l3.5-3.5 3 3 4.5-4.5 3 3V7zm4 1.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z" fill="currentColor"/></svg>',
  phone: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm0 3v13h10V5zm5 14.2a1 1 0 1 0 0 2 1 1 0 0 0 0-2zM11 7h2v5l1.6-1.6L16 11.8 12 15.8l-4-4 1.4-1.4L11 12z" fill="currentColor"/></svg>',
  help: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm-1 11h2v2h-2zm1-9a4 4 0 0 1 2.2 7.3c-.8.6-1.2 1-1.2 1.7h-2c0-1.6.9-2.4 1.8-3A2 2 0 1 0 10 10H8a4 4 0 0 1 4-4z" fill="currentColor"/></svg>',
  gear: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M10.3 2h3.4l.5 2.6c.6.2 1.2.5 1.7.9l2.5-.9 1.7 3-2 1.7c.1.6.1 1.3 0 1.9l2 1.7-1.7 3-2.5-.9c-.5.4-1.1.7-1.7.9l-.5 2.6h-3.4l-.5-2.6c-.6-.2-1.2-.5-1.7-.9l-2.5.9-1.7-3 2-1.7a5.6 5.6 0 0 1 0-1.9l-2-1.7 1.7-3 2.5.9c.5-.4 1.1-.7 1.7-.9zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" fill="currentColor"/></svg>',
  up: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 7l-6 6 1.4 1.4L12 9.8l4.6 4.6L18 13z" fill="currentColor"/></svg>',
  down: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 17l6-6-1.4-1.4-4.6 4.6-4.6-4.6L6 11z" fill="currentColor"/></svg>',
  trash: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M9 3h6l1 2h4v2H4V5h4zm-3 6h12l-1 12H7zm4 2v8h2v-8zm4 0v8h2v-8z" fill="currentColor"/></svg>',
  ppt: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-7v2h3v2H8v-2h3v-2H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm1 2v9h14V6zm2 7l3-4 2 2 2-3 3 5z" fill="currentColor"/></svg>',
  xls: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 3h11l5 5v13H4zm10 1.5V9h4.5zM7.5 11l2.2 3.2L7.4 17.5h2l1.3-2 1.3 2h2l-2.3-3.3L14 11h-2l-1.3 1.9L9.5 11z" fill="currentColor"/></svg>',
  expand: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 4h6v2H6v4H4zm10 0h6v6h-2V6h-4zM4 14h2v4h4v2H4zm14 0h2v6h-6v-2h4z" fill="currentColor"/></svg>',
  table: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M3 4h18v16H3zm2 2v3h6V6zm8 0v3h6V6zM5 11v3h6v-3zm8 0v3h6v-3zm-8 5v2h6v-2zm8 0v2h6v-2z" fill="currentColor"/></svg>',
  chart: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 19h16v2H2V3h2zm3-2V10h3v7zm5 0V6h3v11zm5 0v-5h3v5z" fill="currentColor"/></svg>',
  warn: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M12 2l10 18H2zm-1 7v5h2V9zm0 7v2h2v-2z" fill="currentColor"/></svg>',
  check: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M9 16.2l-3.5-3.5L4 14.2l5 5 11-11-1.4-1.4z" fill="currentColor"/></svg>',
};
