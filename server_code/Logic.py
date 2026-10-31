"""The form model shared by every server module: cleaning blocks and settings from the browser,
show/hide logic, formulas, quiz scores, answer checks and the safety scan.

web/pages/_ff.html has the same rules in JavaScript (FF.visible, FF.formula, FF.score). Keep the two in step.

A form is a list of blocks:
  {id, type, label, help, required, placeholder, key, options: [{id, label, value}], props: {...},
   logic: {match: "all"|"any", rules: [{q: block id, op, v}]}, correct: [option ids], points}
"""
import random
import re
import string

LAYOUT = {"heading", "text", "divider", "image", "page"}
INPUTS = {"short", "long", "email", "number", "phone", "url", "date", "time", "choice", "multi", "dropdown", "yesno",
          "rating", "scale", "ranking", "file", "signature", "consent", "hidden", "calc", "payment"}
TYPES = LAYOUT | INPUTS
WITH_OPTIONS = {"choice", "multi", "dropdown", "ranking"}
OPS = {"answered", "empty", "eq", "neq", "contains", "gt", "lt"}
MAX_BLOCKS = 250
MAX_OPTIONS = 300

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
URL_RE = re.compile(r"^https?://[^\s]+\.[^\s]+$", re.I)
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
TIME_RE = re.compile(r"^\d{2}:\d{2}$")
# Payment blocks only link to Stripe-hosted pages (Payment Links and checkout), never to any other site.
STRIPE_RE = re.compile(r"^https://(buy|donate|checkout)\.stripe\.com/[A-Za-z0-9_\-/]+$")


def stripe_url(v):
    v = _s(v, 300)
    return v if STRIPE_RE.match(v) else ""

# Words that make a form look like a phishing form. Publishing is refused while any label or text matches.
SENSITIVE = [
    (r"\bpass ?words?\b|\bpasscodes?\b|\bpwd\b", "passwords"),
    (r"\bpin (code|number)\b|\byour pin\b", "PIN codes"),
    (r"\b(credit|debit) ?card (number|no)\b|\bcard number\b|\bcvv\b|\bcvc\b|\bsecurity code\b", "payment card numbers"),
    (r"\bone[- ]time (code|password)\b|\b2fa code\b|\bverification code\b|\botp\b", "one-time codes"),
    (r"\bsocial security\b|\bssn\b|\bsocial insurance number\b|\bsin number\b", "social security / insurance numbers"),
    (r"\bseed phrase\b|\brecovery phrase\b|\bprivate key\b|\bwallet phrase\b", "wallet recovery phrases"),
    (r"\b(verify|confirm|validate) your (account|mailbox|email account|identity)\b|\bmailbox (upgrade|quota)\b|\baccount (suspended|deactivat)", "account-verification wording"),
    (r"\b(log ?in|sign ?in) (to|with) (your )?(microsoft|office ?365|outlook|google|gmail|apple|icloud|paypal|amazon|netflix|bank|desjardins|rbc|td|bmo|scotiabank|cra|irs)\b", "sign-in wording for another company"),
]


def uid(n=8):
    return "".join(random.choice(string.ascii_lowercase + string.digits) for _ in range(n))


def _s(v, limit, multiline=False):
    s = "" if v is None else str(v)
    s = s.replace("\r\n", "\n").strip()
    if not multiline:
        s = re.sub(r"\s+", " ", s)
    return s[:limit]


def _num(v, default=None, lo=None, hi=None):
    try:
        x = float(v)
    except (TypeError, ValueError):
        return default
    if x != x:  # NaN
        return default
    if lo is not None:
        x = max(lo, x)
    if hi is not None:
        x = min(hi, x)
    return int(x) if x == int(x) else x


def slug_key(label, taken):
    base = re.sub(r"[^a-z0-9]+", "_", (label or "").lower()).strip("_")[:24] or "field"
    if base[0].isdigit():
        base = "q_" + base
    key, n = base, 2
    while key in taken:
        key = "%s_%d" % (base, n)
        n += 1
    return key


