// Phones show table rows as cards (see "phone cards" in css/app.css).
// Each cell gets its column name, so the card can show a small label above the value.
function labelTables() {
  document.querySelectorAll("table.tbl:not(.items-tbl)").forEach(t => {
    const heads = [...t.querySelectorAll("thead th")].map(th => th.textContent.trim());
    if (!heads.length) return;
    t.querySelectorAll("tbody tr").forEach(tr => {
      let i = 0;
      for (const td of tr.children) {
        const span = +td.getAttribute("colspan") || 1;
        if (span === 1 && heads[i] && !td.hasAttribute("data-l")) td.setAttribute("data-l", heads[i]);
        i += span;
      }
    });
  });
}
let queued = false;
new MutationObserver(() => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; labelTables(); }); })
  .observe(document.body, { childList: true, subtree: true });
