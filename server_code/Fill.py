"""The respondent side (no account needed): open a form, progress events (for drop-off charts and unfinished
answers), file uploads, submit, report abuse. Plus the /file endpoint that serves uploads to form owners.

Respondents are identified only by a random token their browser makes per visit. No IP addresses are stored.
"""
import hashlib
import hmac
import json
import re

import anvil.server
import anvil.http
from anvil.tables import app_tables

from . import common as C
from . import Logic as L
from . import Forms

FILE_TYPES = {"pdf", "png", "jpg", "jpeg", "gif", "webp", "heic", "txt", "csv", "doc", "docx", "xls", "xlsx", "ppt",
              "pptx", "odt", "ods", "zip", "mp3", "m4a", "wav", "mp4", "mov", "svg", "md", "rtf", "json"}
MAX_FILE = 10 * 1024 * 1024
REPORT_PAUSE = 3   # open reports that pause a form until an admin looks


def _token(t):
    t = C.text(t, 40)
    return t if re.match(r"^[a-z0-9]{12,40}$", t) else None


def _form_by_slug(slug):
    slug = C.text(slug, 20)
    return app_tables.forms.get(slug=slug) if slug else None


def public_view(f):
    s = dict(f["settings"] or {})
    for k in ("webhook", "webhook_secret", "notify", "copy_to_respondent", "retention_days", "stripe_secret"):
        s.pop(k, None)
    endings = s.get("endings") or []
    return {"id": f.get_id(), "slug": f["slug"], "title": f["title"], "blocks": L.public_blocks(f["blocks"] or []),
            "settings": s, "endings": endings, "demo": bool(f["is_demo"])}


@anvil.server.callable
def get_public_form(slug, preview=False):
    f = _form_by_slug(slug)
    if f is None:
        return C.fail("This form doesn't exist (or was deleted).")
    me = C.me()
    role = Forms.access(f, me) if me is not None else None
    open_, why = Forms.is_open(f)
    if why == "suspended":
        return {"ok": True, "closed": True, "message": "This form was paused after people reported it. It's being reviewed."}
    if not open_ and not (preview and role in ("owner", "editor")):
        if why == "draft":
            return {"ok": True, "closed": True, "message": "This form isn't published yet."}
        return {"ok": True, "closed": True, "title": f["title"], "message": (f["settings"] or {}).get("closed_message") or
                "This form isn't taking answers right now."}
    if not preview:
        f["views"] = (f["views"] or 0) + 1
    return C.ok(form=public_view(f), preview=bool(preview and role), role=role)


def _response_for(f, token, create=True):
    r = app_tables.responses.get(form=f, token=token)
    if r is None and create:
        r = app_tables.responses.add_row(form=f, token=token, status="partial", answers={}, reached=0, meta={},
                                         started=C.now(), is_demo=False)
        f["starts"] = (f["starts"] or 0) + 1
    return r


@anvil.server.callable
def fill_progress(slug, token, reached, answers=None):
    """Quiet call while someone fills a form: how far they got (and their answers if the owner saves unfinished ones)."""
    f, token = _form_by_slug(slug), _token(token)
    if f is None or token is None or not Forms.is_open(f)[0]:
        return {"ok": False}
    if C.rate_limited("progress", 240, 3600):
        return {"ok": False}
    r = _response_for(f, token)
    if r["status"] == "complete":
        return {"ok": True}
    r["reached"] = max(r["reached"] or 0, int(L._num(reached, 0, 0, 1000)))
    if (f["settings"] or {}).get("save_partial") and isinstance(answers, dict):
        clean, _ = L.check_answers(f["blocks"] or [], answers, files_ok=lambda k: _files_ok(f, token, k))
        r["answers"] = clean
    r["meta"] = dict(r["meta"] or {}, last=C.iso(C.now()))
    return {"ok": True}


def _files_ok(f, token, keys):
    for k in keys:
        row = app_tables.files.get(key=k)
        if row is None or row["form"] != f or row["token"] != token:
            return False
    return True


