"""Forms: the dashboard, creating, editing, publishing, sharing with teammates, duplicating, deleting.

Who may do what:
  owner         everything
  collaborator  (their email is in collaborators) edit, publish, see results; not delete, not change the team
  anyone        demo forms are read-only examples: see them and their results, copy them into an account
"""
import datetime as dt

import anvil.server
from anvil.tables import app_tables
import anvil.tables as tables
import anvil.tables.query as q

from . import common as C
from . import DemoData
from . import Logic as L

STATUSES = ("draft", "live", "closed", "suspended")


def access(form, user):
    """'owner' | 'editor' | 'viewer' (demo examples) | None."""
    if form is None:
        return None
    if user is not None and form["owner"] == user:
        return "owner"
    if user is not None and (user["email"] or "").lower() in [e.lower() for e in (form["collaborators"] or [])]:
        return "editor"
    if form["is_demo"]:
        return "viewer"
    return None


def get_form(form_id, need="editor"):
    """(form, role) for the caller, or raises PermissionDenied. need: 'viewer' | 'editor' | 'owner'."""
    me = C.require_user()
    f = C.row_by_id(app_tables.forms, form_id)
    role = access(f, me)
    rank = {"viewer": 1, "editor": 2, "owner": 3}
    if role is None or rank[role] < rank[need]:
        raise anvil.server.PermissionDenied("You don't have access to that form.")
    return f, role


def new_slug():
    while True:
        s = L.uid(7)
        if app_tables.forms.get(slug=s) is None:
            return s


def is_open(f):
    """(open?, why closed)"""
    if f["status"] == "suspended":
        return False, "suspended"
    if f["status"] != "live":
        return False, f["status"]
    s = f["settings"] or {}
    if s.get("close_at") and dt.date.today().isoformat() > s["close_at"]:
        return False, "date"
    if s.get("limit") and (f["responses_n"] or 0) >= s["limit"]:
        return False, "limit"
    return True, ""


def summary(f, me=None):
    views, starts, n = f["views"] or 0, f["starts"] or 0, f["responses_n"] or 0
    return {"id": f.get_id(), "title": f["title"] or "Untitled form", "slug": f["slug"], "status": f["status"],
            "open": is_open(f)[0], "responses": n, "views": views, "starts": starts,
            "completion": round(100.0 * n / starts) if starts else None,
            "updated": C.iso(f["updated"]), "last_response": C.iso(f["last_response"]),
            "questions": len([b for b in (f["blocks"] or []) if b["type"] in L.INPUTS and b["type"] not in ("hidden", "calc")]),
            "accent": (f["settings"] or {}).get("accent", "#0a0a0a"), "layout": (f["settings"] or {}).get("layout", "classic"),
            "quiz": bool((f["settings"] or {}).get("quiz")), "demo": bool(f["is_demo"]),
            "role": access(f, me) if me is not None else None, "owner": C.name_of(f["owner"]),
            "spark": spark(f)}


def spark(f, days=14):
    """Responses per day for the last two weeks (oldest first)."""
    since = C.now() - dt.timedelta(days=days)
    counts = [0] * days
    today = C.now().date()
    for r in app_tables.responses.search(form=f, status="complete", submitted=q.greater_than(since)):
        i = days - 1 - (today - r["submitted"].date()).days
        if 0 <= i < days:
            counts[i] += 1
    return counts


@anvil.server.callable(require_user=True)
def my_forms():
    DemoData.ensure_loaded()
    me = C.require_user()
    mine = app_tables.forms.search(tables.order_by("updated", ascending=False), owner=me)
    email = (me["email"] or "").lower()
    shared = [f for f in app_tables.forms.search(tables.order_by("updated", ascending=False), is_demo=False)
              if f["owner"] != me and email in [e.lower() for e in (f["collaborators"] or [])]]
    demos = app_tables.forms.search(tables.order_by("updated", ascending=False), is_demo=True)
    return {"mine": [summary(f, me) for f in mine], "shared": [summary(f, me) for f in shared],
            "examples": [summary(f, me) for f in demos][:6],
            "totals": {"forms": len(mine), "responses": sum(f["responses_n"] or 0 for f in mine)}}


@anvil.server.callable(require_user=True)
def create_form(title, blocks=None, settings=None):
    me = C.require_user()
    if C.rate_limited("create_form", 30, 3600):
        return C.fail("That's a lot of new forms in one hour. Please try again later.")
    title = C.text(title, 160) or "Untitled form"
    cleaned = L.clean_blocks(blocks or [])
    st = L.clean_settings(settings or {})
    f = app_tables.forms.add_row(owner=me, title=title, slug=new_slug(), blocks=cleaned, settings=st, status="draft",
                                 rev=1, collaborators=[], created=C.now(), updated=C.now(), views=0, starts=0,
                                 responses_n=0, reports_n=0, webhook_log=[], is_demo=False)
    return C.ok(id=f.get_id(), slug=f["slug"])


