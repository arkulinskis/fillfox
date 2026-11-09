"""Server tests against the strict mock of Anvil (tools/testing/mock).

    python -I tools/testing/test_server.py          -> prints ALL OK, or the first failure

call(name, ...) runs a server function the way the browser does: by name, with require_user enforced,
and the reply must be JSON (a datetime or a row in a reply fails here, like it would break the page).
Add tests for every new server function: the happy path, bad input, and someone who isn't allowed.
"""
import datetime as dt
import importlib
import json
import os
import pathlib
import shutil
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
PROJECT = HERE.parents[1]
_tmp = pathlib.Path(tempfile.mkdtemp())
shutil.copytree(PROJECT / "server_code", _tmp / "app")
(_tmp / "app" / "__init__.py").write_text("")
os.environ["ANVIL_APP_YAML"] = str(PROJECT / "anvil.yaml")  # the mock's tables follow the app's own schema
sys.path[:0] = [str(HERE / "mock"), str(_tmp)]
import anvil.server  # noqa: E402
import anvil.users  # noqa: E402
import anvil  # noqa: E402
import anvil.email  # noqa: E402
import anvil.http  # noqa: E402
from anvil.tables import app_tables as T  # noqa: E402

M = {p.stem: importlib.import_module("app." + p.stem) for p in sorted((PROJECT / "server_code").glob("*.py"))}
now = dt.datetime.now(dt.timezone.utc)


def call(name, *args):
    r = anvil.server.call(name, *args)
    json.dumps(r)  # strict: must be JSON-able
    return r


def as_user(row):
    anvil.users.CURRENT[0] = row
    anvil.server.session.use(row.get_id() if row is not None else None)


def denied(name, *args):
    try:
        call(name, *args)
    except anvil.server.PermissionDenied:
        return True
    return False


def ok(r, msg=""):
    assert isinstance(r, dict) and r.get("ok"), (msg, r)
    return r


def bad(r, msg=""):
    assert isinstance(r, dict) and r.get("ok") is False and r.get("error"), (msg, r)
    return r


def person(email, name=None, **kw):
    return T.users.add_row(email=email, enabled=True, signed_up=now, display_name=name, **kw)


# ---------------------------------------------------------------------------------- accounts
admin = person("arkulinskis@gmail.com", "The Admin")
ana = person("ana@example.com", "Ana")
bob = person("bob@example.com")

as_user(None)
assert call("get_me") is None
assert denied("update_profile", "X")
as_user(admin)
assert call("get_me")["is_admin"] is True, "ADMIN_EMAILS become admins on first sign-in"
as_user(ana)
me = call("get_me")
assert me["name"] == "Ana" and me["is_admin"] is False
assert ana["last_seen"] is not None
as_user(bob)
assert call("get_me")["name"] == "Bob", "a name comes from the email when none is set"
bad(call("update_profile", " x "))
assert ok(call("update_profile", "  Bob   Stone "))["me"]["name"] == "Bob Stone"

# ---------------------------------------------------------------------------------- feedback
as_user(None)
bad(call("submit_feedback", "bug", "hi"))
ok(call("submit_feedback", "bug", "The button is broken", "guest@example.com", {"page": "#home", "evil": "x" * 9999}))
fb = T.feedback.search()[0]
assert fb["name"] == "Guest" and fb["email"] == "guest@example.com" and "evil" not in fb["context"] and fb["status"] == "new"
for i in range(4):
    ok(call("submit_feedback", "idea", "Idea number %d" % i))
bad(call("submit_feedback", "idea", "One too many this hour"), "rate limit")
as_user(ana)
ok(call("submit_feedback", "nonsense-kind", "Signed-in feedback"))
assert T.feedback.get(message="Signed-in feedback")["kind"] == "other"
assert denied("list_feedback")
as_user(admin)
lst = call("list_feedback")
assert lst["counts"]["new"] == 6 and len(lst["items"]) == 6
fid = lst["items"][0]["id"]
ok(call("set_feedback_status", fid, "done", "Fixed it"))
assert call("list_feedback", "done")["items"][0]["note"] == "Fixed it"
bad(call("set_feedback_status", fid, "weird"))
bad(call("set_feedback_status", "nope", "done"))
ok(call("delete_feedback", fid))
assert len(call("list_feedback")["items"]) == 5

