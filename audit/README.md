# OC HSE Audit

Corporate HSE audit system for Orascom Construction projects. Three audit types, kept fully separate:

- **HSE Audit**: form F-HSE-078 Rev 06 (appraisal Part 1 90%, Part 2 10%).
- **Lifting Operation Assessment**: form F-HSE-0175 Rev 02 (sections A to G).
- **HSE Flash Audit**: form F-HSE-0075 (13 topics, 109 checks; each check is Yes, No or N/A; the score is the share of Yes).

Each type has its own audits, NCR numbering, NCR register (form F-HSE-0003), good practice register and dashboard. All three follow the same steps: the auditor sends the audit for approval, an administrator or approver approves it and e-mails the project, and the project closes its NCRs from a link. The old Flash Audit app (project sign-ins) is retired; its tables in the database are not used.

Live: https://hsescct-sudo.github.io/orascom-hse-audit/audit/

## What it does

- Annual audit plan by project and month, with lead auditor and status (done, in progress, this month, overdue).
- Audits on site **with or without internet**. Everything saves on the device as you type and is sent when there is a connection.
- Scoring with the company weights. Any rating from 0 to 100%. N/A takes the item out. One or more Serious NCRs take off 15% once. Each repeated NCR takes off 3%. Settings can change: Serious once or for each one, points off or percent of the score, grade on the score as shown or on the whole number.
- NCRs with photos from the camera, root causes, responsible person and deadline. Follow-up and closure with evidence.
- Reports made on the device: printable report and NCR forms (save as PDF), Excel in the form layout with live formulas, PowerPoint summary.
- Dashboard: company grade, projects by grade, weakest areas, ratings by element for every project, score by month, plan progress, NCRs by type, root causes, open NCRs by project.
- Roles: administrator, approver, auditor, viewer. The auditor sends the audit for approval. An administrator or approver approves it, or returns it with a note, and then e-mails the report to the project. Nobody approves an audit they were on. Only the administrator adds users and changes settings. The administrator makes each person's sign-in from the app; the person sets their own password at the first sign-in.
- Project link: the project opens a link (no sign-in) to see its NCRs and send evidence with photos and a signature. The NCR then waits for the auditor's review.
- History and signatures are also kept on the server in a record that nobody can change or delete.
- E-mail: after approval, "E-mail the report" (administrator or approver) opens Outlook with the project e-mails, score, NCR counts and the project link, and records the sending. Reminders by e-mail every chosen day (see below).

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
| `close.html`, `js/close.js` | Project link page: NCR evidence without sign-in |
| `tools/send_reminders.py` | Daily e-mail reminders (run by GitHub, `.github/workflows/audit-reminders.yml`) |
| `sw.js` | Offline support (made by `tools/build-sw.py`) |
| `vendor/`, `fonts/` | Chart, Excel, PowerPoint, database libraries and fonts, saved locally for offline use |
| `../supabase/audit-schema.sql` | Server tables. Run once in Supabase |
| `../supabase/audit-update-2.sql` | Update 2 (sign-ins, project links, kept history, reminders). Run once |
| `../supabase/audit-update-3.sql` | Update 3 (server checks on every save). Run once |
| `../supabase/audit-update-4.sql` | Update 4 (approver role, approval rules). Run once |

## Server setup (once)

1. Open `supabase/audit-schema.sql`, put the administrator e-mail in the last part.
2. Supabase, SQL Editor, paste, Run. It only adds new tables (`ha_*`) and a private photo bucket.
3. Sign in at the audit system with that e-mail. The company project list loads on the first sign-in.
4. Run `supabase/audit-update-2.sql`, then `audit-update-3.sql`, then `audit-update-4.sql` the same way (once each).
5. Add auditors under Auditors and users with their work e-mail. The app offers **Make sign-in** with a temporary password. Send it to them privately. At the first sign-in they set their own password. Someone who already has a Flash Audit sign-in uses the same password.

## E-mail reminders (once)

The job runs every morning on GitHub and sends nothing until both are done:

1. In the app, Settings, E-mail reminders: tick "Send reminders by e-mail", pick the days, Save.
2. In GitHub, the repository, Settings, Secrets and variables, Actions, add:
   - `SMTP_USER`: the sending mailbox, for example a Gmail account made for this.
   - `SMTP_PASSWORD`: for Gmail, an App password (Google account, Security, 2-Step Verification on, App passwords). Not the normal password.
   - Optional `SMTP_HOST`, `SMTP_PORT` (default `smtp.gmail.com`, `465`) and `MAIL_FROM`.
   - `REMINDER_KEY`: in the app, Settings, E-mail reminders, **Make the GitHub key**, copy it.
3. Test: GitHub, Actions, Audit reminders, Run workflow, tick "Test run". The log shows only counts.

After changing any file, run `python3 audit/tools/build-sw.py` so phones get the new version.
