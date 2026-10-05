// Phone app: install prompt, iPhone instructions, offline notice and update notice.
import { dialog, toast } from "./ui.js";

let deferred = null;
const listeners = new Set();
const notify = () => listeners.forEach(f => { try { f(); } catch (e) { /* ignore */ } });

export const isStandalone = () => { try { return matchMedia("(display-mode: standalone)").matches || navigator.standalone === true; } catch (e) { return false; } };
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const isAndroid = () => /android/i.test(navigator.userAgent);
export const installAvailable = () => !isStandalone() && !!(deferred || isIOS() || isAndroid());
export const onInstallChange = fn => listeners.add(fn);

window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferred = e; notify(); });
window.addEventListener("appinstalled", () => { deferred = null; notify(); toast("App installed. Open it from your home screen."); });

export async function installApp() {
  if (deferred) {
    deferred.prompt();
    try { await deferred.userChoice; } catch (e) { /* ignore */ }
    deferred = null; notify();
    return;
  }
  const ios = `<ol class="steps"><li>Open this link in <b>Safari</b> (not inside WhatsApp or another app).</li><li>Tap the <b>Share</b> button — the square with an arrow at the bottom of the screen.</li><li>Scroll and tap <b>Add to Home Screen</b>, then <b>Add</b>.</li><li>Open <b>HSE Audit</b> from your home screen. It opens full screen like any app.</li></ol>`;
  const android = `<ol class="steps"><li>Open this link in <b>Chrome</b>.</li><li>Tap the menu <b>⋮</b> at the top right.</li><li>Tap <b>Install app</b> (or <b>Add to Home screen</b>), then <b>Install</b>.</li><li>Open <b>HSE Audit</b> from your home screen or app drawer.</li></ol>`;
  const desktop = `<p>On a computer, use Chrome or Edge: click the install icon at the right end of the address bar, or menu → <b>Install HSE Audit</b>.</p>`;
  await dialog({ title: "Install the HSE Audit app", body: `<p class="muted">The app uses the same login and the same live data as the website, and opens the camera directly for photos.</p>${isIOS() ? ios : isAndroid() ? android : android.replace("Chrome</b>.", "Chrome</b> on the phone.") + desktop}` });
}

export function registerServiceWorker(onUpdate) {
  if (!("serviceWorker" in navigator) || location.protocol === "file:" || window.claude) return;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register("sw.js").catch(() => { /* the site still works without it */ });
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (hadController && onUpdate) onUpdate(); });
}

export function watchConnection(onChange) {
  const fire = () => onChange(navigator.onLine);
  window.addEventListener("online", fire); window.addEventListener("offline", fire);
  fire();
}