# ---------------------------------------------------------------------------------- admin
as_user(ana)
for fn, args in [("admin_overview", ()), ("list_users", ()), ("set_admin", (bob.get_id(), True)), ("demo_load", ()), ("demo_remove", ())]:
    assert denied(fn, *args), fn
as_user(admin)
ov = call("admin_overview")
assert ov["users"] == 3 and ov["admins"] == 1 and ov["feedback_new"] == 5 and ov["forms"] == 0
assert len(call("list_users")["users"]) == 3 and len(call("list_users", "bob")["users"]) == 1
ok(call("set_admin", bob.get_id(), True))
assert bob["is_admin"] is True
bad(call("set_admin", admin.get_id(), False), "can't remove your own admin")
ok(call("set_enabled", bob.get_id(), False))
assert bob["enabled"] is False
bad(call("set_enabled", admin.get_id(), False))
ok(call("set_enabled", bob.get_id(), True))
ok(call("set_admin", bob.get_id(), False))
assert bob["is_admin"] is False

# ---------------------------------------------------------------------------------- the form model (Logic.py)
L = M["Logic"]
assert L.formula("{a} * 2 + (3 - 1) / 2", lambda k: 5) == 11
assert L.formula("round(10 / 3, 2)", lambda k: 0) == 3.33
assert L.formula("1 / 0", lambda k: 0) == 0 and L.formula("2 +* garbage", lambda k: 0) == 0
assert L.formula("max({a}, 7) - min(1, 2)", lambda k: 3) == 6
blk = L.clean_blocks([{"type": "yesno", "id": "q1aa", "label": "Coming?"},
                      {"type": "long", "id": "q2bb", "label": "Why", "logic": {"match": "all", "rules": [{"q": "q1aa", "op": "eq", "v": "yes"}]}},
                      {"type": "page", "id": "p1cc", "label": "More", "logic": {"rules": [{"q": "q1aa", "op": "eq", "v": "no"}]}},
                      {"type": "short", "id": "q3dd", "label": "Why not"},
                      {"type": "evil", "label": "dropped"}, {"type": "short", "label": "<b>x</b>", "logic": {"rules": [{"q": "nope", "op": "eq"}]}}])
assert len(blk) == 5 and "logic" not in blk[4], "unknown types dropped, rules to missing questions removed"
assert L.visible_ids(blk, {"q1aa": "yes"}) >= {"q1aa", "q2bb"} and "q3dd" not in L.visible_ids(blk, {"q1aa": "yes"})
assert "q3dd" in L.visible_ids(blk, {"q1aa": "no"}) and "q2bb" not in L.visible_ids(blk, {"q1aa": "no"})
clean, errs = L.check_answers(blk, {"q1aa": "no", "q2bb": "should be dropped", "q3dd": "busy"})
assert "q2bb" not in clean and clean["q3dd"] == "busy" and not errs, "answers to hidden questions are dropped"
short = L.clean_blocks([{"type": "yesno", "id": "q1", "label": "A?"}, {"type": "short", "id": "q2", "label": "B", "logic": {"rules": [{"q": "q1", "op": "eq", "v": "yes"}]}},
                        {"type": "choice", "id": "c1", "label": "Kind", "options": [{"id": "oa", "label": "X"}]},
                        {"type": "payment", "id": "p1", "label": "Pay", "props": {"by": "c1", "links": {"oa": "https://buy.stripe.com/x"}}}])
assert short[1]["logic"]["rules"][0]["q"] == short[0]["id"] and short[3]["props"]["by"] == short[2]["id"], "references follow ids the cleaner renames"
assert L.safety_problems("Login", [{"type": "short", "label": "Your Office365 password", "id": "x"}], {}), "password questions are caught"
assert not L.safety_problems("Café survey", blk, {})