# ------------------------------------------------------------------------------------------- cleaning
def clean_blocks(raw):
    """Blocks from the browser -> a safe list (known types, capped sizes, unique ids and keys)."""
    out, ids, keys, idmap = [], set(), set(), {}
    for b in (raw if isinstance(raw, list) else [])[:MAX_BLOCKS]:
        if not isinstance(b, dict) or b.get("type") not in TYPES:
            continue
        t = b["type"]
        orig = _s(b.get("id"), 16)
        bid = orig
        if not re.match(r"^[a-z0-9]{3,16}$", bid) or bid in ids:
            bid = uid()
        if orig and orig not in idmap:
            idmap[orig] = bid   # rules and payment links that point at a renamed block follow it
        ids.add(bid)
        props = b.get("props") if isinstance(b.get("props"), dict) else {}
        c = {"id": bid, "type": t, "label": _s(b.get("label"), 600, multiline=t in ("text", "consent")),
             "help": _s(b.get("help"), 400), "props": {}}
        if t == "text":
            c["label"] = _s(b.get("label"), 4000, multiline=True)
        if t in INPUTS:
            c["required"] = bool(b.get("required")) and t not in ("hidden", "calc")
            c["placeholder"] = _s(b.get("placeholder"), 120)
            key = re.sub(r"[^a-z0-9_]", "", _s(b.get("key"), 32).lower())
            if not key or key in keys or key[0].isdigit() or key == "score":
                key = slug_key(c["label"], keys | {"score"})
            keys.add(key)
            c["key"] = key
        if t in WITH_OPTIONS:
            opts, oids = [], set()
            for o in (b.get("options") if isinstance(b.get("options"), list) else [])[:MAX_OPTIONS]:
                if isinstance(o, str):
                    o = {"label": o}
                if not isinstance(o, dict):
                    continue
                lab = _s(o.get("label"), 200)
                if not lab:
                    continue
                oid = _s(o.get("id"), 12)
                if not re.match(r"^[a-z0-9]{2,12}$", oid) or oid in oids:
                    oid = uid(6)
                oids.add(oid)
                opt = {"id": oid, "label": lab}
                val = _num(o.get("value"))
                if val is not None:
                    opt["value"] = val
                opts.append(opt)
            c["options"] = opts
            c["props"]["other"] = bool(props.get("other")) and t in ("choice", "multi")
            c["props"]["shuffle"] = bool(props.get("shuffle"))
            if t == "multi":
                c["props"]["min"] = _num(props.get("min"), None, 0, MAX_OPTIONS)
                c["props"]["max"] = _num(props.get("max"), None, 0, MAX_OPTIONS)
            correct = b.get("correct")
            if isinstance(correct, list):
                c["correct"] = [x for x in correct if x in oids][:MAX_OPTIONS]
        if t == "short":
            acc = props.get("accept")
            if isinstance(acc, list):
                c["props"]["accept"] = [_s(a, 120) for a in acc if _s(a, 120)][:20]
            c["props"]["maxlen"] = _num(props.get("maxlen"), None, 1, 2000)
        if t == "long":
            c["props"]["maxlen"] = _num(props.get("maxlen"), None, 1, 10000)
        if t == "number":
            c["props"]["min"] = _num(props.get("min"))
            c["props"]["max"] = _num(props.get("max"))
            c["props"]["unit"] = _s(props.get("unit"), 12)
        if t == "rating":
            c["props"]["max"] = _num(props.get("max"), 5, 3, 10)
        if t == "scale":
            lo = _num(props.get("min"), 0, 0, 1)
            hi = _num(props.get("max"), 10, 3, 10)
            c["props"].update({"min": lo, "max": hi, "low": _s(props.get("low"), 40), "high": _s(props.get("high"), 40)})
        if t == "file":
            c["props"]["max_files"] = _num(props.get("max_files"), 1, 1, 5)
        if t == "calc":
            c["props"]["formula"] = _s(props.get("formula"), 400)
            c["props"]["show"] = bool(props.get("show"))
            c["props"]["decimals"] = _num(props.get("decimals"), 2, 0, 6)
            c["props"]["prefix"] = _s(props.get("prefix"), 8)
        if t == "payment":
            c["props"]["url"] = stripe_url(props.get("url"))
            c["props"]["amount"] = _s(props.get("amount"), 40)
            c["props"]["button"] = _s(props.get("button"), 40)
            c["props"]["by"] = _s(props.get("by"), 16)
            links = props.get("links") if isinstance(props.get("links"), dict) else {}
            c["props"]["links"] = {_s(k, 12): stripe_url(v) for k, v in list(links.items())[:MAX_OPTIONS] if stripe_url(v)}
            amounts = props.get("amounts") if isinstance(props.get("amounts"), dict) else {}
            c["props"]["amounts"] = {_s(k, 12): _s(v, 40) for k, v in list(amounts.items())[:MAX_OPTIONS] if _s(v, 40)}
        if t == "heading":
            c["props"]["size"] = "h3" if props.get("size") == "h3" else "h2"
        if t == "image":
            url = _s(props.get("url"), 600)
            c["props"]["url"] = url if URL_RE.match(url) and url.lower().startswith("https://") else ""
            c["props"]["alt"] = _s(props.get("alt"), 200)
        if t in INPUTS and isinstance(b.get("points"), (int, float)):
            c["points"] = _num(b.get("points"), 1, 0, 100)
        logic = b.get("logic") if isinstance(b.get("logic"), dict) else {}
        rules = []
        for r in (logic.get("rules") if isinstance(logic.get("rules"), list) else [])[:12]:
            if isinstance(r, dict) and r.get("op") in OPS and isinstance(r.get("q"), str):
                v = r.get("v")
                rules.append({"q": _s(r["q"], 16), "op": r["op"],
                              "v": _num(v) if isinstance(v, (int, float)) else _s(v, 200)})
        if rules:
            c["logic"] = {"match": "any" if logic.get("match") == "any" else "all", "rules": rules}
        out.append(c)
    # Rules may only point at questions that exist.
    for c in out:
        if c["type"] == "payment" and c["props"].get("by"):
            c["props"]["by"] = idmap.get(c["props"]["by"], c["props"]["by"])
        for r in (c.get("logic") or {}).get("rules", []):
            r["q"] = idmap.get(r["q"], r["q"])
        if c["type"] == "payment" and c["props"].get("by") and c["props"]["by"] not in ids:
            c["props"]["by"] = ""
        if c.get("logic"):
            c["logic"]["rules"] = [r for r in c["logic"]["rules"] if r["q"] in ids and r["q"] != c["id"]]
            if not c["logic"]["rules"]:
                c.pop("logic")
    return out


