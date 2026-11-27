// Main page: settings chooser, and who is signed in (one sign-in is shared by all three systems).
const dlg = document.getElementById("dlg");
document.getElementById("settings").addEventListener("click", () => { if (dlg.showModal) dlg.showModal(); else location.href = "../audit/#/settings"; });
document.getElementById("dlg-x").addEventListener("click", () => dlg.close());
dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });

// The session is kept on this device under "hse-audit-auth" by Flash, HSE Audit and Lifting.
// Only the e-mail is read here, to show who is signed in. Nothing is sent anywhere.
try {
  const raw = localStorage.getItem("hse-audit-auth") || localStorage.getItem("oc-hse-audit-auth");
  const s = raw ? JSON.parse(raw) : null;
  const email = s && s.user && s.user.email;
  const live = s && s.refresh_token;
  if (email && live) {
    // Flash project logins use an internal address; show them as a project sign-in.
    document.getElementById("me-t").textContent = /@projects\.hse-audit\.internal$/i.test(email) ? "Project sign-in (Flash Audit)" : email;
    document.getElementById("me").hidden = false;
  }
} catch (e) { /* nothing saved, or private mode */ }