# ---------------------------------------------------------------------------------- forms: create, edit, publish
anvil.email.OUTBOX[:] = []
as_user(None)
assert denied("my_forms") and denied("create_form", "x")
as_user(ana)
home = call("my_forms")
assert M["DemoData"].state() == "loaded" and len(home["examples"]) == 5 and home["mine"] == [], "demo loads on first visit"
fid = ok(call("create_form", "  Sign-up  ", [{"type": "short", "label": "Name", "required": True}], {"accent": "javascript:alert(1)"}))["id"]
ed = call("get_form_edit", fid)
assert ed["title"] == "Sign-up" and ed["status"] == "draft" and ed["settings"]["accent"] == "#0a0a0a" and ed["blocks"][0]["key"] == "name"
as_user(bob)
assert denied("get_form_edit", fid) and denied("save_form", fid, "x", [], {}) and denied("get_results", fid)
as_user(ana)
blocks = [
    {"type": "short", "id": "qname", "label": "Your name", "required": True, "key": "name"},
    {"type": "email", "id": "qmail", "label": "Email", "required": True},
    {"type": "choice", "id": "qcap", "label": "Capital of Quebec?", "required": True,
     "options": [{"id": "oa", "label": "Montreal"}, {"id": "ob", "label": "Quebec City"}], "correct": ["ob"]},
    {"type": "number", "id": "qppl", "label": "People", "key": "people", "props": {"min": 1, "max": 10}},
    {"type": "calc", "id": "qtot", "label": "Total", "key": "total", "props": {"formula": "{people} * 20 + 5", "show": True, "decimals": 0}},
    {"type": "file", "id": "qfile", "label": "CV", "props": {"max_files": 1}},
    {"type": "yesno", "id": "qmore", "label": "Anything else?"},
    {"type": "long", "id": "qelse", "label": "Tell us", "required": True, "logic": {"match": "all", "rules": [{"q": "qmore", "op": "eq", "v": "yes"}]}},
]
settings = {"quiz": True, "show_score": True, "notify": True, "copy_to_respondent": True, "webhook": "https://hooks.example.com/x", "webhook_secret": "s3",
            "endings": [{"title": "Great {name}", "min_score": 1}, {"title": "Try again"}]}
sv = ok(call("save_form", fid, "Sign-up", blocks, settings))
assert sv["rev"] == 2 and len(sv["blocks"]) == 8
bad(call("set_status", fid, "weird"))
as_user(bob)
assert denied("set_status", fid, "live")
as_user(ana)
ok(call("set_status", fid, "live"))
slug = call("get_form_edit", fid)["slug"]
pid = ok(call("create_form", "Phish", [{"type": "short", "label": "Enter your Microsoft password"}]))["id"]
bad(call("set_status", pid, "live"), "phishing-looking forms can't be published")
eid = ok(call("create_form", "Empty"))["id"]
bad(call("set_status", eid, "live"), "a form needs a question")
assert call("check_safety", "x", [{"type": "short", "label": "Card number"}], {})["problems"]
bad(call("save_form", fid, "Sign-up", blocks + [{"type": "short", "label": "your password"}], settings), "live forms can't add risky questions")

