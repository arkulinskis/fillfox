"""Payments through Stripe Payment Links. Fillfox never touches card details: a payment block opens the owner's own
Stripe Payment Link with ?client_reference_id=<visit token>, the person pays on Stripe's page, then ticks "I've paid".

Optional verification: the owner adds a webhook in Stripe (event checkout.session.completed) pointing at
<app>/_/api/stripe?form=<form code> and pastes its signing secret (whsec_...) in the form's settings. Stripe's signed
event lands here and marks that visit's answer "Paid, checked by Stripe" with the amount.
"""
import hashlib
import hmac
import json
import time

import anvil.server
from anvil.tables import app_tables

from . import common as C

TOLERANCE = 300   # seconds, as Stripe recommends


def _body():
    b = anvil.server.request.body
    if b is None:
        return b""
    if hasattr(b, "get_bytes"):
        return b.get_bytes()
    return b.encode("utf-8") if isinstance(b, str) else bytes(b)


def verify(raw, header, secret, now=None):
    """Stripe-Signature: t=<time>,v1=<hex>[,v1=...]. True if one v1 matches HMAC-SHA256(secret, "<t>.<body>")."""
    if not header or not secret:
        return False
    parts = {}
    for kv in str(header).split(","):
        k, _, v = kv.strip().partition("=")
        parts.setdefault(k, []).append(v)
    try:
        t = int((parts.get("t") or ["0"])[0])
    except ValueError:
        return False
    if abs((now or time.time()) - t) > TOLERANCE:
        return False
    expected = hmac.new(secret.encode("utf-8"), str(t).encode("utf-8") + b"." + raw, hashlib.sha256).hexdigest()
    return any(hmac.compare_digest(expected, v) for v in parts.get("v1", []))


def _reply(status, data):
    return anvil.server.HttpResponse(status, json.dumps(data), headers={"Content-Type": "application/json"})


@anvil.server.http_endpoint("/stripe", methods=["POST"])
def stripe_webhook(form=None, **kw):
    f = app_tables.forms.get(slug=C.text(form, 20)) if form else None
    secret = ((f["settings"] or {}).get("stripe_secret") if f is not None else "") or ""
    if f is None or not secret:
        return _reply(404, {"error": "unknown form or no signing secret"})
    raw = _body()
    headers = {str(k).lower(): v for k, v in (anvil.server.request.headers or {}).items()}
    if not verify(raw, headers.get("stripe-signature"), secret):
        return _reply(400, {"error": "bad signature"})
    try:
        event = json.loads(raw.decode("utf-8"))
    except ValueError:
        return _reply(400, {"error": "bad json"})
    kind = event.get("type")
    obj = ((event.get("data") or {}).get("object") or {})
    if kind not in ("checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed"):
        return _reply(200, {"received": True, "ignored": kind})
    ref = C.text(obj.get("client_reference_id"), 60)
    session = C.text(obj.get("id"), 120)
    if not session:
        return _reply(200, {"received": True})
    status = obj.get("payment_status") or "unpaid"
    if kind == "checkout.session.async_payment_failed":
        status = "failed"
    elif kind == "checkout.session.async_payment_succeeded":
        status = "paid"
    row = app_tables.payments.get(session=session)
    data = dict(form=f, token=ref, status=C.text(status, 30), amount=obj.get("amount_total") if isinstance(obj.get("amount_total"), int) else None,
                currency=C.text(obj.get("currency"), 8).upper(), email=C.text(((obj.get("customer_details") or {}).get("email")), 200),
                updated=C.now())
    if row is None:
        app_tables.payments.add_row(session=session, created=C.now(), is_demo=False, **data)
    else:
        row.update(**data)
    return _reply(200, {"received": True})


def for_form(f):
    """{visit token: {status, amount, currency}} for a form's results."""
    out = {}
    for p in app_tables.payments.search(form=f):
        if not p["token"]:
            continue
        cur = out.get(p["token"])
        if cur is None or p["status"] == "paid":
            out[p["token"]] = {"status": p["status"], "amount": p["amount"], "currency": p["currency"] or ""}
    return out


def unmatched(f, tokens):
    """Payments Stripe reported for this form that match no answer (people who paid but never pressed Submit)."""
    return [{"status": p["status"], "amount": p["amount"], "currency": p["currency"] or "", "email": p["email"] or "",
             "when": C.iso(p["created"])} for p in app_tables.payments.search(form=f) if p["token"] not in tokens][:200]


def delete_for(f, token=None):
    for p in app_tables.payments.search(form=f):
        if token is None or p["token"] == token:
            p.delete()
