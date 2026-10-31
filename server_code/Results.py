"""Results for form owners and teammates (and anyone, read-only, for the demo examples):
every answer, unfinished answers, the drop-off funnel, deleting, and erasing one person's answers.
Charts and CSV are built in the browser from what get_results returns."""
import datetime as dt

import anvil.server
from anvil.tables import app_tables
import anvil.tables as tables

from . import common as C
from . import Logic as L
from . import Forms
from . import Payments

MAX_ROWS = 5000


def apply_retention(f):
    days = (f["settings"] or {}).get("retention_days")
    if not days:
        return 0
    cut = C.now() - dt.timedelta(days=days)
    gone = 0
    for r in app_tables.responses.search(form=f):
        when = r["submitted"] or r["started"]
        if when is not None and when < cut:
            _delete_response(r)
            gone += 1
    if gone:
        f["responses_n"] = len(app_tables.responses.search(form=f, status="complete"))
    return gone


def _delete_response(r):
    for fl in app_tables.files.search(form=r["form"], token=r["token"]):
        fl.delete()
    if r["token"]:
        Payments.delete_for(r["form"], r["token"])
    r.delete()


def _resp(r, paid=None):
    return {"id": r.get_id(), "status": r["status"], "answers": r["answers"] or {}, "score": r["score"],
            "paid": (paid or {}).get(r["token"]),
            "reached": r["reached"] or 0, "started": C.iso(r["started"]), "submitted": C.iso(r["submitted"]),
            "seconds": (r["meta"] or {}).get("seconds"), "device": (r["meta"] or {}).get("device"),
            "demo": bool(r["is_demo"])}


@anvil.server.callable(require_user=True)
def get_results(form_id):
    f, role = Forms.get_form(form_id, "viewer")
    if role != "viewer":
        apply_retention(f)
    rows = app_tables.responses.search(tables.order_by("started", ascending=False), form=f)
    complete = [r for r in rows if r["status"] == "complete"]
    partial = [r for r in rows if r["status"] == "partial"]
    blocks = f["blocks"] or []
    inputs = [b for b in blocks if b["type"] in L.INPUTS]
    # funnel: how many visits reached each question (in form order)
    steps = []
    reached = [r["reached"] or 0 for r in rows]
    for i, b in enumerate(inputs):
        if b["type"] in ("hidden", "calc"):
            continue
        steps.append({"id": b["id"], "label": b["label"] or b["key"], "reached": len([x for x in reached if x >= i])})
    s = f["settings"] or {}
    paid = Payments.for_form(f)
    return {"form": Forms.editor_view(f, role), "role": role,
            "responses": [_resp(r, paid) for r in complete[:MAX_ROWS]],
            "partial": [_resp(r, paid) for r in partial[:MAX_ROWS]] if s.get("save_partial") or f["is_demo"] else [],
            "unmatched_payments": Payments.unmatched(f, {r["token"] for r in rows}) if role != "viewer" else [],
            "stripe_url": anvil.server.get_api_origin() + "/stripe?form=" + f["slug"],
            "partial_count": len(partial),
            "funnel": {"views": f["views"] or 0, "starts": f["starts"] or 0, "complete": len(complete), "steps": steps},
            "file_base": anvil.server.get_api_origin() + "/file",
            "quiz_max": L.score(blocks, {})[1] if s.get("quiz") else None}


@anvil.server.callable(require_user=True)
def delete_response(form_id, response_id):
    f, role = Forms.get_form(form_id, "editor")
    r = C.row_by_id(app_tables.responses, response_id)
    if r is None or r["form"] != f:
        return C.fail("That answer is already gone.")
    _delete_response(r)
    f["responses_n"] = len(app_tables.responses.search(form=f, status="complete"))
    return C.ok()


@anvil.server.callable(require_user=True)
def delete_all_responses(form_id, which="all"):
    f, role = Forms.get_form(form_id, "owner")
    n = 0
    for r in app_tables.responses.search(form=f):
        if which == "all" or r["status"] == which:
            _delete_response(r)
            n += 1
    f["responses_n"] = len(app_tables.responses.search(form=f, status="complete"))
    if which == "all":
        f.update(views=0, starts=0)
        Payments.delete_for(f)
    return C.ok(deleted=n)


@anvil.server.callable(require_user=True)
def erase_respondent(form_id, text):
    """Privacy requests: delete every answer that contains this email address (or other exact text)."""
    f, role = Forms.get_form(form_id, "editor")
    text = C.text(text, 200).lower()
    if len(text) < 3:
        return C.fail("Type the email address (or other exact answer) to look for.")
    n = 0
    for r in app_tables.responses.search(form=f):
        vals = [str(v).lower() for v in (r["answers"] or {}).values() if isinstance(v, (str, int, float))]
        if text in vals:
            _delete_response(r)
            n += 1
    f["responses_n"] = len(app_tables.responses.search(form=f, status="complete"))
    return C.ok(deleted=n)