ACCENTS = re.compile(r"^#[0-9a-fA-F]{6}$")
FONTS = {"plex", "grotesk", "serif", "mono"}
LANGS = {"en", "fr", "es", "de", "pt", "lv"}


def clean_settings(raw):
    s = raw if isinstance(raw, dict) else {}
    endings = []
    for e in (s.get("endings") if isinstance(s.get("endings"), list) else [])[:8]:
        if not isinstance(e, dict):
            continue
        red = _s(e.get("redirect"), 600)
        endings.append({"id": _s(e.get("id"), 12) or uid(6), "title": _s(e.get("title"), 160) or "Thank you!",
                        "text": _s(e.get("text"), 2000, multiline=True),
                        "min_score": _num(e.get("min_score")),
                        "redirect": red if red.lower().startswith("https://") and URL_RE.match(red) else ""})
    if not endings:
        endings = [{"id": "end", "title": "Thank you!", "text": "Your answers were sent.", "min_score": None, "redirect": ""}]
    hook = _s(s.get("webhook"), 600)
    close_at = _s(s.get("close_at"), 10)
    return {
        "description": _s(s.get("description"), 2000, multiline=True),
        "layout": "focus" if s.get("layout") == "focus" else "classic",
        "accent": s.get("accent") if ACCENTS.match(str(s.get("accent") or "")) else "#0a0a0a",
        "font": s.get("font") if s.get("font") in FONTS else "plex",
        "cover": s.get("cover") if s.get("cover") in ("none", "band", "grid", "dots") else "band",
        "align": "center" if s.get("align") == "center" else "left",
        "lang": s.get("lang") if s.get("lang") in LANGS else "en",
        "button": _s(s.get("button"), 40),
        "progress": s.get("progress") is not False,
        "endings": endings,
        "quiz": bool(s.get("quiz")),
        "show_score": bool(s.get("show_score")),
        "close_at": close_at if DATE_RE.match(close_at) else "",
        "limit": _num(s.get("limit"), None, 1, 1000000),
        "closed_message": _s(s.get("closed_message"), 400) or "This form isn't taking answers right now.",
        "one_per_device": bool(s.get("one_per_device")),
        "save_partial": bool(s.get("save_partial")),
        "notify": s.get("notify") is not False,
        "copy_to_respondent": bool(s.get("copy_to_respondent")),
        "retention_days": _num(s.get("retention_days"), None, 1, 3650),
        "privacy_contact": _s(s.get("privacy_contact"), 300),
        "webhook": hook if hook.lower().startswith("https://") and URL_RE.match(hook) else "",
        "webhook_secret": _s(s.get("webhook_secret"), 80),
        "stripe_secret": _s(s.get("stripe_secret"), 120) if str(s.get("stripe_secret") or "").startswith("whsec_") else "",
    }


