"""The live results page (#r/<slug>): a form's results as charts that anyone with the link can see, only when the owner
turns it on (Edit -> Share -> "Live results page", settings.public_results).

Privacy rules (the whole point of this page, versus Google Forms' summary that shows everyone's typed answers):
- only questions with fixed answers are counted: choice, dropdown, multi, yes/no, rating, scale;
- typed text, emails, phones, files, signatures, hidden fields, calculations and payments are never sent;
- the "Other" option's typed text is counted as "Other", never shown;
- quiz forms never show which answer is correct;
- nothing is shown until MIN_ANSWERS people have answered, so one person's answers can't be picked out;
- drafts and paused forms show nothing.
Only totals leave the server: never a single person's answers.
"""
import anvil.server
from anvil.tables import app_tables

from . import common as C
from . import Logic as L

MIN_ANSWERS = 5
TYPES = ("choice", "dropdown", "multi", "yesno", "rating", "scale")

# the few words the page shows, in every form language (the page follows the form's language)
WORDS = {
    "en": {"answered": "answered", "yes": "Yes", "no": "No", "said_yes": "said yes", "avg": "average",
           "out_of": "out of %s on average", "nps": "Net Promoter Score", "other": "Other"},
    "fr": {"answered": "réponses", "yes": "Oui", "no": "Non", "said_yes": "ont dit oui", "avg": "moyenne",
           "out_of": "sur %s en moyenne", "nps": "Net Promoter Score", "other": "Autre"},
    "es": {"answered": "respuestas", "yes": "Sí", "no": "No", "said_yes": "dijeron que sí", "avg": "promedio",
           "out_of": "de %s en promedio", "nps": "Net Promoter Score", "other": "Otro"},
    "de": {"answered": "Antworten", "yes": "Ja", "no": "Nein", "said_yes": "sagten ja", "avg": "Durchschnitt",
           "out_of": "von %s im Durchschnitt", "nps": "Net Promoter Score", "other": "Andere"},
    "pt": {"answered": "respostas", "yes": "Sim", "no": "Não", "said_yes": "disseram sim", "avg": "média",
           "out_of": "de %s em média", "nps": "Net Promoter Score", "other": "Outro"},
    "lv": {"answered": "atbildes", "yes": "Jā", "no": "Nē", "said_yes": "teica jā", "avg": "vidēji",
           "out_of": "no %s vidēji", "nps": "Net Promoter Score", "other": "Cits"},
}


def _pct(n, d):
    return int(round(100.0 * n / d)) if d else 0


def _bars(rows, total):
    """rows = [(label, count)] in display order -> Items/Bar dicts (the most picked gets "top")."""
    mx = max([c for _, c in rows] + [1])
    top = max([c for _, c in rows] + [0])
    return [{"t": label, "v": "%d · %d%%" % (c, _pct(c, total)), "w": round(100.0 * c / mx, 1),
             "cls": "top" if c and c == top else ""} for label, c in rows]


