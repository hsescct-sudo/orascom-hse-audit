// Main page: the turning prism (one face per audit type) and who is signed in.

// ---------- prism ----------
const prism = document.getElementById("prism");
const stage = document.getElementById("stage");
const faces = [...prism.querySelectorAll(".face")];
const picks = [...document.querySelectorAll(".pick")];
const still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let i = 0, hold = false, over = false;

function draw() {
  const cur = ((i % 3) + 3) % 3;
  prism.style.transform = `rotateX(-12deg) rotateY(${-i * 120}deg)`;
  faces.forEach((f, k) => {
    let rel = ((k - i) * 120) % 360; if (rel > 180) rel -= 360; if (rel < -180) rel += 360;
    f.querySelector(".shade").style.opacity = (0.55 * (1 - Math.cos(rel * Math.PI / 180)) / 2).toFixed(3);
    // only the face in front can be clicked or reached with the keyboard
    const front = k === cur;
    f.setAttribute("aria-hidden", front ? "false" : "true");
    f.tabIndex = front ? 0 : -1;
    f.style.pointerEvents = front ? "" : "none";
  });
  picks.forEach((p, k) => p.setAttribute("aria-pressed", String(k === cur)));
}
// turn the shortest way to face k
function turnTo(k) {
  let best = i, d = 99;
  for (let j = i - 2; j <= i + 2; j++) if ((((j % 3) + 3) % 3) === k && Math.abs(j - i) < d) { best = j; d = Math.abs(j - i); }
  i = best; draw();
}
picks.forEach(p => p.addEventListener("click", () => { hold = true; turnTo(+p.dataset.k); }));
stage.addEventListener("pointerenter", () => { over = true; });
stage.addEventListener("pointerleave", () => { over = false; });
stage.addEventListener("focusin", () => { over = true; });
stage.addEventListener("focusout", () => { over = false; });
if (!still) setInterval(() => { if (!hold && !over && !document.hidden) { i++; draw(); } }, 3800);
draw();

// ---------- who is signed in ----------
// The session is kept on this device under "hse-audit-auth" by the audit system.
// Only the e-mail is read here, to show who is signed in. Nothing is sent anywhere.
try {
  const raw = localStorage.getItem("hse-audit-auth") || localStorage.getItem("oc-hse-audit-auth");
  const s = raw ? JSON.parse(raw) : null;
  const email = s && s.user && s.user.email;
  if (email && s.refresh_token && !/@projects\.hse-audit\.internal$/i.test(email)) {
    const name = email.split("@")[0].split(/[._-]+/).filter(Boolean);
    document.getElementById("me-i").textContent = name.slice(0, 2).map(x => x[0].toUpperCase()).join("") || "?";
    document.getElementById("me-t").textContent = email;
    document.getElementById("me").hidden = false;
  }
} catch (e) { /* nothing saved, or private mode */ }