# ------------------------------------------------------------------------------------------- logic
def _opt_label(block, oid):
    for o in block.get("options") or []:
        if o["id"] == oid:
            return o["label"]
    if isinstance(oid, str) and oid.startswith("other:"):
        return oid[6:]
    return oid


def is_empty(v):
    return v is None or v == "" or v == [] or v == {} or v is False


def _rule(rule, block, value):
    op, want = rule["op"], rule.get("v")
    if op == "answered":
        return not is_empty(value)
    if op == "empty":
        return is_empty(value)
    if is_empty(value):
        return op == "neq"
    if op in ("gt", "lt"):
        a, b = _num(value), _num(want)
        if a is None or b is None:
            return False
        return a > b if op == "gt" else a < b
    if isinstance(value, list):
        hit = want in value or str(want).lower() in [str(_opt_label(block, x)).lower() for x in value]
    elif isinstance(value, dict):
        hit = False
    else:
        sv = str(value).lower()
        sw = str(want).lower()
        lab = str(_opt_label(block, value)).lower()
        if op == "contains":
            hit = sw in sv or sw in lab
        else:
            hit = sv == sw or lab == sw or (_num(value) is not None and _num(value) == _num(want))
    if op == "contains":
        return hit
    return hit if op == "eq" else not hit


def visible_ids(blocks, answers):
    """Ids of the blocks a respondent sees, given their answers (rules on hidden questions count as empty)."""
    by_id = {b["id"]: b for b in blocks}
    seen, page_on, vals = set(), True, {}

    def passes(b):
        lg = b.get("logic")
        if not lg:
            return True
        res = [_rule(r, by_id.get(r["q"], {}), vals.get(r["q"])) for r in lg["rules"]]
        return any(res) if lg["match"] == "any" else all(res)

    for b in blocks:
        if b["type"] == "page":
            page_on = passes(b)
            if page_on:
                seen.add(b["id"])
            continue
        if page_on and passes(b):
            seen.add(b["id"])
            if b["type"] in INPUTS:
                vals[b["id"]] = answers.get(b["id"])
    return seen


# ------------------------------------------------------------------------------------------- formulas
def numeric(block, value):
    """A block's answer as a number for formulas."""
    if block is None or is_empty(value):
        return 0
    t = block["type"]
    if t in ("choice", "dropdown"):
        for o in block.get("options") or []:
            if o["id"] == value:
                return o.get("value", 0) or 0
        return 0
    if t == "multi":
        return sum((o.get("value", 0) or 0) for o in block.get("options") or [] if o["id"] in (value or []))
    if t == "yesno":
        return 1 if value == "yes" else 0
    if t == "consent":
        return 1 if value else 0
    return _num(value, 0) or 0


TOKEN = re.compile(r"\s*(?:(\d+(?:\.\d+)?)|(\{[a-z0-9_]+\})|([a-z]+)|(.))")


def formula(expr, lookup):
    """Evaluate + - * / % ( ) with {key} references and round/min/max/abs. Never raises; bad input -> 0."""
    toks = []
    for m in TOKEN.finditer(expr or ""):
        if m.group(1):
            toks.append(("n", float(m.group(1))))
        elif m.group(2):
            toks.append(("n", float(lookup(m.group(2)[1:-1]) or 0)))
        elif m.group(3):
            toks.append(("f", m.group(3)))
        elif m.group(4) and m.group(4).strip():
            toks.append(("o", m.group(4)))
    pos = [0]

    def peek():
        return toks[pos[0]] if pos[0] < len(toks) else (None, None)

    def take():
        t = peek()
        pos[0] += 1
        return t

    def expr_():
        v = term()
        while peek() in (("o", "+"), ("o", "-")):
            op = take()[1]
            r = term()
            v = v + r if op == "+" else v - r
        return v

    def term():
        v = unary()
        while peek() in (("o", "*"), ("o", "/"), ("o", "%")):
            op = take()[1]
            r = unary()
            if op == "*":
                v = v * r
            elif op == "/":
                v = v / r if r else 0
            else:
                v = v % r if r else 0
        return v

    def unary():
        if peek() == ("o", "-"):
            take()
            return -unary()
        if peek() == ("o", "+"):
            take()
            return unary()
        return atom()

    def atom():
        kind, val = take()
        if kind == "n":
            return val
        if kind == "o" and val == "(":
            v = expr_()
            if peek() == ("o", ")"):
                take()
            return v
        if kind == "f" and val in ("round", "min", "max", "abs") and peek() == ("o", "("):
            take()
            args = [expr_()]
            while peek() == ("o", ","):
                take()
                args.append(expr_())
            if peek() == ("o", ")"):
                take()
            if val == "round":
                return round(args[0], int(args[1]) if len(args) > 1 else 0)
            if val == "abs":
                return abs(args[0])
            return min(args) if val == "min" else max(args)
        raise ValueError("bad formula")

    try:
        v = expr_()
        if pos[0] < len(toks):
            return 0
        return v
    except (ValueError, ZeroDivisionError, OverflowError, IndexError):
        return 0


