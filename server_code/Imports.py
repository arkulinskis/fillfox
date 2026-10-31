"""Import a Google Form from its public link. The server downloads the form page (the same page anyone with the link
sees) and reads the FB_PUBLIC_LOAD_DATA_ structure Google embeds in it. Nothing is saved here: the browser gets the
blocks back and creates the form with create_form, so the person can check it first.

Item layout (checked on real forms, Oct 2026): item = [id, title, description, type, [[entry id, options, required,
extra...], ...], ...]. Types: 0 short, 1 paragraph, 2 multiple choice, 3 dropdown, 4 checkboxes, 5 linear scale
(extra = [low label, high label]), 6 title/description, 7 grid (one row per entry, row label in entry[3]), 8 section,
9 date, 10 time, 11 image, 12 video, 13 file upload, 18 rating. Options are [label, ..., is_other].
"""
import json
import re

import anvil.server
import anvil.http

from . import common as C
from . import Logic as L

URL_OK = re.compile(r"^https://(docs\.google\.com/forms/(u/\d+/)?d/(e/)?[A-Za-z0-9_\-]+|forms\.gle/[A-Za-z0-9_\-]+)", re.I)


def _norm_url(url):
    url = C.text(url, 400).strip()
    if not URL_OK.match(url):
        return None
    if "docs.google.com" in url:
        url = re.sub(r"/(edit|viewanalytics|formResponse|prefill)([?#].*)?$", "/viewform", url.split("#")[0])
        if "/viewform" not in url:
            url = url.split("?")[0].rstrip("/") + "/viewform"
    return url


def _guess_short(label):
    low = (label or "").lower()
    if re.search(r"\be-?mail\b", low):
        return "email"
    if re.search(r"\b(phone|mobile|cell)\b", low):
        return "phone"
    if re.search(r"\b(website|url|linkedin|portfolio)\b", low):
        return "url"
    return "short"


def _opts(raw):
    out, other = [], False
    for i, o in enumerate(raw or []):
        if not isinstance(o, list) or not o:
            continue
        lab = o[0] if isinstance(o[0], str) else ""
        if len(o) > 4 and o[4] == 1 and not lab:
            other = True
            continue
        if lab:
            out.append({"id": "o%d" % i, "label": lab[:200]})
    return out, other


