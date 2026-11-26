// Project link page: the project sees its NCRs of one audit type and sends evidence.
// No sign-in. The long code in the link (#t=...) is the key. Nothing is saved on the device
// except the sender's name, to fill it next time.
import { esc, fmtDate, todayISO, daysBetween, shrinkImage, photoInputs, lightbox, ensureSupabase } from "./ui.js";

const CFG = window.HSE_AUDIT_CONFIG || {};
const BUCKET = CFG.photoBucket || "audit-photos";
const token = new URLSearchParams(location.hash.slice(1)).get("t") || "";
const MOD = { full: "HSE Audit", lifting: "Lifting Assessment" };
const SEV = { Serious: "Serious", Major: "Major", Minor: "Minor" };
const $ = s => document.querySelector(s);
let client = null;
const urls = new Map();

const mem = { get: k => { try { return localStorage.getItem("oc-link-" + k) || ""; } catch (e) { return ""; } }, set: (k, v) => { try { localStorage.setItem("oc-link-" + k, v); } catch (e) { /* private mode */ } } };
const plainErr = e => {
  const m = String((e && e.message) || e || "");
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return "No connection. Check the internet and try again.";
  if ((e && e.code === "PGRST202") || /Could not find the function/i.test(m)) return "Project links are not switched on yet. Ask Corporate HSE.";
  return m || "Something went wrong. Try again.";
};