@anvil.server.callable
def upload_file(media, slug, token, block_id):
    f, token = _form_by_slug(slug), _token(token)
    if f is None or token is None or not Forms.is_open(f)[0]:
        return C.fail("This form isn't taking answers right now.")
    if not any(b["id"] == block_id and b["type"] == "file" for b in f["blocks"] or []):
        return C.fail("That question doesn't take files.")
    if C.rate_limited("upload", 20, 3600):
        return C.fail("Too many uploads. Please try again later.")
    name = C.text(getattr(media, "name", None) or "file", 120)
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if ext not in FILE_TYPES:
        return C.fail("Files of type .%s can't be uploaded here. Try a PDF, an image, an office document or a zip." % (ext or "?"))
    size = len(media.get_bytes() or b"")
    if size == 0:
        return C.fail("That file is empty.")
    if size > MAX_FILE:
        return C.fail("Files can be up to 10 MB. This one is %.1f MB." % (size / 1048576.0))
    key = L.uid(28)
    app_tables.files.add_row(form=f, token=token, block_id=block_id, key=key, name=name, size=size, media=media,
                             created=C.now(), is_demo=False)
    return C.ok(file={"key": key, "name": name, "size": size})


@anvil.server.http_endpoint("/file")
def serve_file(key=None, **kw):
    row = app_tables.files.get(key=C.text(key, 40)) if key else None
    if row is None or not row["media"]:
        return anvil.server.HttpResponse(404, "Not found")
    return anvil.server.HttpResponse(200, row["media"], headers={
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": 'attachment; filename="%s"' % re.sub(r'[^\w.\- ]', "_", row["name"] or "file")})


def pick_ending(settings, got, has_quiz):
    endings = settings.get("endings") or []
    chosen = endings[0] if endings else {"title": "Thank you!", "text": ""}
    if has_quiz:
        scored = sorted([e for e in endings if e.get("min_score") is not None], key=lambda e: -e["min_score"])
        for e in scored:
            if got >= e["min_score"]:
                return e
        unscored = [e for e in endings if e.get("min_score") is None]
        if unscored:
            return unscored[0]
    return chosen


@anvil.server.callable
def submit_response(slug, token, answers, meta=None):
    f, token = _form_by_slug(slug), _token(token)
    if f is None:
        return C.fail("This form doesn't exist anymore.")
    if token is None:
        return C.fail("Please reload the page and try again.")
    open_, why = Forms.is_open(f)
    if not open_:
        return C.fail((f["settings"] or {}).get("closed_message") or "This form isn't taking answers right now.")
    meta = meta if isinstance(meta, dict) else {}
    if meta.get("hp"):   # the hidden honeypot field only bots fill in
        return C.ok(ending={"title": "Thank you!", "text": ""}, score=None)
    if L._num(meta.get("ms"), 0) < 1500:
        return C.fail("That was very fast. Please check your answers and send again.")
    if C.rate_limited("submit_" + f["slug"], 6, 600) or C.rate_limited("submit", 30, 3600):
        return C.fail("Too many answers from this browser. Please try again later.")
    blocks = f["blocks"] or []
    clean, errors = L.check_answers(blocks, answers, files_ok=lambda k: _files_ok(f, token, k))
    if errors:
        return {"ok": False, "error": "Some answers need another look.", "errors": errors}
    s = f["settings"] or {}
    vis = L.visible_ids(blocks, clean)
    got, best = L.score(blocks, clean, vis)
    has_quiz = bool(s.get("quiz")) and best > 0
    for bid, v in L.calc_values(blocks, clean, got).items():
        if bid in vis:
            clean[bid] = v
    for b in blocks:   # the visit token is the reference Stripe sends back (client_reference_id)
        if b["type"] == "payment" and isinstance(clean.get(b["id"]), dict):
            clean[b["id"]]["ref"] = token
    r = _response_for(f, token)
    if r["status"] == "complete":
        return C.fail("These answers were already sent.")
    total_inputs = len([b for b in blocks if b["type"] in L.INPUTS])
    r.update(status="complete", answers=clean, score=got if has_quiz else None, reached=max(r["reached"] or 0, total_inputs),
             submitted=C.now(), meta={"seconds": int(L._num(meta.get("ms"), 0) / 1000), "device": C.text(meta.get("device"), 12),
                                      "lang": C.text(meta.get("lang"), 8), "embed": bool(meta.get("embed"))})
    f.update(responses_n=(f["responses_n"] or 0) + 1, last_response=C.now())
    for row in app_tables.files.search(form=f, token=token):
        row["response"] = r
    ending = pick_ending(s, got, has_quiz)
    _after_submit(f, r, clean)
    return C.ok(ending=ending, score=({"got": got, "max": best} if has_quiz and s.get("show_score") else None),
                answers=clean)


def payload(f, r):
    out = {}
    for b in f["blocks"] or []:
        if b["type"] in L.INPUTS:
            out[b["key"]] = L.display(b, (r["answers"] or {}).get(b["id"]))
    return {"event": "response", "form": {"id": f.get_id(), "title": f["title"], "slug": f["slug"]},
            "response": {"id": r.get_id(), "submitted": C.iso(r["submitted"]), "score": r["score"]}, "answers": out}


def send_webhook(f, data):
    s = f["settings"] or {}
    url = s.get("webhook")
    if not url:
        return None
    body = json.dumps(data)
    headers = {"Content-Type": "application/json", "User-Agent": "Fillfox-Webhook/1"}
    if s.get("webhook_secret"):
        headers["X-Fillfox-Signature"] = "sha256=" + hmac.new(s["webhook_secret"].encode(), body.encode(), hashlib.sha256).hexdigest()
    entry = {"at": C.iso(C.now()), "event": data.get("event")}
    try:
        anvil.http.request(url, method="POST", data=body, headers=headers, timeout=6)
        entry["ok"], entry["status"] = True, 200
    except anvil.http.HttpError as e:
        entry["ok"], entry["status"] = False, getattr(e, "status", 0)
    except Exception as e:
        entry["ok"], entry["status"], entry["error"] = False, 0, str(e)[:120]
    f["webhook_log"] = ((f["webhook_log"] or []) + [entry])[-20:]
    return entry


def _after_submit(f, r, clean):
    s = f["settings"] or {}
    try:
        send_webhook(f, payload(f, r))
    except Exception as e:
        print("webhook failed: %r" % e)
    lines = []
    for b in f["blocks"] or []:
        if b["type"] in L.INPUTS and b["type"] != "hidden":
            lines.append("%s\n  %s" % (b["label"] or b["key"], L.display(b, clean.get(b["id"])) or "-"))
    try:
        import anvil.email
        if s.get("notify", True) and f["owner"] is not None and f["owner"]["email"] and not f["is_demo"]:
            anvil.email.send(to=f["owner"]["email"], subject="New answer: %s" % (f["title"] or "your form"),
                             text="Someone answered \"%s\".\n\n%s\n\nSee every answer in Fillfox." % (f["title"], "\n".join(lines)))
        if s.get("copy_to_respondent"):
            email = next((clean.get(b["id"]) for b in f["blocks"] or [] if b["type"] == "email" and clean.get(b["id"])), None)
            if email:
                anvil.email.send(to=email, subject="Your answers: %s" % (f["title"] or "form"),
                                 text="Here is a copy of what you sent to \"%s\".\n\n%s\n\nSent with Fillfox. You got this "
                                      "email because you filled in this form." % (f["title"], "\n".join(lines)))
    except Exception as e:
        print("email failed: %r" % e)


REASONS = {"phishing": "Asks for passwords or bank details", "spam": "Spam or scam", "illegal": "Illegal or harmful",
           "impersonation": "Pretends to be someone else", "other": "Something else"}


@anvil.server.callable
def report_form(slug, reason, details="", email=None):
    f = _form_by_slug(slug)
    if f is None:
        return C.fail("That form no longer exists.")
    if C.rate_limited("report", 5, 3600):
        return C.fail("Thanks, we already have your reports.")
    reason = reason if reason in REASONS else "other"
    email = C.text(email, 120)
    app_tables.reports.add_row(form=f, reason=reason, details=C.text(details, 1000, multiline=True),
                               email=email if L.EMAIL_RE.match(email) else "", created=C.now(), status="open", is_demo=False)
    n = len(app_tables.reports.search(form=f, status="open"))
    f["reports_n"] = n
    if n >= REPORT_PAUSE and f["status"] == "live" and not f["is_demo"]:
        f["status"] = "suspended"
    return C.ok()