def score(blocks, answers, visible=None):
    """(score, max) for a quiz: options marked correct, or accepted short answers."""
    got, best = 0, 0
    for b in blocks:
        if b["type"] not in INPUTS or (visible is not None and b["id"] not in visible):
            continue
        pts = b.get("points", 1)
        v = answers.get(b["id"])
        if b["type"] in ("choice", "dropdown") and b.get("correct"):
            best += pts
            got += pts if v in b["correct"] else 0
        elif b["type"] == "multi" and b.get("correct"):
            best += pts
            got += pts if isinstance(v, list) and sorted(v) == sorted(b["correct"]) else 0
        elif b["type"] == "short" and b["props"].get("accept"):
            best += pts
            norm = lambda s: re.sub(r"\s+", " ", str(s or "").strip().lower())
            got += pts if norm(v) in [norm(a) for a in b["props"]["accept"]] else 0
    return got, best


def calc_values(blocks, answers, quiz_score=0):
    """Recompute every calc block in order (a calc may use earlier calcs)."""
    by_key = {b["key"]: b for b in blocks if b["type"] in INPUTS}
    vals = dict(answers)

    def lookup(key):
        if key == "score":
            return quiz_score
        b = by_key.get(key)
        return numeric(b, vals.get(b["id"])) if b else 0

    for b in blocks:
        if b["type"] == "calc":
            v = formula(b["props"].get("formula"), lookup)
            vals[b["id"]] = round(v, int(b["props"].get("decimals", 2)))
    return {b["id"]: vals[b["id"]] for b in blocks if b["type"] == "calc"}