# ---------------------------------------------------------------------------------- filling in (no account)
as_user(None)
bad(call("get_public_form", "nope"))
pub = ok(call("get_public_form", slug))
assert pub["form"]["title"] == "Sign-up" and all("correct" not in b for b in pub["form"]["blocks"]), "correct answers never reach respondents"
assert "webhook" not in pub["form"]["settings"]
f = T.forms.get(slug=slug)
assert f["views"] == 1
tok = "t" * 20
assert call("fill_progress", slug, tok, 2, {"qname": "Zed"})["ok"] and f["starts"] == 1
assert T.responses.get(token=tok)["status"] == "partial" and T.responses.get(token=tok)["answers"] == {}, "unfinished answers are not kept unless the owner turns it on"
bad(call("upload_file", anvil.BlobMedia("application/x-msdownload", b"MZ", name="evil.exe"), slug, tok, "qfile"))
bad(call("upload_file", anvil.BlobMedia("application/pdf", b"x" * (11 * 1024 * 1024), name="big.pdf"), slug, tok, "qfile"))
bad(call("upload_file", anvil.BlobMedia("application/pdf", b"%PDF", name="cv.pdf"), slug, tok, "qname"), "only file questions take files")
up = ok(call("upload_file", anvil.BlobMedia("application/pdf", b"%PDF-1.4 hello", name="cv.pdf"), slug, tok, "qfile"))["file"]
good = {"qname": "Zed", "qmail": "zed@example.com", "qcap": "ob", "qppl": 3, "qfile": [up], "qmore": "no", "qelse": "hidden, dropped", "qtot": 999999}
r = call("submit_response", slug, tok, {"qname": "", "qmail": "nope", "qcap": "zz"}, {"ms": 5000})
assert r["ok"] is False and r["errors"] == {"qname": "required", "qmail": "email", "qcap": "option"}
assert call("submit_response", slug, tok, good, {"ms": 200})["ok"] is False, "too fast = bot"
hp = call("submit_response", slug, "h" * 20, good, {"ms": 5000, "hp": "spam"})
assert hp["ok"] and T.responses.get(token="h" * 20) is None, "the honeypot pretends to succeed and stores nothing"
anvil.http.REPLIES["https://hooks.example.com"] = {"ok": True}
anvil.http.CALLS[:] = []
done = ok(call("submit_response", slug, tok, good, {"ms": 9000, "device": "phone"}))
assert done["ending"]["title"] == "Great {name}" and done["score"] == {"got": 1, "max": 1}
row = T.responses.get(token=tok)
assert row["status"] == "complete" and row["answers"]["qtot"] == 65 and "qelse" not in row["answers"], "calc recomputed on the server, hidden answers dropped"
assert T.files.get(key=up["key"])["response"] == row
assert f["responses_n"] == 1
hook = anvil.http.CALLS[-1]
assert hook["url"] == "https://hooks.example.com/x" and hook["headers"]["X-Fillfox-Signature"].startswith("sha256=")
assert '"name": "Zed"' in hook["data"] and f["webhook_log"][-1]["ok"]
mails = [m["to"] for m in anvil.email.OUTBOX]
assert "ana@example.com" in mails and "zed@example.com" in mails, "owner notified, respondent got a copy"
bad(call("submit_response", slug, tok, good, {"ms": 9000}), "the same visit can't send twice")
other = "o" * 20
bad(call("submit_response", slug, other, dict(good, qfile=[up]), {"ms": 9000}), "files from another visit are refused")
served = M["Fill"].serve_file(key=up["key"])
assert served.status == 200 and served.body.get_bytes().startswith(b"%PDF")
assert M["Fill"].serve_file(key="nope").status == 404

# ---------------------------------------------------------------------------------- results
as_user(ana)
res = call("get_results", fid)
assert len(res["responses"]) == 1 and res["funnel"]["starts"] == 1 and res["funnel"]["complete"] == 1 and res["partial"] == []
assert res["funnel"]["steps"][0]["reached"] == 1 and res["quiz_max"] == 1
demo = T.forms.get(slug="democafe")
dres = call("get_results", demo.get_id())
assert dres["role"] == "viewer" and len(dres["responses"]) == 72, "anyone signed in can explore the examples"
assert denied("delete_response", demo.get_id(), dres["responses"][0]["id"]), "examples are read-only"
assert denied("save_form", demo.get_id(), "x", [], {})
copy = ok(call("duplicate_form", demo.get_id()))["id"]
assert call("get_form_edit", copy)["role"] == "owner" and call("get_form_edit", copy)["status"] == "draft"
mine = call("my_forms")
assert len(mine["mine"]) == 4 and mine["totals"]["responses"] == 1
bad(call("erase_respondent", fid, "x"))
assert ok(call("erase_respondent", fid, "ZED@example.com"))["deleted"] == 1 and T.files.get(key=up["key"]) is None
assert call("get_results", fid)["responses"] == []

# ---------------------------------------------------------------------------------- teammates
as_user(bob)
assert denied("set_collaborators", fid, ["bob@example.com"])
as_user(ana)
assert ok(call("set_collaborators", fid, ["BOB@example.com", "bad", "ana@example.com"]))["collaborators"] == ["bob@example.com"]
as_user(bob)
assert call("get_form_edit", fid)["role"] == "editor" and len(call("my_forms")["shared"]) == 1
ok(call("save_form", fid, "Sign-up v2", blocks, settings))
assert denied("delete_form", fid) and denied("delete_all_responses", fid), "teammates can't delete the form"
ok(call("test_webhook", fid))

