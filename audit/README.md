# OC HSE Audit

Corporate HSE audit system for Orascom Construction projects. Two audit types, kept fully separate:

- **HSE Audit**: form F-HSE-078 Rev 06 (appraisal Part 1 90%, Part 2 10%).
- **Lifting Operation Assessment**: form F-HSE-0175 Rev 02 (sections A to G).

Each type has its own audits, NCR numbering, NCR register (form F-HSE-0003), good practice register and dashboard. The Flash Audit system in the folder above is a different system and is not changed by this one.

Live: https://hsescct-sudo.github.io/orascom-hse-audit/audit/

## What it does

- Annual audit plan by project and month, with lead auditor and status (done, in progress, this month, overdue).
- Audits on site **with or without internet**. Everything saves on the device as you type and is sent when there is a connection.
- Scoring with the company weights. Any rating from 0 to 100%. N/A takes the item out. One or more Serious NCRs take off 15% once. Each NCR from the last audit that is still open becomes a repeated NCR and takes off 3%.
- NCRs with photos from the camera, root causes, responsible person and deadline. Follow-up and closure with evidence.
- Reports made on the device: printable report and NCR forms (save as PDF), Excel in the form layout with live formulas, PowerPoint summary.
- Dashboard: company grade, projects by grade, weakest areas, ratings by element for every project, score by month, plan progress, NCRs by type, root causes, open NCRs by project.
- Roles: administrator, auditor, viewer.

## Scoring fixes compared with the Excel forms

1. In Excel a rating of 0% was treated like N/A, so a very bad item dropped out and could raise the score (Work at height 0% gave 100%, 10% gave 89.9%). Here 0% counts as zero. Settings has a switch for the old behaviour.
2. In Excel N/A in Part 2 still cost points; here N/A works the same in every part.
3. Serious and repeated counts come from the NCRs, not typed by hand.

## Files

| Path | What it is |
|---|---|
| `index.html`, `css/app.css` | Page and design |
| `js/app.js` | Start-up, sign-in, menus, pages |
| `js/templates.js` | The two forms as data: items, weights, lists |
| `js/scoring.js` | Score calculation |
| `js/store.js` | Storage on the device (IndexedDB) |
| `js/sync.js` | Sending and receiving changes and photos |
| `js/model.js` | Rules: previous audit, repeated NCRs, plan status |
| `js/views/*.js` | Pages |
| `js/report/export.js` | Excel and PowerPoint |
| `sw.js` | Offline support (made by `tools/build-sw.py`) |
| `vendor/`, `fonts/` | Chart, Excel, PowerPoint, database libraries and fonts, saved locally for offline use |
| `../supabase/audit-schema.sql` | Server tables. Run once in Supabase |

## Server setup (once)

1. Open `supabase/audit-schema.sql`, put the administrator e-mail in the last part.
2. Supabase, SQL Editor, paste, Run. It only adds new tables (`ha_*`) and a private photo bucket.
3. Sign in at the audit system with that e-mail. The company project list loads on the first sign-in.
4. Add auditors under Auditors and users (with e-mail), then create their sign-in in Supabase, Authentication, Users.

After changing any file, run `python3 audit/tools/build-sw.py` so phones get the new version.