def editor_view(f, role):
    return {"id": f.get_id(), "title": f["title"], "slug": f["slug"], "status": f["status"], "rev": f["rev"] or 1,
            "blocks": f["blocks"] or [], "settings": f["settings"] or L.clean_settings({}), "role": role,
            "open": is_open(f)[0], "closed_reason": is_open(f)[1], "responses": f["responses_n"] or 0,
            "collaborators": f["collaborators"] or [] if role == "owner" else [],
            "owner": C.name_of(f["owner"]), "webhook_log": (f["webhook_log"] or [])[-10:] if role != "viewer" else [],
            "published": C.iso(f["published"]), "updated": C.iso(f["updated"]), "demo": bool(f["is_demo"])}


@anvil.server.callable(require_user=True)
def get_form_edit(form_id):
    f, role = get_form(form_id, "viewer")
    return editor_view(f, role)


@anvil.server.callable(require_user=True)
def save_form(form_id, title, blocks, settings, rev=None):
    f, role = get_form(form_id, "editor")
    if f["status"] == "suspended":
        return C.fail("This form was paused after reports. Contact us if you think that's a mistake.")
    cleaned = L.clean_blocks(blocks)
    st = L.clean_settings(settings)
    title = C.text(title, 160) or "Untitled form"
    if f["status"] == "live":
        problems = L.safety_problems(title, cleaned, st)
        if problems:
            return C.fail("Live forms can't ask for %s. Remove it, or unpublish first." % problems[0]["what"])
    f.update(title=title, blocks=cleaned, settings=st, rev=(f["rev"] or 1) + 1, updated=C.now())
    return C.ok(rev=f["rev"], blocks=cleaned, settings=st, updated=C.iso(f["updated"]))


@anvil.server.callable(require_user=True)
def set_status(form_id, status):
    f, role = get_form(form_id, "editor")
    if status not in ("draft", "live", "closed"):
        return C.fail("Unknown status.")
    if f["status"] == "suspended":
        return C.fail("This form was paused after reports and is being reviewed.")
    if status == "live":
        problems = L.safety_problems(f["title"], f["blocks"] or [], f["settings"] or {})
        if problems:
            return C.fail("Fillfox forms can't ask for %s (found in %s). That keeps everyone safe from phishing."
                          % (problems[0]["what"], problems[0]["where"]))
        if not [b for b in (f["blocks"] or []) if b["type"] in L.INPUTS]:
            return C.fail("Add at least one question before publishing.")
        me = C.require_user()
        live_today = len([x for x in app_tables.forms.search(owner=me, status="live")
                          if x["published"] and (C.now() - x["published"]).total_seconds() < 86400])
        young = me["signed_up"] is None or (C.now() - me["signed_up"]).days < 2
        if young and live_today >= 5:
            return C.fail("New accounts can publish 5 forms a day. Try again tomorrow.")
        if not f["published"] or f["status"] != "live":
            f["published"] = C.now()
    f.update(status=status, updated=C.now())
    return C.ok(status=status, open=is_open(f)[0])


@anvil.server.callable(require_user=True)
def check_safety(title, blocks, settings):
    C.require_user()
    return {"problems": L.safety_problems(C.text(title, 160), L.clean_blocks(blocks), L.clean_settings(settings))}


@anvil.server.callable(require_user=True)
def duplicate_form(form_id):
    f, role = get_form(form_id, "viewer")
    me = C.require_user()
    if C.rate_limited("create_form", 30, 3600):
        return C.fail("That's a lot of new forms in one hour. Please try again later.")
    st = dict(f["settings"] or {})
    st["webhook"], st["webhook_secret"] = "", ""
    title = (f["title"] or "Untitled form") + (" (copy)" if role != "viewer" else "")
    n = app_tables.forms.add_row(owner=me, title=title, slug=new_slug(), blocks=f["blocks"] or [], settings=st,
                                 status="draft", rev=1, collaborators=[], created=C.now(), updated=C.now(), views=0,
                                 starts=0, responses_n=0, reports_n=0, webhook_log=[], is_demo=False)
    return C.ok(id=n.get_id())


@anvil.server.callable(require_user=True)
def delete_form(form_id):
    f, role = get_form(form_id, "owner")
    for t in (app_tables.files, app_tables.responses, app_tables.reports):
        for r in t.search(form=f):
            r.delete()
    f.delete()
    return C.ok()


@anvil.server.callable(require_user=True)
def set_collaborators(form_id, emails):
    f, role = get_form(form_id, "owner")
    clean = []
    for e in (emails if isinstance(emails, list) else [])[:20]:
        e = C.text(e, 120).lower()
        if L.EMAIL_RE.match(e) and e not in clean and e != (f["owner"]["email"] or "").lower():
            clean.append(e)
    f["collaborators"] = clean
    return C.ok(collaborators=clean)


@anvil.server.callable(require_user=True)
def test_webhook(form_id):
    f, role = get_form(form_id, "editor")
    from . import Fill
    s = f["settings"] or {}
    if not s.get("webhook"):
        return C.fail("Add a webhook address (https://...) first, and save.")
    sample = {}
    for b in f["blocks"] or []:
        if b["type"] in L.INPUTS:
            sample[b["key"]] = "Example answer"
    result = Fill.send_webhook(f, {"event": "test", "form": {"id": f.get_id(), "title": f["title"]}, "answers": sample})
    return C.ok(result=result, log=(f["webhook_log"] or [])[-10:])
