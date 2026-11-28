// Voice typing: a microphone button on every text box. Press it, speak, and the words are written in.
// Uses the speech recognition built into the browser (Chrome, Edge, Safari). Chrome needs internet for it.
// Press again to stop. The language (English or Arabic) is kept on this device.
const SR = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
export const voiceSupported = !!SR;
const KEY = "oc-voice-lang";
export const LANGS = [["en-US", "English"], ["ar-EG", "Arabic"]];
export function voiceLang() { try { return localStorage.getItem(KEY) || "en-US"; } catch (e) { return "en-US"; } }
export function setVoiceLang(l) { try { localStorage.setItem(KEY, l); } catch (e) { /* private mode */ } }

const MIC = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 15a3.5 3.5 0 0 0 3.5-3.5v-6a3.5 3.5 0 1 0-7 0v6A3.5 3.5 0 0 0 12 15Z" fill="currentColor"/><path d="M18.5 11.5a6.5 6.5 0 0 1-13 0M12 18v3.5M8.5 21.5h7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
let active = null;
let onMessage = () => {};

function stop() { if (active) { try { active.rec.stop(); } catch (e) { /* already stopped */ } } }

function listen(field, btn) {
  if (active) { const same = active.field === field; stop(); if (same) return; }
  const rec = new SR();
  rec.lang = voiceLang(); rec.interimResults = true; rec.continuous = true;
  const base = field.value; const gap = base && !/\s$/.test(base) ? " " : "";
  let done = "";
  rec.onresult = e => {
    let now = "";
    for (let i = e.resultIndex; i < e.results.length; i++) { const r = e.results[i]; if (r.isFinal) done += r[0].transcript + " "; else now += r[0].transcript; }
    field.value = base + gap + (done + now).trim();
    field.dispatchEvent(new Event("input", { bubbles: true }));
  };
  rec.onerror = e => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") onMessage("Allow the microphone for this site to type by voice.");
    else if (e.error === "network") onMessage("Voice typing needs internet on this device.");
    else if (e.error === "audio-capture") onMessage("No microphone found.");
  };
  rec.onend = () => {
    btn.classList.remove("on"); btn.setAttribute("aria-pressed", "false");
    field.dispatchEvent(new Event("change", { bubbles: true }));
    if (active && active.rec === rec) active = null;
  };
  try { rec.start(); } catch (e) { onMessage("Voice typing couldn't start. Try again."); return; }
  active = { rec, field };
  btn.classList.add("on"); btn.setAttribute("aria-pressed", "true");
  field.focus();
}

function decorate(ta) {
  if (!SR || ta.dataset.voice === "off" || (ta.parentElement && ta.parentElement.classList.contains("vwrap"))) return;
  if (!ta.getAttribute("dir")) ta.dir = "auto"; // Arabic and English both read the right way
  const w = document.createElement("span");
  w.className = "vwrap";
  ta.parentNode.insertBefore(w, ta);
  w.appendChild(ta);
  const b = document.createElement("button");
  b.type = "button"; b.className = "vmic"; b.innerHTML = MIC;
  b.setAttribute("aria-label", "Speak to type"); b.setAttribute("aria-pressed", "false"); b.title = "Speak to type";
  b.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); if (ta.disabled || ta.readOnly) return; listen(ta, b); });
  w.appendChild(b);
}

// Add the button to every text box now and to every one that appears later (dialogs, steps).
export function voiceTyping({ message } = {}) {
  if (!SR) return false;
  if (message) onMessage = message;
  document.querySelectorAll("textarea").forEach(decorate);
  new MutationObserver(list => {
    for (const m of list) for (const n of m.addedNodes) {
      if (n.nodeType !== 1) continue;
      if (n.tagName === "TEXTAREA") decorate(n);
      else if (n.querySelectorAll) n.querySelectorAll("textarea").forEach(decorate);
    }
    if (active && !document.contains(active.field)) stop();
  }).observe(document.body, { childList: true, subtree: true });
  window.addEventListener("hashchange", stop);
  return true;
}
