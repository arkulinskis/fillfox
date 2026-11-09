"""Fillfox's JavaScript engines, reached from Python.

    window.FF          theme/assets/ff.js: the form model (block types, logic, formulas, quiz score, answer text,
                       the paste parser, the form checker) and the templates (FF.TEMPLATES). Same rules as
                       server_code/Logic.py.
    FF.render          theme/assets/ffr.js: the form people fill in (Components/FormView).
    FF.editor          theme/assets/ff-editor.js: the whole form editor (Components/Editor).
    FF.results         theme/assets/ff-results.js: the numbers behind the Results page (cards, funnel, table rows,
                       one answer, CSV); the page draws them with Forms.
    window.UI          theme/assets/ff-ui.js: the helpers those engines use. install() connects its server bridge
                       (UI.api / UI.upload -> anvil.server.call) and its toasts (-> state.toast).
Everything crosses as JSON text or plain JS objects (js()/py()), so Python always gets real dicts and lists.
"""
import json

import anvil.js
import anvil.server
from anvil.js import window

from . import state

_c: dict = {}


def js(value):
    """A Python dict/list as a plain JS object (for the engines)."""
    return window.JSON.parse(json.dumps(value))


def py(value):
    """A JS object/array from an engine as Python dicts/lists."""
    return json.loads(window.JSON.stringify(value))


def loose(x):
    return x


# ---------------------------------------------------------------- the bridge the engines call through
def _bridge(kind, payload_json):
    """Called from JS (UI.api / UI.upload). Always returns JSON text: {"result": ...} or {"error": ...}."""
    p = json.loads(payload_json) if payload_json else {}
    try:
        if kind == "call":
            call = anvil.server.call_s if p.get("quiet") else anvil.server.call
            return json.dumps({"result": call(p["fn"], *(p.get("args") or []))})
        if kind == "upload":
            # the browser File becomes Anvil Media (streamed, no JSON copy of the bytes)
            media = anvil.js.to_media(window.UI._file)
            return json.dumps({"result": anvil.server.call(p["fn"], media, *(p.get("args") or []))})
        return json.dumps({"error": "Unknown request: %s" % kind})
    except Exception as e:
        kind_of = type(e).__name__  # (the validator's stubs miss some of anvil.server's exception classes)
        if kind_of == "SessionExpiredError":
            return json.dumps({"error": "Your session expired. Reload the page and sign in again.", "reload": True})
        if kind_of == "AppOfflineError":
            return json.dumps({"error": "You seem to be offline. Check your connection and try again."})
        if kind_of == "PermissionDenied":
            return json.dumps({"error": str(e) or "You don't have access to that.", "denied": True})
        print("bridge %s %s failed: %r" % (kind, p.get("fn", ""), e))
        return json.dumps({"error": "Something went wrong. Please try again.", "detail": repr(e)[:300]})


def _toast(message, kind):
    state.toast(message, kind or None)


def install():
    window.UI.bridge = _bridge
    window.UI.toastHook = _toast


def set_me(me):
    """The engines read UI.me (the editor's team list, the template page's sign-up step)."""
    window.UI.me = js(me) if me else None


# ---------------------------------------------------------------- the form model
def types():
    """{type: {label, icon, group, input, hint}}"""
    if "types" not in _c:
        _c["types"] = py(window.FF.TYPES)
    return _c["types"]


def type_label(t):
    return types().get(t, {}).get("label", t)


def templates():
    """FF.TEMPLATES as dicts: {key, cat, title, desc, blocks, settings}."""
    if "tpl" not in _c:
        _c["tpl"] = py(window.FF.TEMPLATES)
    return _c["tpl"]


def template(key):
    for t in templates():
        if t["key"] == key:
            return t
    return None


def instantiate(key):
    """A fresh copy of a template (new block ids) as {title, blocks, settings}, ready for create_form."""
    return py(window.FF.instantiate(window.FF.template(key)))


def is_asked(block):
    t = types().get(block.get("type"), {})
    return bool(t.get("input")) and block.get("type") not in ("hidden", "calc")


def parse_questions(text):
    return py(window.FF.parseQuestions(text or ""))


STATUS = {"draft": ("Draft", ""), "live": ("● Live", "good"), "closed": ("Closed", "warn"), "suspended": ("Paused", "bad")}


def status(st, is_open=None):
    """(text, colour) for a form's status badge."""
    if st == "live" and is_open is False:
        return "Closed", "warn"
    return STATUS.get(st, ("", ""))


def spark_svg(counts):
    return str(window.FF.spark(js(counts or [0])))


def form_url(slug, params=None):
    return str(window.FF.formUrl(slug, params)) if params else str(window.FF.formUrl(slug))


def copy(text, message="Copied"):
    window.FF.copy(text, message)


def download(name, text, mime="text/plain"):
    window.FF.download(name, text, mime)


# ---------------------------------------------------------------- results (ff-results.js)
def results_summary(d):
    return py(window.FF.results.summary(js(d)))


def results_funnel(d):
    return py(window.FF.results.funnel(js(d)))


def results_table(d, partial, query):
    return py(window.FF.results.table(js(d), bool(partial), query or ""))


def results_detail(d, response_id):
    return py(window.FF.results.detail(js(d), response_id))


def results_csv(d):
    window.FF.results.csv(js(d))