# ------------------------------------------------------------------------------------------- answers
def check_answers(blocks, raw, files_ok=lambda keys: True):
    """(clean answers, errors {block id: message}) for a submission. Hidden questions are dropped."""
    raw = raw if isinstance(raw, dict) else {}
    vis = visible_ids(blocks, raw)
    clean, errors = {}, {}
    for b in blocks:
        t, bid = b["type"], b["id"]
        if t not in INPUTS or t == "calc" or bid not in vis:
            continue
        v = raw.get(bid)
        opts = {o["id"] for o in b.get("options") or []}
        err, out = None, None
        if is_empty(v):
            out = None
        elif t in ("short", "long", "phone", "hidden"):
            limit = b["props"].get("maxlen") or (2000 if t == "short" else 10000 if t == "long" else 200)
            out = _s(v, limit, multiline=t == "long")
            if t == "phone" and not re.match(r"^[0-9+()\-.\s]{6,30}$", out):
                err = "phone"
        elif t == "email":
            out = _s(v, 200)
            if not EMAIL_RE.match(out):
                err = "email"
        elif t == "url":
            out = _s(v, 600)
            if not re.match(r"^(https?://)?[^\s]+\.[^\s]+$", out, re.I):
                err = "url"
        elif t == "number":
            out = _num(v)
            p = b["props"]
            if out is None:
                err = "number"
            elif (p.get("min") is not None and out < p["min"]) or (p.get("max") is not None and out > p["max"]):
                err = "range"
        elif t == "date":
            out = _s(v, 10)
            err = None if DATE_RE.match(out) else "date"
        elif t == "time":
            out = _s(v, 5)
            err = None if TIME_RE.match(out) else "time"
        elif t in ("choice", "dropdown"):
            out = _s(v, 220)
            if out not in opts and not (b["props"].get("other") and out.startswith("other:") and len(out) > 6):
                err = "option"
        elif t == "multi":
            out = [_s(x, 220) for x in (v if isinstance(v, list) else [])][:MAX_OPTIONS]
            out = [x for x in out if x in opts or (b["props"].get("other") and x.startswith("other:") and len(x) > 6)]
            p = b["props"]
            if (p.get("min") and len(out) < p["min"]) or (p.get("max") and len(out) > p["max"]):
                err = "count"
            if not out:
                out = None
        elif t == "ranking":
            out = [x for x in (v if isinstance(v, list) else []) if x in opts]
            if sorted(out) != sorted(opts):
                err = "ranking"
        elif t == "yesno":
            out = v if v in ("yes", "no") else None
        elif t == "rating":
            out = _num(v)
            if out is None or out < 1 or out > b["props"].get("max", 5) or out != int(out):
                err = "option"
        elif t == "scale":
            out = _num(v)
            p = b["props"]
            if out is None or out < p.get("min", 0) or out > p.get("max", 10) or out != int(out):
                err = "option"
        elif t == "consent":
            out = True if v is True else None
        elif t == "payment":
            link = payment_link(b, raw)
            if isinstance(v, dict) and v.get("confirmed") is True and link:
                out = {"confirmed": True, "link": link}
            elif b.get("required") and not link:
                err = "payment_choice"
            elif b.get("required"):
                err = "payment"
        elif t == "signature":
            if isinstance(v, dict) and v.get("kind") == "type" and _s(v.get("name"), 120):
                out = {"kind": "type", "name": _s(v.get("name"), 120)}
            elif isinstance(v, dict) and v.get("kind") == "draw" and str(v.get("data", "")).startswith("data:image/png;base64,") \
                    and len(v["data"]) < 200000:
                out = {"kind": "draw", "data": v["data"]}
            else:
                err = "signature"
        elif t == "file":
            items = [x for x in (v if isinstance(v, list) else []) if isinstance(x, dict) and isinstance(x.get("key"), str)]
            items = items[:b["props"].get("max_files", 1)]
            if not files_ok([x["key"] for x in items]):
                err = "file"
            out = [{"key": x["key"], "name": _s(x.get("name"), 120), "size": _num(x.get("size"), 0)} for x in items] or None
        if err is None and b.get("required") and is_empty(out):
            err = ("payment" if payment_link(b, raw) else "payment_choice") if t == "payment" else "required"
        if err:
            errors[bid] = err
        elif not is_empty(out):
            clean[bid] = out
    return clean, errors


def display(block, value):
    """An answer as plain text (emails, CSV, webhooks)."""
    if is_empty(value):
        return ""
    t = block["type"]
    if t in ("choice", "dropdown"):
        return str(_opt_label(block, value))
    if t in ("multi", "ranking"):
        return ", ".join(str(_opt_label(block, x)) for x in value)
    if t == "signature":
        return "Signed: " + value["name"] if value.get("kind") == "type" else "Signed (drawing)"
    if t == "file":
        return ", ".join(x.get("name") or "file" for x in value)
    if t == "consent":
        return "Yes"
    if t == "payment":
        return "Paid (confirmed by the person)" if value.get("confirmed") else ""
    return str(value)


def payment_link(block, answers):
    """The Stripe link a payment block uses for these answers: one link, or the one for the chosen option."""
    p = block.get("props") or {}
    if p.get("by"):
        return (p.get("links") or {}).get(answers.get(p["by"])) or ""
    return p.get("url") or ""


# ------------------------------------------------------------------------------------------- safety
def safety_problems(title, blocks, settings):
    """Phishing-style content that blocks publishing: [(what, where)]."""
    texts = [("the title", title or ""), ("the description", settings.get("description") or "")]
    for b in blocks:
        where = '"%s"' % ((b.get("label") or b["type"])[:50])
        texts.append((where, " ".join([b.get("label") or "", b.get("help") or "", b.get("placeholder") or ""] +
                                      [o["label"] for o in b.get("options") or []])))
    for e in settings.get("endings") or []:
        texts.append(("an ending", (e.get("title") or "") + " " + (e.get("text") or "")))
    found = []
    for where, txt in texts:
        low = txt.lower()
        for pattern, what in SENSITIVE:
            if re.search(pattern, low):
                found.append({"what": what, "where": where})
    return found[:10]


def public_blocks(blocks):
    """Blocks as respondents get them: no correct answers or accepted answers."""
    out = []
    for b in blocks:
        c = dict(b)
        c.pop("correct", None)
        if c.get("props", {}).get("accept"):
            c["props"] = dict(c["props"])
            c["props"].pop("accept")
            c["props"]["graded"] = True
        if b.get("correct"):
            c["graded"] = True
        out.append(c)
    return out