async function getClient() {
  if (client) return client;
  const sb = await ensureSupabase();
  client = sb.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

async function photoUrl(id) {
  if (urls.has(id)) return urls.get(id);
  try {
    const { data, error } = await (await getClient()).storage.from(BUCKET).download(`${id}.jpg`);
    if (error || !data) return null;
    const u = URL.createObjectURL(data); urls.set(id, u); return u;
  } catch (e) { return null; }
}

async function load() {
  if (!token || token.length < 24) return fail("This link is not complete. Open the full link you received, or ask Corporate HSE for a new one.");
  let data;
  try {
    const c = await getClient();
    const r = await c.rpc("ha_link_open", { p_token: token });
    if (r.error) throw r.error;
    data = r.data;
  } catch (e) { return fail(plainErr(e)); }
  draw(data);
}

function fail(msg) {
  $("#lk-sub").textContent = "";
  $("#lk-main").innerHTML = `<div class="empty"><h3>This page couldn't open</h3><p>${esc(msg)}</p></div>`;
}

function draw(data) {
  const p = data.project || {};
  const list = data.ncrs || [];
  const today = todayISO();
  const open = list.filter(n => n.status === "Open");
  document.title = `${p.name || "Project"} NCRs · OC HSE Audit`;
  $("#lk-title").textContent = p.name || "Project";
  $("#lk-sub").textContent = `${MOD[data.module] || "Audit"} NCRs · ${[p.code, p.city, p.country].filter(Boolean).join(" · ")}`;
  $("#lk-main").innerHTML = `
    <p class="lk-intro">${open.length ? `${open.length} NCR${open.length === 1 ? " needs" : "s need"} action. For each one, write what was done, add photos of the evidence and send it. The auditor checks it and closes the NCR, or sends it back with a reason.` : "No NCR needs action now. Sent evidence and recently closed NCRs are listed below."}</p>
    ${list.map(n => card(n, today)).join("") || `<div class="empty"><h3>No NCRs</h3><p>There are no open NCRs for this project.</p></div>`}`;
  list.forEach(n => {
    const el = document.querySelector(`[data-ncr="${CSS.escape(n.id)}"]`);
    fillPhotos(el.querySelector("[data-photos]"), n.photos || []);
    if (n.status !== "Open") fillPhotos(el.querySelector("[data-ca]"), n.ca_photos || []);
    else mountForm(el, n);
  });
}

function card(n, today) {
  const late = n.status === "Open" && n.due_date && n.due_date < today;
  const st = n.status === "Open" ? (late ? `<span class="chip st-overdue">Past deadline</span>` : `<span class="chip st-open">Open</span>`)
    : n.status === "Review" ? `<span class="chip st-review">With the auditor</span>` : `<span class="chip st-closed">Closed</span>`;
  return `<section class="panel lk-ncr" data-ncr="${esc(n.id)}">
    <div class="row" style="gap:8px"><span class="chip sev-${esc(SEV[n.severity] || "Minor")}">${esc(n.severity || "")}</span>${n.repeated ? '<span class="chip rep">Repeated</span>' : ""}${st}<span class="muted small" style="margin-left:auto">${esc(n.ref || "")}</span></div>
    <h2>${esc(n.description || "")}</h2>
    <div class="lk-meta">
      <div><span>Location</span>${esc(n.location || "–")}</div>
      <div><span>Classification</span>${esc(n.classification || "–")}</div>
      <div><span>Deadline</span><b class="${late ? "lk-late" : ""}">${esc(fmtDate(n.due_date) || "–")}</b>${late ? `<br><span class="lk-late">${daysBetween(n.due_date, today)} days late</span>` : ""}</div>
      <div><span>Responsible</span>${esc([n.responsible_name, n.responsible_position].filter(Boolean).join(", ") || "–")}</div>
    </div>
    ${n.action_required ? `<p style="margin:6px 0"><b>Action required:</b> ${esc(n.action_required)}</p>` : ""}
    <div data-photos></div>
    ${n.status === "Open" ? `${n.return_reason ? `<p class="lk-note" style="margin-top:12px"><b>Sent back by the auditor:</b> ${esc(n.return_reason)}</p>` : ""}<div class="lk-form" data-form></div>`
      : `<div class="lk-done" style="margin-top:12px">${n.status === "Review" ? `Evidence sent${n.received_at ? " on " + esc(fmtDate(n.received_at.slice(0, 10))) : ""}. The auditor will check it.` : `Closed${n.closed_at ? " on " + esc(fmtDate(n.closed_at.slice(0, 10))) : ""}.`}${n.ca_text ? `<br><b>What was done:</b> ${esc(n.ca_text)}` : ""}</div><div data-ca style="margin-top:10px"></div>`}
  </section>`;
}

async function fillPhotos(el, ids) {
  if (!el || !ids.length) return;
  el.innerHTML = `<div class="photos">${ids.map((_, i) => `<div class="ph" data-i="${i}" role="button" tabindex="0" aria-label="Photo ${i + 1}"></div>`).join("")}</div>`;
  const list = await Promise.all(ids.map(photoUrl));
  el.querySelectorAll(".ph").forEach((ph, i) => { if (list[i]) ph.style.backgroundImage = `url('${list[i]}')`; });
  el.onclick = e => { const ph = e.target.closest(".ph"); if (ph) lightbox(list.filter(Boolean), +ph.dataset.i); };
}

function mountForm(el, n) {
  const box = el.querySelector("[data-form]");
  const photos = []; // { blob, url }
  box.innerHTML = `<div class="stack" style="gap:12px">
    <label class="fld"><span>What was done to correct it</span><textarea data-k="text" placeholder="For example: guardrails fixed on all open edges of level 3, toe boards added"></textarea></label>
    <div class="grid2"><label class="fld"><span>Date done</span><input type="date" data-k="date" value="${esc(todayISO())}" max="${esc(todayISO())}"></label><div></div></div>
    <div class="fld"><span>Photos of the evidence (at least one)</span><div data-ev></div></div>
    <div class="grid2"><label class="fld"><span>Your name</span><input data-k="name" autocomplete="name" value="${esc(mem.get("name"))}"></label><label class="fld"><span>Your position</span><input data-k="pos" autocomplete="organization-title" value="${esc(mem.get("pos"))}" placeholder="e.g. Project HSE Manager"></label></div>
    <div class="fld lk-sig"><span>Signature of the person responsible (optional)</span><canvas width="360" height="110"></canvas><button type="button" class="btn sm ghost" data-clear style="justify-self:start">Clear signature</button></div>
    <p class="lk-err" data-err role="alert"></p>
    <button type="button" class="btn primary lg" data-send>Send to the auditor</button></div>`;
  const ev = box.querySelector("[data-ev]");
  const drawPhotos = () => {
    ev.innerHTML = `<div class="photos">${photos.map((p, i) => `<div class="ph" style="background-image:url('${p.url}')"><button type="button" data-del="${i}" aria-label="Remove photo">×</button></div>`).join("")}${photos.length < 10 ? photoInputs("photo-btn", "data-add", "Add photo") : ""}</div>`;
  };
  ev.addEventListener("click", e => { const d = e.target.closest("[data-del]"); if (d) { photos.splice(+d.dataset.del, 1); drawPhotos(); } });
  ev.addEventListener("change", async e => {
    const inp = e.target.closest("input[type=file]"); if (!inp) return;
    const files = [...inp.files].slice(0, 10 - photos.length); inp.value = "";
    for (const f of files) { try { const blob = await shrinkImage(f, 1600, 0.8); photos.push({ blob, url: URL.createObjectURL(blob) }); } catch (err) { box.querySelector("[data-err]").textContent = err.message; } }
    drawPhotos();
  });
  drawPhotos();
  // signature pad
  const c = box.querySelector("canvas"), ctx = c.getContext("2d"); let down = false, drawn = false;
  ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.strokeStyle = "#14233b";
  const pt = e => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * c.width / r.width, (e.clientY - r.top) * c.height / r.height]; };
  c.addEventListener("pointerdown", e => { down = true; c.setPointerCapture(e.pointerId); const [x, y] = pt(e); ctx.beginPath(); ctx.moveTo(x, y); });
  c.addEventListener("pointermove", e => { if (!down) return; const [x, y] = pt(e); ctx.lineTo(x, y); ctx.stroke(); drawn = true; });
  c.addEventListener("pointerup", () => { down = false; });
  box.querySelector("[data-clear]").onclick = () => { ctx.clearRect(0, 0, c.width, c.height); drawn = false; };

  const send = box.querySelector("[data-send]");
  box.addEventListener("input", () => { box.querySelector("[data-err]").textContent = ""; });
  send.onclick = async () => {
    const v = k => box.querySelector(`[data-k=${k}]`).value.trim();
    const err = box.querySelector("[data-err]");
    const problem = v("text").length < 5 ? "Write what was done to correct it." : !photos.length ? "Add at least one photo of the evidence." : !v("name") ? "Write your name." : "";
    if (problem) { err.textContent = problem; return; }
    err.textContent = ""; send.disabled = true;
    mem.set("name", v("name")); mem.set("pos", v("pos"));
    try {
      const cl = await getClient();
      const ids = [];
      for (const [i, p] of photos.entries()) {
        send.textContent = `Sending photo ${i + 1} of ${photos.length}…`;
        if (!p.id) {
          const id = `lnk/${token}/ph-${crypto.randomUUID()}`;
          const { error } = await cl.storage.from(BUCKET).upload(`${id}.jpg`, p.blob, { contentType: "image/jpeg", upsert: false });
          if (error && !/exists|Duplicate/i.test(error.message || "")) throw new Error("A photo didn't upload. Check the internet and try again.");
          p.id = id;
        }
        ids.push(p.id);
      }
      send.textContent = "Sending…";
      const { error } = await cl.rpc("ha_link_submit", { p_token: token, p_ncr_id: n.id, p_text: v("text"), p_date: v("date"), p_photos: ids, p_name: v("name"), p_position: v("pos"), p_sig: drawn ? c.toDataURL("image/png") : "" });
      if (error) throw error;
      send.textContent = "Sent";
      await load();
      const done = document.querySelector(`[data-ncr="${CSS.escape(n.id)}"]`);
      if (done) { done.scrollIntoView({ block: "start" }); done.querySelector(".lk-done") && done.querySelector(".lk-done").insertAdjacentHTML("afterbegin", "<b>Thank you.</b> "); }
    } catch (e) {
      err.textContent = plainErr(e); send.disabled = false; send.textContent = "Send to the auditor";
    }
  };
}

// another link opened in the same tab
window.addEventListener("hashchange", () => location.reload());
load();