# ---------------------------------------------------------------------------------- retention, closing, limits
as_user(ana)
t2 = "r" * 20
call("fill_progress", slug, t2, 0)
old = T.responses.get(token=t2)
old["started"] = now - dt.timedelta(days=40)
settings2 = dict(settings, retention_days=30, limit=1)
ok(call("save_form", fid, "Sign-up v2", blocks, settings2))
call("get_results", fid)
assert T.responses.get(token=t2) is None, "answers older than the retention period are deleted"
as_user(None)
t3 = "s" * 20
ok(call("submit_response", slug, t3, dict(good, qfile=None), {"ms": 9000}))
r2 = call("get_public_form", slug)
assert r2["closed"] and "taking answers" in r2["message"], "the answer limit closes the form"

# ---------------------------------------------------------------------------------- reports and moderation
for i in range(3):
    anvil.server.session.use("reporter%d" % i)
    ok(call("report_form", slug, "phishing", "Looks fishy"))
assert T.forms.get(slug=slug)["status"] == "suspended", "three reports pause a form"
assert call("get_public_form", slug)["closed"]
as_user(ana)
bad(call("set_status", fid, "live"), "owners can't un-pause a reported form")
assert denied("admin_reports")
as_user(admin)
rep = call("admin_reports")
assert len(rep["reports"]) == 3 and rep["reports"][0]["form"]["reports"] == 3
ok(call("admin_moderate", fid, "restore"))
assert T.forms.get(slug=slug)["status"] == "live" and call("admin_reports")["reports"] == []
assert call("admin_forms", "ana@example.com")["total"] == 4
ov = call("admin_overview")
assert ov["forms"] == 4 and ov["reports_open"] == 0

# ---------------------------------------------------------------------------------- payments (Stripe Payment Links)
import hashlib, hmac, json as _json, time as _time  # noqa: E401,E402
as_user(ana)
assert L.stripe_url("https://buy.stripe.com/test_00g5kE") and not L.stripe_url("https://evil.com/buy.stripe.com/x") and not L.stripe_url("http://buy.stripe.com/x")
pay_blocks = [
    {"type": "email", "id": "pmail", "label": "Email", "required": True},
    {"type": "choice", "id": "ptick", "label": "Ticket", "required": True, "options": [{"id": "oa", "label": "Standard"}, {"id": "ob", "label": "VIP"}]},
    {"type": "payment", "id": "ppay", "label": "Pay for your ticket", "required": True,
     "props": {"by": "ptick", "links": {"oa": "https://buy.stripe.com/test_std", "ob": "https://phish.example.com/pay"},
               "amounts": {"oa": "$20", "ob": "$80"}}},
]
pid2 = ok(call("create_form", "Tickets", pay_blocks, {"stripe_secret": "whsec_test123"}))["id"]
pb = call("get_form_edit", pid2)
pay = [b for b in pb["blocks"] if b["type"] == "payment"][0]
assert pay["props"]["links"] == {"oa": "https://buy.stripe.com/test_std"}, "only Stripe links survive cleaning"
assert pb["settings"]["stripe_secret"] == "whsec_test123"
ok(call("set_status", pid2, "live"))
pslug = pb["slug"]
as_user(None)
assert "stripe_secret" not in call("get_public_form", pslug)["form"]["settings"], "the signing secret never reaches respondents"
ptok = "p" * 20
r = call("submit_response", pslug, ptok, {"pmail": "kim@example.com", "ptick": "ob"}, {"ms": 5000})
assert r["errors"] == {"ppay": "payment_choice"}, "an option without a Stripe link can't be paid"
r = call("submit_response", pslug, ptok, {"pmail": "kim@example.com", "ptick": "oa"}, {"ms": 5000})
assert r["errors"] == {"ppay": "payment"}, "required payment needs the tick"
ok(call("submit_response", pslug, ptok, {"pmail": "kim@example.com", "ptick": "oa", "ppay": {"confirmed": True, "ref": "forged"}}, {"ms": 5000}))
row = T.responses.get(token=ptok)
assert row["answers"]["ppay"] == {"confirmed": True, "link": "https://buy.stripe.com/test_std", "ref": ptok}, "the server sets the link and the reference"
# Stripe's signed webhook
P = M["Payments"]
def stripe_call(event, secret="whsec_test123", ts=None, slug=pslug, tamper=False):
    raw = _json.dumps(event).encode()
    ts = ts or int(_time.time())
    sig = hmac.new(secret.encode(), str(ts).encode() + b"." + raw, hashlib.sha256).hexdigest()
    anvil.server.request.headers = {"Stripe-Signature": "t=%d,v1=%s" % (ts, sig)}
    anvil.server.request.body = raw.decode() + (" " if tamper else "")
    return P.stripe_webhook(form=slug)