def parse(html):
    """(title, description, blocks, skipped) from a Google Form page, or raises ValueError with a readable reason."""
    m = re.search(r"FB_PUBLIC_LOAD_DATA_\s*=\s*(\[.*?\]);\s*</script>", html, re.S)
    if not m:
        if re.search(r"accounts\.google\.com/(ServiceLogin|v3/signin)", html):
            raise ValueError("That form needs a Google sign-in to open. Ask its owner to let anyone with the link respond.")
        raise ValueError("Couldn't find any questions. The form may be closed or not shared publicly.")
    try:
        d = json.loads(m.group(1))
        info = d[1]
        items = info[1] or []
    except (ValueError, IndexError, TypeError):
        raise ValueError("Google's page looked different than expected. Copy the questions and use Paste questions instead.")
    title = (info[8] if len(info) > 8 and isinstance(info[8], str) and info[8] else (d[3] if len(d) > 3 and isinstance(d[3], str) else "")) or "Imported form"
    desc = info[0] if isinstance(info[0], str) else ""
    blocks, skipped, n = [], [], 0

    def add(t, label, **kw):
        nonlocal n
        n += 1
        b = {"id": "g%d" % n, "type": t, "label": (label or "")[:600], "help": (kw.pop("help", "") or "")[:400],
             "required": bool(kw.pop("required", False)), "props": kw.pop("props", {})}
        b.update(kw)
        blocks.append(b)
        return b

    for it in items:
        if not isinstance(it, list) or len(it) < 4:
            continue
        label, help_, t = it[1] or "", it[2] if isinstance(it[2], str) else "", it[3]
        rows = it[4] if len(it) > 4 and isinstance(it[4], list) else []
        first = rows[0] if rows and isinstance(rows[0], list) else []
        req = len(first) > 2 and first[2] == 1
        options, other = _opts(first[1] if len(first) > 1 else [])
        if t == 0:
            add(_guess_short(label), label, help=help_, required=req)
        elif t == 1:
            add("long", label, help=help_, required=req)
        elif t in (2, 3, 4):
            kind = {2: "choice", 3: "dropdown", 4: "multi"}[t]
            if len(options) > 8 and kind == "choice" and not other:
                kind = "dropdown"
            add(kind, label, help=help_, required=req, options=options, props={"other": other and kind != "dropdown"})
        elif t == 5:
            nums = [int(o["label"]) for o in options if re.match(r"^-?\d+$", o["label"])]
            ends = first[3] if len(first) > 3 and isinstance(first[3], list) else []
            lo, hi = (min(nums), max(nums)) if nums else (1, 5)
            add("scale", label, help=help_, required=req, props={"min": max(0, min(1, lo)), "max": max(3, min(10, hi)),
                                                                 "low": (ends[0] if len(ends) > 0 and ends[0] else "")[:40],
                                                                 "high": (ends[1] if len(ends) > 1 and ends[1] else "")[:40]})
        elif t == 18:
            add("rating", label, help=help_, required=req, props={"max": max(3, min(10, len(options) or 5))})
        elif t == 7:
            for row in rows:
                if not isinstance(row, list) or len(row) < 2:
                    continue
                rl = row[3][0] if len(row) > 3 and isinstance(row[3], list) and row[3] else ""
                cols, _ = _opts(row[1])
                add("choice", (label + ": " + rl) if rl else label, help=help_, required=len(row) > 2 and row[2] == 1, options=cols)
        elif t == 6:
            if label:
                add("heading", label, props={"size": "h3"})
            if help_:
                add("text", help_)
        elif t == 8:
            add("page", label)
            if help_:
                add("text", help_)
        elif t == 9:
            add("date", label, help=help_, required=req)
        elif t == 10:
            add("time", label, help=help_, required=req)
        elif t == 13:
            add("file", label, help=help_, required=req, props={"max_files": 1})
        else:
            skipped.append({"label": label[:80], "why": {11: "image", 12: "video"}.get(t, "unsupported question type %s" % t)})
    if not [b for b in blocks if b["type"] in L.INPUTS]:
        raise ValueError("That form has no questions Fillfox can import.")
    return title[:160], desc[:2000], blocks, skipped


@anvil.server.callable(require_user=True)
def import_google_form(url):
    C.require_user()
    u = _norm_url(url)
    if not u:
        return C.fail("Paste the form's link: it starts with https://docs.google.com/forms/ or https://forms.gle/.")
    if C.rate_limited("gimport", 20, 3600):
        return C.fail("That's a lot of imports in an hour. Try again later.")
    try:
        html = anvil.http.request(u, headers={"User-Agent": "Mozilla/5.0 (Fillfox form import)", "Accept-Language": "en"})
        html = html.get_bytes().decode("utf-8", "replace") if hasattr(html, "get_bytes") else str(html)
    except anvil.http.HttpError as e:
        code = getattr(e, "status", 0)
        return C.fail("Google answered %s. Check that the form is shared with anyone who has the link." % code if code
                      else "Couldn't reach Google Forms. Try again in a moment.")
    except Exception:
        return C.fail("Couldn't reach Google Forms. Try again in a moment.")
    try:
        title, desc, blocks, skipped = parse(html)
    except ValueError as e:
        return C.fail(str(e))
    cleaned = L.clean_blocks(blocks)
    return C.ok(title=title, settings={"description": desc}, blocks=cleaned, skipped=skipped,
                questions=len([b for b in cleaned if b["type"] in L.INPUTS]))