def card(b, vals, num, w):
    """One question's totals in the shape Items/SummaryCard draws. vals = this question's non-empty answers."""
    t, n = b["type"], len(vals)
    props = b.get("props") or {}
    c = {"num": num, "title": b.get("label") or b.get("key") or "", "sub": "%d %s" % (n, w["answered"]),
         "wide": False, "empty": not n, "bigs": [], "bars": [], "hist": [], "nps": None, "texts": [], "notes": [],
         "icon": ""}
    if not n:
        return c
    if t in ("choice", "dropdown", "multi"):
        cnt = {}
        for v in vals:
            for x in (v if isinstance(v, list) else [v]):
                k = "other:" if isinstance(x, str) and x.startswith("other:") else x
                cnt[k] = cnt.get(k, 0) + 1
        rows = [(o.get("label") or "", cnt.get(o.get("id"), 0)) for o in (b.get("options") or [])]
        if cnt.get("other:"):
            rows.append((w["other"], cnt["other:"]))
        rows.sort(key=lambda r: -r[1])
        if len(rows) > 12:
            rows = [r for r in rows if r[1]][:12]
        c["bars"] = _bars(rows, n)
    elif t == "yesno":
        y = len([v for v in vals if v == "yes"])
        c["bigs"] = [{"b": "%d%%" % _pct(y, n), "s": w["said_yes"]}]
        c["bars"] = _bars([(w["yes"], y), (w["no"], n - y)], n)
    elif t == "rating":
        mx = int(props.get("max") or 5)
        nums = [v for v in vals if isinstance(v, (int, float))]
        if nums:
            c["bigs"] = [{"b": "%.1f" % (sum(nums) / float(len(nums))), "s": w["out_of"] % mx}]
        c["bars"] = _bars([("%d ★" % k, len([v for v in nums if v == k])) for k in range(mx, 0, -1)], n)
        for bar in c["bars"]:
            bar["cls"] = ""
    elif t == "scale":
        lo = 0 if props.get("min") is None else int(props.get("min"))
        hi = 10 if props.get("max") is None else int(props.get("max"))
        nums = [v for v in vals if isinstance(v, (int, float))]
        counts = [(s, len([v for v in nums if v == s])) for s in range(lo, hi + 1)]
        hm = max([x for _, x in counts] + [1])
        nps = lo == 0 and hi == 10
        mean = sum(nums) / float(len(nums)) if nums else 0
        if nps and nums:
            p = len([v for v in nums if v >= 9])
            d = len([v for v in nums if v <= 6])
            score = _pct(p, len(nums)) - _pct(d, len(nums))
            c["bigs"] = [{"b": ("+" if score > 0 else "") + str(score), "s": "%s · %s %.1f" % (w["nps"], w["avg"], mean)}]
        elif nums:
            c["bigs"] = [{"b": "%.1f" % mean, "s": w["avg"]}]
        c["hist"] = [{"label": str(s), "h": int(round(100.0 * x / hm)), "title": "%s: %s" % (s, x),
                      "cls": ("g" if s >= 9 else "p" if s >= 7 else "d") if nps else ""} for s, x in counts]
        c["wide"] = nps
    return c


def summary(f):
    """{title, n, enough, cards} for a form (no checks: callers check public_results and the status)."""
    s = f["settings"] or {}
    w = WORDS.get(s.get("lang") or "en", WORDS["en"])
    rows = list(app_tables.responses.search(form=f, status="complete"))
    n = len(rows)
    out = {"title": f["title"] or "", "slug": f["slug"], "n": n, "enough": n >= MIN_ANSWERS, "min": MIN_ANSWERS,
           "lang": s.get("lang") or "en", "accent": s.get("accent") or "", "cards": []}
    if n < MIN_ANSWERS:
        return out
    answers = [r["answers"] or {} for r in rows]
    i = 0
    for b in f["blocks"] or []:
        if b.get("type") in L.INPUTS and b.get("type") not in ("hidden", "calc"):
            i += 1
        if b.get("type") not in TYPES:
            continue
        vals = [a.get(b["id"]) for a in answers if not L.is_empty(a.get(b["id"]))]
        if not vals:
            continue
        out["cards"].append(card(b, vals, ("0" if i < 10 else "") + str(i), w))
    return out


@anvil.server.callable
def get_live_results(slug):
    """Public (no account): the live results page. Rate-limited per browser session."""
    if C.rate_limited("live_results", 60, 600):
        return C.fail("Too many refreshes. Wait a few minutes and try again.")
    slug = C.text(slug, 20)
    f = app_tables.forms.get(slug=slug) if slug else None
    if f is None:
        return C.fail("This form doesn't exist (or was deleted).")
    s = f["settings"] or {}
    if f["status"] in ("draft", "suspended") or not s.get("public_results"):
        return {"ok": True, "off": True, "title": f["title"] if f["status"] != "suspended" else ""}
    return C.ok(**summary(f))