evt = {"type": "checkout.session.completed", "data": {"object": {"id": "cs_test_1", "client_reference_id": ptok, "amount_total": 2000,
                                                                "currency": "cad", "payment_status": "paid", "customer_details": {"email": "kim@example.com"}}}}
assert stripe_call(evt, secret="whsec_wrong").status == 400, "a wrong signature is refused"
assert stripe_call(evt, tamper=True).status == 400, "a changed body is refused"
assert stripe_call(evt, ts=int(_time.time()) - 3600).status == 400, "old events are refused"
assert stripe_call(evt, slug="nope").status == 404
assert stripe_call(evt).status == 200 and stripe_call(evt).status == 200, "the same event twice is fine"
assert len(T.payments.search(session="cs_test_1")) == 1
orphan = dict(evt, data={"object": dict(evt["data"]["object"], id="cs_test_2", client_reference_id="z" * 20, amount_total=8000)})
assert stripe_call(orphan).status == 200
assert stripe_call({"type": "customer.created", "data": {"object": {}}}).status == 200
as_user(ana)
res = call("get_results", pid2)
assert res["responses"][0]["paid"] == {"status": "paid", "amount": 2000, "currency": "CAD"}
assert len(res["unmatched_payments"]) == 1 and res["unmatched_payments"][0]["amount"] == 8000
assert res["stripe_url"].endswith("/stripe?form=" + pslug)
as_user(bob)
assert denied("get_results", pid2)
as_user(ana)
ok(call("erase_respondent", pid2, "kim@example.com"))
assert T.payments.get(session="cs_test_1") is None, "erasing a person also removes their Stripe record"
ok(call("delete_all_responses", pid2, "all"))
assert not T.payments.search(), "deleting all answers clears payment records too"

# ---------------------------------------------------------------------------------- Google Forms import
I = M["Imports"]
assert I._norm_url("https://docs.google.com/forms/d/e/1FAIpQLSabc/viewform?usp=sf_link") and I._norm_url("https://forms.gle/AbC123")
assert I._norm_url("https://docs.google.com/forms/d/1abc/edit").endswith("/viewform") and not I._norm_url("https://evil.com/forms/d/e/x")
data = [None, ["Tell us about the event", [
    [1, "Your name", None, 0, [[11, None, 1]]],
    [2, "Email address", "We reply here", 0, [[12, None, 1]]],
    [3, "Comments", None, 1, [[13, None, 0]]],
    [4, "Which day?", None, 2, [[14, [["Saturday", None, None, None, 0], ["Sunday", None, None, None, 0], ["", None, None, None, 1]], 1]]],
    [5, "Topics", None, 4, [[15, [["Design", None, None, None, 0], ["Code", None, None, None, 0]], 0]]],
    [6, "Country", None, 3, [[16, [["Canada"], ["France"]], 0]]],
    [7, "How useful?", None, 5, [[17, [["1"], ["2"], ["3"], ["4"], ["5"]], 1, ["Not useful", "Very useful"]]]],
    [8, "Rate it", None, 18, [[18, [["1"], ["2"], ["3"], ["4"], ["5"]], 0]]],
    [9, "Please rate", None, 7, [[19, [["Good"], ["Bad"]], 1, ["Venue"]], [20, [["Good"], ["Bad"]], 0, ["Food"]]]],
    [10, "Part two", "A few more", 8, None],
    [11, "Arrival", None, 9, [[21, None, 0]]],
    [12, "Logo", None, 11, None],
    [13, "Upload your CV", None, 13, [[22, None, 0]]],
    [14, "About this form", "Just so you know", 6, None],
], None, None, None, None, None, None, "Event sign-up"], "/forms", "Event sign-up (doc name)"]
html = "<html><script>var FB_PUBLIC_LOAD_DATA_ = " + _json.dumps(data) + ";</script></html>"
title, desc, gblocks, skipped = I.parse(html)
types = [b["type"] for b in gblocks]
assert title == "Event sign-up" and desc == "Tell us about the event"
assert types == ["short", "email", "long", "choice", "multi", "dropdown", "scale", "rating", "choice", "choice", "page", "text", "date", "file", "heading", "text"], types
gb = {b["label"]: b for b in gblocks}
assert gb["Which day?"]["props"]["other"] is True and [o["label"] for o in gb["Which day?"]["options"]] == ["Saturday", "Sunday"]
assert gb["How useful?"]["props"] == {"min": 1, "max": 5, "low": "Not useful", "high": "Very useful"} and gb["How useful?"]["required"]
assert gb["Please rate: Venue"]["required"] and not gb["Please rate: Food"]["required"]
assert skipped == [{"label": "Logo", "why": "image"}]
try:
    I.parse("<html><title>Form closed</title></html>")
    assert False
