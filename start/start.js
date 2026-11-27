// Settings tile: choose which settings to open.
const dlg = document.getElementById("dlg");
document.getElementById("settings").addEventListener("click", () => { if (dlg.showModal) dlg.showModal(); else location.href = "../audit/#/settings"; });
document.getElementById("dlg-x").addEventListener("click", () => dlg.close());
dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });
