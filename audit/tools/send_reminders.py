#!/usr/bin/env python3
"""Daily e-mail reminders for the OC HSE Audit system.

Run by .github/workflows/audit-reminders.yml every morning. It asks the server for
the open items (with a secret key), builds one e-mail per person or project, and
sends them through the mail account set in the GitHub secrets.

Nothing is sent when:
  - the administrator turned reminders off in Settings, or today is not a chosen day
  - SMTP_USER / SMTP_PASSWORD are not set (then it only counts, a "dry run")

The log only shows counts: the repository is public, so no names or e-mails.
Settings come from environment variables:
  SUPABASE_URL, SUPABASE_KEY      server address and its public key
  REMINDER_KEY                    secret key (its hash is in the server)
  SMTP_USER, SMTP_PASSWORD        mail account (e.g. Gmail with an app password)
  SMTP_HOST, SMTP_PORT            default smtp.gmail.com, 465
  MAIL_FROM                       default SMTP_USER
  APP_URL                         address of the audit system (for links)
  DRY_RUN=1                       build but don't send
  FORCE=1                         test run: ignore the on/off switch and the day, and send
                                  every e-mail to the sending mailbox only (SMTP_USER)
  PRINT=1                         print the e-mails (only for a local test, never in GitHub)
"""
import datetime as dt
import json
import os
import smtplib
import ssl
import sys
import urllib.error
import urllib.request
from email.message import EmailMessage
from email.utils import formataddr, make_msgid

MOD = {"full": "HSE Audit", "lifting": "Lifting"}
SOON_DAYS = 3        # NCRs due in the next 3 days get a reminder too
SEND_LATE_DAYS = 7   # P-20 7.4: report to the project within 7 days
REVIEW_DAYS = 2      # evidence waiting for the auditor longer than this


def env(k, d=""):
    v = os.environ.get(k, "").strip()
    return v or d


def fetch():
    url = env("SUPABASE_URL").rstrip("/") + "/rest/v1/rpc/ha_reminders"
    key = env("SUPABASE_KEY")
    body = json.dumps({"p_key": env("REMINDER_KEY")}).encode()
    req = urllib.request.Request(url, data=body, method="POST", headers={
        "apikey": key, "Authorization": "Bearer " + key, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode())


def day(s):
    try:
        return dt.date.fromisoformat(str(s)[:10])
    except Exception:
        return None


def fmt(s):
    d = day(s)
    return d.strftime("%d %b %Y") if d else "-"


def emails(text):
    out = []
    for x in str(text or "").replace(";", ",").replace(" ", ",").split(","):
        x = x.strip().lower()
        if "@" in x and "." in x.split("@")[-1] and x not in out:
            out.append(x)
    return out


def build(data, app_url, test=False):
    """Returns the list of e-mails: dicts with to, cc, subject, text, kind."""
    st = (data.get("settings") or {}).get("reminders") or {}
    today = day(data["today"])
    weekday = int(data.get("weekday", 0))
    days = st.get("days") or [0, 3]
    first_day = weekday == sorted(days)[0] or test
    members = {m["id"]: m for m in data.get("members") or []}
    projects = {p["id"]: p for p in data.get("projects") or []}
    links = {(l["project_id"], l["module"]): l["token"] for l in data.get("links") or []}
    audits = {a["id"]: a for a in data.get("audits") or []}
    ncrs = data.get("ncrs") or []
    link_url = lambda pid, mod: (app_url.rstrip("/") + "/close.html#t=" + links[(pid, mod)]) if (pid, mod) in links else ""
    lead_of = lambda n: members.get((audits.get(n.get("audit_id")) or {}).get("lead_id"))
    out = []

    # 1. Projects: open NCRs past the deadline or due soon
    if st.get("projects", True):
        by_project = {}
        for n in ncrs:
            if n.get("status") != "Open":
                continue
            due = day(n.get("due_date"))
            if not due or (due - today).days > SOON_DAYS:
                continue
            by_project.setdefault(n["project_id"], []).append(n)
        for pid, items in by_project.items():
            p = projects.get(pid) or {}
            to = emails(p.get("emails"))
            for n in items:
                to += [e for e in emails(n.get("responsible_email")) if e not in to]
            if not to:
                continue
            cc = []
            if st.get("ccLead", True):
                for n in items:
                    m = lead_of(n)
                    if m and m.get("email") and m["email"] not in cc and m["email"] not in to:
                        cc.append(m["email"])
            late = [n for n in items if day(n["due_date"]) < today]
            lines = [f"Dear {p.get('name', 'project')} team,", "",
                     f"{len(items)} Corporate HSE audit NCR{'s' if len(items) != 1 else ''} need{'s' if len(items) == 1 else ''} your action"
                     + (f", {len(late)} past the deadline." if late else "."), ""]
            for mod in ("full", "lifting"):
                part = sorted([n for n in items if n["module"] == mod], key=lambda n: n.get("due_date") or "")
                if not part:
                    continue
                lines.append(f"{MOD[mod]} NCRs:")
                for n in part:
                    d = day(n["due_date"])
                    when = f"{(today - d).days} days late" if d < today else ("due today" if d == today else f"due {fmt(n['due_date'])}")
                    lines.append(f"  - {n.get('ref')} ({n.get('severity')}, {when}): {n.get('description')}")
                u = link_url(pid, mod)
                if u:
                    lines += ["", f"  Send the evidence here (no sign-in needed): {u}"]
                lines.append("")
            lines += ["If the work is done, send the evidence today. The auditor checks it and closes the NCR.", "", "Corporate HSE"]
            out.append({"kind": "project", "to": to, "cc": cc,
                        "subject": f"HSE audit NCRs: {len(late) or len(items)} {'past the deadline' if late else 'due soon'} for {p.get('name', '')}",
                        "text": "\n".join(lines)})

    # 2. Auditors: their own open work
    if st.get("auditors", True):
        work = {}
        for a in audits.values():
            if a.get("status") in ("submitted", "approved") and not a.get("sent_date"):
                d = day(a.get("date"))
                if d and (today - d).days > SEND_LATE_DAYS:
                    work.setdefault(a.get("lead_id"), {"send": [], "review": [], "plan": []})["send"].append(a)
        for n in ncrs:
            if n.get("status") == "Review":
                got = day(n.get("received_at"))
                if got and (today - got).days >= REVIEW_DAYS:
                    a = audits.get(n.get("audit_id")) or {}
                    work.setdefault(a.get("lead_id"), {"send": [], "review": [], "plan": []})["review"].append(n)
        for pl in data.get("plans") or []:
            if not pl.get("audit_id"):
                work.setdefault(pl.get("lead_id"), {"send": [], "review": [], "plan": []})["plan"].append(pl)
        for mid, w in work.items():
            m = members.get(mid)
            if not m or not m.get("email") or m.get("role") == "viewer":
                continue
            lines = [f"Hello {m.get('name', '')},", "", "Your open items in the Corporate HSE audit system:", ""]
            if w["send"]:
                lines.append(f"Reports not sent to the project after {SEND_LATE_DAYS} days (P-20 7.4):")
                lines += [f"  - {a.get('ref')}, {(projects.get(a.get('project_id')) or {}).get('name', '')}, audit date {fmt(a.get('date'))}" for a in w["send"]]
                lines.append("")
            if w["review"]:
                lines.append("Evidence sent by the project, waiting for your review:")
                lines += [f"  - {n.get('ref')}, {(projects.get(n.get('project_id')) or {}).get('name', '')}, sent {fmt(n.get('received_at'))}" for n in w["review"]]
                lines.append("")
            if w["plan"]:
                lines.append("Audits planned for this month, not started yet:")
                lines += [f"  - {MOD.get(pl.get('module'), '')}, {(projects.get(pl.get('project_id')) or {}).get('name', '')}" for pl in w["plan"]]
                lines.append("")
            lines += [f"Open the system: {app_url}", "", "This is an automatic reminder."]
            n_items = len(w["send"]) + len(w["review"]) + len(w["plan"])
            out.append({"kind": "auditor", "to": [m["email"]], "cc": [],
                        "subject": f"HSE audit: {n_items} open item{'s' if n_items != 1 else ''} for you", "text": "\n".join(lines)})

    # 3. Administrators: weekly summary
    if st.get("admins", True) and first_day:
        admins = [m for m in members.values() if m.get("role") == "admin" and m.get("email")]
        late = [n for n in ncrs if n.get("status") == "Open" and day(n.get("due_date")) and day(n["due_date"]) < today]
        review = [n for n in ncrs if n.get("status") == "Review"]
        unsent = [a for a in audits.values() if a.get("status") in ("submitted", "approved") and not a.get("sent_date")
                  and day(a.get("date")) and (today - day(a["date"])).days > SEND_LATE_DAYS]
        plans = data.get("plans") or []
        by_p = {}
        for n in late:
            by_p[n["project_id"]] = by_p.get(n["project_id"], 0) + 1
        top = sorted(by_p.items(), key=lambda x: -x[1])[:10]
        lines = ["Weekly summary of the Corporate HSE audit system.", "",
                 f"NCRs past the deadline: {len(late)}",
                 f"Evidence waiting for review: {len(review)}",
                 f"Reports not sent after {SEND_LATE_DAYS} days: {len(unsent)}",
                 f"Audits planned this month: {len(plans)}, started: {sum(1 for p in plans if p.get('audit_id'))}", ""]
        if top:
            lines.append("Projects with the most NCRs past the deadline:")
            lines += [f"  - {(projects.get(pid) or {}).get('name', pid)}: {c}" for pid, c in top]
            lines.append("")
        lines += [f"Dashboard: {app_url}", "", "This is an automatic summary."]
        for m in admins:
            out.append({"kind": "admin", "to": [m["email"]], "cc": [], "subject": f"HSE audit weekly summary, {fmt(data['today'])}", "text": "\n".join(lines)})
    return out


def main():
    for k in ("SUPABASE_URL", "SUPABASE_KEY", "REMINDER_KEY"):
        if not env(k):
            print(f"Missing {k}. Nothing done.")
            return 0
    try:
        data = fetch()
    except urllib.error.HTTPError as e:
        print(f"The server said no (HTTP {e.code}). Check REMINDER_KEY, and that supabase/audit-update-2.sql was run.")
        return 1
    except Exception as e:
        print("Could not reach the server:", type(e).__name__)
        return 1
    st = (data.get("settings") or {}).get("reminders") or {}
    force = env("FORCE") == "1"
    if not st.get("on") and not force:
        print("Reminders are off in Settings. Nothing sent.")
        return 0
    if (data.get("settings") or {}).get("demo") and not force:
        print("Presentation data is loaded. Reminders paused until it is removed.")
        return 0
    if int(data.get("weekday", 0)) not in (st.get("days") or [0, 3]) and not force:
        print("Today is not a reminder day. Nothing sent.")
        return 0
    app_url = env("APP_URL", "https://hsescct-sudo.github.io/orascom-hse-audit/audit/")
    mails = build(data, app_url, test=force)
    kinds = {k: sum(1 for m in mails if m["kind"] == k) for k in ("project", "auditor", "admin")}
    print(f"E-mails to send: projects {kinds['project']}, auditors {kinds['auditor']}, administrators {kinds['admin']}.")
    if env("PRINT") == "1":
        for m in mails:
            print("-----\nTo:", ", ".join(m["to"]), "\nCc:", ", ".join(m["cc"]), "\nSubject:", m["subject"], "\n\n" + m["text"])
    user, pw = env("SMTP_USER"), env("SMTP_PASSWORD")
    if env("DRY_RUN") == "1" or not user or not pw:
        print("Dry run: no mail account set, so nothing was sent.")
        return 0
    sender = env("MAIL_FROM", user)
    if force:  # test run: nothing reaches the auditors or projects
        mails = [{**m, "to": [user], "cc": [], "subject": "[TEST] " + m["subject"],
                  "text": f"TEST RUN. This e-mail would go to: {', '.join(m['to'])}" + (f" (copy: {', '.join(m['cc'])})" if m["cc"] else "") + "\n\n" + m["text"]} for m in mails]
        print("Test run: every e-mail goes to the sending mailbox only.")
    sent = failed = 0
    ctx = ssl.create_default_context()
    host, port = env("SMTP_HOST", "smtp.gmail.com"), int(env("SMTP_PORT", "465"))
    # 465: Gmail and most providers (SSL). 587: Outlook / Microsoft 365 (STARTTLS).
    conn = smtplib.SMTP_SSL(host, port, context=ctx, timeout=60) if port == 465 else smtplib.SMTP(host, port, timeout=60)
    with conn as s:
        if port != 465:
            s.starttls(context=ctx)
        s.login(user, pw)
        for m in mails:
            msg = EmailMessage()
            msg["From"] = formataddr(("OC Corporate HSE Audit", sender))
            msg["To"] = ", ".join(m["to"])
            if m["cc"]:
                msg["Cc"] = ", ".join(m["cc"])
            msg["Subject"] = m["subject"]
            msg["Message-ID"] = make_msgid(domain=sender.split("@")[-1])
            msg.set_content(m["text"])
            try:
                s.send_message(msg)
                sent += 1
            except Exception as e:  # keep going; one bad address must not stop the rest
                failed += 1
                print("One e-mail failed:", type(e).__name__)
    print(f"Sent {sent}, failed {failed}.")
    return 1 if failed and not sent else 0


if __name__ == "__main__":
    sys.exit(main())