except ValueError as e:
    assert "closed" in str(e)
as_user(None)
assert denied("import_google_form", "https://forms.gle/x")
as_user(ana)
bad(call("import_google_form", "https://example.com/form"))
anvil.http.REPLIES["https://docs.google.com/forms/d/e/1FAIpQLSok"] = html
gi = ok(call("import_google_form", "https://docs.google.com/forms/d/e/1FAIpQLSok/viewform"))
assert gi["title"] == "Event sign-up" and gi["questions"] == 12 and gi["settings"]["description"] == "Tell us about the event"
anvil.http.REPLIES["https://docs.google.com/forms/d/e/1FAIpQLSclosed"] = "<html>closed</html>"
bad(call("import_google_form", "https://docs.google.com/forms/d/e/1FAIpQLSclosed/viewform"))
anvil.http.REPLIES["https://forms.gle/down"] = anvil.http.HttpError(404, "nope")
assert "404" in bad(call("import_google_form", "https://forms.gle/down"))["error"]
gid = ok(call("create_form", gi["title"], gi["blocks"], gi["settings"]))["id"]
assert len(call("get_form_edit", gid)["blocks"]) == 16
as_user(admin)

# ---------------------------------------------------------------------------------- demo data on/off
ok(call("demo_remove"))
assert M["DemoData"].state() == "removed" and not T.forms.search(is_demo=True) and T.forms.get(slug=slug) is not None, "removing demo data keeps real data"
assert not T.users.search(is_demo=True)
as_user(ana)
call("my_forms")
assert M["DemoData"].state() == "removed", "removed demo data doesn't come back by itself"
as_user(admin)
ok(call("demo_load")); ok(call("demo_load"))
assert len(T.forms.search(is_demo=True)) == 5, "reloading replaces the demo instead of doubling it"
as_user(ana)
ok(call("delete_form", fid))
assert T.forms.get(slug=slug) is None

# ---------------------------------------------------------------------------------- Privacy & Terms
if "legal_server" in M:
    as_user(ana)
    st = call("legal_state")
    assert st["signedIn"] and st["accepted_version"] is None
    ok(call("legal_accept", st["version"], "signup"))
    assert ana["legal_source"] == "signup" and call("legal_state")["accepted_version"] == st["version"]

# ---------------------------------------------------------------------------------- every callable is covered by a permission check
# A callable that changes data without require_user / a C.require_* check is a security hole. List the public ones here.
PUBLIC = {"get_me", "submit_feedback", "legal_state", "legal_accept", "get_public_form", "fill_progress", "upload_file",
          "submit_response", "report_form"}
for name, (f, need) in sorted(anvil.server.CALLABLES.items()):
    if name in PUBLIC:
        continue
    assert need, "%s is callable by anyone: add require_user=True (or list it in PUBLIC in test_server.py)" % name

print("ALL OK (%d server functions)" % len(anvil.server.CALLABLES))
