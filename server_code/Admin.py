"""Admin page callables: overview, users (make admin, disable), demo data. Admins only.
Feedback admin calls live in Feedback.py."""
import anvil.server
from anvil.tables import app_tables
import anvil.tables as tables

from . import common as C
from . import DemoData, Feedback


@anvil.server.callable(require_user=True)
def admin_overview():
    C.require_admin()
    return {"users": len([u for u in app_tables.users.search() if not u["is_demo"]]),
            "admins": len(app_tables.users.search(is_admin=True)),
            "feedback_new": Feedback.new_count(),
            "forms": len([f for f in app_tables.forms.search() if not f["is_demo"]]),
            "live": len([f for f in app_tables.forms.search(status="live") if not f["is_demo"]]),
            "responses": len([r for r in app_tables.responses.search(status="complete") if not r["is_demo"]]),
            "reports_open": len(app_tables.reports.search(status="open")),
            "suspended": len(app_tables.forms.search(status="suspended")),
            "demo": {"state": DemoData.state(), "counts": DemoData.counts()}}


def _user(u):
    return {"id": u.get_id(), "email": u["email"], "name": C.name_of(u), "is_admin": C.is_admin(u),
            "enabled": u["enabled"] is not False, "joined": C.iso(u["signed_up"]), "last_seen": C.iso(u["last_seen"])}


@anvil.server.callable(require_user=True)
def list_users(query=None):
    C.require_admin()
    query = C.text(query, 80).lower()
    rows = [u for u in app_tables.users.search(tables.order_by("signed_up", ascending=False)) if not u["is_demo"]]
    if query:
        rows = [u for u in rows if query in (u["email"] or "").lower() or query in (u["display_name"] or "").lower()]
    return {"users": [_user(u) for u in rows[:200]], "total": len(rows)}


@anvil.server.callable(require_user=True)
def set_admin(user_id, flag):
    me = C.require_admin()
    u = C.row_by_id(app_tables.users, user_id)
    if u is None:
        return C.fail("That account no longer exists.")
    if u == me and not flag:
        return C.fail("You can't remove your own admin rights.")
    u["is_admin"] = bool(flag)
    return C.ok(user=_user(u))


@anvil.server.callable(require_user=True)
def set_enabled(user_id, flag):
    me = C.require_admin()
    u = C.row_by_id(app_tables.users, user_id)
    if u is None:
        return C.fail("That account no longer exists.")
    if u == me:
        return C.fail("You can't disable your own account.")
    u["enabled"] = bool(flag)
    return C.ok(user=_user(u))


@anvil.server.callable(require_user=True)
def demo_load():
    C.require_admin()
    DemoData.load()
    return C.ok(demo={"state": DemoData.state(), "counts": DemoData.counts()})


@anvil.server.callable(require_user=True)
def demo_remove():
    C.require_admin()
    DemoData.remove()
    return C.ok(demo={"state": DemoData.state(), "counts": DemoData.counts()})


# ------------------------------------------------------------------------------------------- moderation
def _admin_form(f):
    return {"id": f.get_id(), "title": f["title"], "slug": f["slug"], "status": f["status"], "owner": C.name_of(f["owner"]),
            "owner_email": f["owner"]["email"] if f["owner"] is not None else "", "responses": f["responses_n"] or 0,
            "reports": len(app_tables.reports.search(form=f, status="open")), "updated": C.iso(f["updated"]),
            "demo": bool(f["is_demo"])}


@anvil.server.callable(require_user=True)
def admin_reports(status="open"):
    C.require_admin()
    rows = app_tables.reports.search(tables.order_by("created", ascending=False))
    if status in ("open", "done"):
        rows = [r for r in rows if r["status"] == status]
    return {"reports": [{"id": r.get_id(), "reason": r["reason"], "details": r["details"] or "", "email": r["email"] or "",
                         "created": C.iso(r["created"]), "status": r["status"],
                         "form": _admin_form(r["form"]) if r["form"] is not None else None} for r in rows[:300]]}


@anvil.server.callable(require_user=True)
def admin_forms(query=None):
    C.require_admin()
    query = C.text(query, 80).lower()
    rows = list(app_tables.forms.search(tables.order_by("updated", ascending=False)))
    if query:
        rows = [f for f in rows if query in (f["title"] or "").lower() or query == f["slug"] or
                (f["owner"] is not None and query in (f["owner"]["email"] or "").lower())]
    return {"forms": [_admin_form(f) for f in rows[:300]], "total": len(rows)}


@anvil.server.callable(require_user=True)
def admin_moderate(form_id, action):
    """action: suspend | restore (live again, its reports closed) | dismiss (close its reports, keep the status)"""
    C.require_admin()
    f = C.row_by_id(app_tables.forms, form_id)
    if f is None:
        return C.fail("That form no longer exists.")
    if action == "suspend":
        f["status"] = "suspended"
    elif action == "restore":
        f["status"] = "live"
        for r in app_tables.reports.search(form=f, status="open"):
            r["status"] = "done"
        f["reports_n"] = 0
    elif action == "dismiss":
        for r in app_tables.reports.search(form=f, status="open"):
            r["status"] = "done"
        f["reports_n"] = 0
    else:
        return C.fail("Unknown action.")
    return C.ok(form=_admin_form(f))
