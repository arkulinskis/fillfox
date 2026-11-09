"""Demo content, so the app never looks empty: five example forms with realistic (fictional) answers.
Loaded automatically the first time anyone opens the app (ensure_loaded), removed or reloaded from
Admin -> Demo data. Removing it is remembered: it doesn't come back by itself.

Demo users have is_demo=True and @example.com emails; they can't sign in (no password). Every demo row
is flagged is_demo=True, so remove() deletes exactly what load() added. Signed-in people see the demo
forms as read-only "Examples" and can copy them into their account.
"""
import datetime as dt
import random

from anvil.tables import app_tables

from . import common as C
from . import Logic as L

DEMO_USERS = [
    ("Maya Chen", "maya.demo@example.com"),
    ("Theo Martin", "theo.demo@example.com"),
    ("Ines Ozola", "ines.demo@example.com"),
]
# Tables that hold demo rows (each has an is_demo column). Children before parents.
DEMO_TABLES = ["files", "reports", "responses", "forms"]


def opt(*labels, values=None):
    out = []
    for i, lab in enumerate(labels):
        o = {"id": "o%d" % i, "label": lab}
        if values:
            o["value"] = values[i]
        out.append(o)
    return out


def q(bid, t, label, **kw):
    b = {"id": bid, "type": t, "label": label, "help": kw.pop("help", ""), "required": kw.pop("required", False),
         "props": kw.pop("props", {})}
    b.update(kw)
    return b


CAFE = {
    "title": "Café Lumière: how was your visit?", "owner": 0,
    "settings": {"description": "Two minutes, seven questions. Every answer is read by Lou, who runs the café.",
                 "layout": "focus", "accent": "#ff4f1f", "font": "grotesk", "cover": "band",
                 "endings": [{"id": "end", "title": "Merci, {first_name}!", "text": "Your answers go straight to Lou. See you soon at Lumière."}]},
    "blocks": [
        q("cafname", "short", "What's your first name?", key="first_name", placeholder="Lou"),
        q("cafnps", "scale", "How likely are you to recommend Lumière to a friend?", required=True, key="recommend",
          props={"min": 0, "max": 10, "low": "Not likely", "high": "Very likely"}),
        q("cafwhat", "multi", "What did you have today?", key="ordered",
          options=opt("Espresso drink", "Filter coffee", "Tea", "Pastry", "Lunch")),
        q("cafcof", "rating", "How was the coffee, {first_name}?", key="coffee", props={"max": 5}),
        q("cafsrv", "rating", "And the service?", key="service", props={"max": 5}),
        q("cafbet", "long", "Anything we could do better?", key="better", placeholder="Music, seats, opening hours..."),
        q("cafmail", "email", "Want a free croissant on your next visit? Leave your email.", key="email",
          help="We send one email with the code, nothing else."),
    ],
    "n": 72, "partial": 19, "views": 140,
}
MEETUP = {
    "title": "Montréal Maker Meetup: RSVP", "owner": 1,
    "settings": {"description": "Free evening meetups at the Mile End library annex. Snacks provided, projects encouraged.",
                 "layout": "classic", "accent": "#1f5eff", "font": "plex", "cover": "grid", "save_partial": True,
                 "endings": [{"id": "end", "title": "You're on the list", "text": "See you on {night}. Doors open at 18:30."}]},
    "blocks": [
        q("mmhead", "heading", "About you", props={"size": "h2"}),
        q("mmname", "short", "Full name", required=True, key="name"),
        q("mmmail", "email", "Email", required=True, key="email", help="Only for the reminder the day before."),
        q("mmnight", "choice", "Which night?", required=True, key="night",
          options=opt("Thursday, November 13", "Thursday, November 20")),
        q("mmpage", "page", "Your projects"),
        q("mminto", "multi", "What are you into?", key="interests",
          options=opt("Electronics", "3D printing", "Woodworking", "Code", "Textiles", "Repair"), props={"other": True}),
        q("mmshow", "yesno", "Are you bringing a project to show?", key="showing"),
        q("mmabout", "long", "Tell us about it in a sentence or two", key="project",
          logic={"match": "all", "rules": [{"q": "mmshow", "op": "eq", "v": "yes"}]}),
        q("mmguests", "number", "Bringing guests?", key="guests", props={"min": 0, "max": 3}, help="Up to 3."),
        q("mmok", "consent", "I'm OK with photos of the evening being shared on the meetup's page.", key="photos"),
    ],
    "n": 38, "partial": 11, "views": 96,
}
QUIZ = {
    "title": "Quiz: how well do you know Québec?", "owner": 2,
    "settings": {"description": "Five questions. No googling!", "layout": "focus", "accent": "#7a3cff", "font": "grotesk",
                 "cover": "dots", "quiz": True, "show_score": True,
                 "endings": [{"id": "e3", "title": "Expert level", "text": "{score} out of 5. You could guide the tour yourself.", "min_score": 4},
                             {"id": "e2", "title": "Getting there", "text": "{score} out of 5. A weekend in Québec City would finish the job.", "min_score": 2},
                             {"id": "e1", "title": "Road trip time", "text": "{score} out of 5. Pack a bag: there's a lot to discover."}]},
    "blocks": [
        q("qzcap", "choice", "What is the capital of Québec?", key="capital", required=True,
          options=opt("Montréal", "Québec City", "Gatineau", "Sherbrooke"), correct=["o1"]),
        q("qzriv", "choice", "Which river flows past both Montréal and Québec City?", key="river", required=True,
          options=opt("Ottawa River", "Saguenay", "St. Lawrence", "Richelieu"), correct=["o2"]),
        q("qzyear", "choice", "When was Québec City founded?", key="founded", required=True,
          options=opt("1534", "1608", "1642", "1759"), correct=["o1"]),
        q("qzmotto", "choice", "Finish the motto on Québec licence plates: \"Je me ...\"", key="motto", required=True,
          options=opt("souviens", "rappelle", "lève", "promène"), correct=["o0"]),
        q("qzpou", "short", "Fries, cheese curds and gravy: what's the dish called?", key="dish", required=True,
          props={"accept": ["poutine"]}),
    ],
    "n": 54, "partial": 9, "views": 88,
}
BUGS = {
    "title": "Report a bug in Tidy Tasks", "owner": 0,
    "settings": {"description": "Found something broken in the Tidy Tasks app? Tell us what happened.",
                 "layout": "classic", "accent": "#0a0a0a", "font": "mono", "cover": "none",
                 "endings": [{"id": "end", "title": "Thanks, we're on it", "text": "We read every report within two working days."}]},
    "blocks": [
        q("bgarea", "dropdown", "Where did it happen?", required=True, key="area",
          options=opt("Sign in", "Task list", "Reminders", "Sharing", "Settings", "Somewhere else")),
        q("bgtitle", "short", "Sum it up in a few words", required=True, key="summary", placeholder="Reminders fire twice"),
        q("bgsteps", "long", "What did you do, and what happened?", required=True, key="steps",
          placeholder="1. Opened... 2. Tapped... 3. Saw..."),
        q("bgsev", "choice", "How bad is it?", required=True, key="severity",
          options=opt("Annoying", "I can work around it", "I'm blocked")),
        q("bgfile", "file", "Screenshot or screen recording", key="screenshot", props={"max_files": 2}),
        q("bgmail", "email", "Email, if you'd like an update", key="email"),
    ],
    "n": 17, "partial": 6, "views": 41,
}
QUOTE = {
    "title": "Workshop quote: team kombucha class", "owner": 1,
    "settings": {"description": "Pick your options and see the price straight away. We'll confirm by email.",
                 "layout": "classic", "accent": "#11804a", "font": "serif", "cover": "band",
                 "endings": [{"id": "end", "title": "Your quote: ${total}", "text": "We'll email {email} within a day to book a date."}]},
    "blocks": [
        q("kqppl", "number", "How many people?", required=True, key="people", props={"min": 4, "max": 40}),
        q("kqlen", "choice", "How long?", required=True, key="length",
          options=opt("Short taster (1 hour)", "Full class (2.5 hours)", values=[150, 320])),
        q("kqext", "multi", "Extras", key="extras", options=opt("Take-home starter kit", "Snacks", "Private room", values=[90, 60, 120])),
        q("kqtot", "calc", "Total (CAD, before tax)", key="total",
          props={"formula": "{length} + {people} * 22 + {extras}", "show": True, "decimals": 0, "prefix": "$"}),
        q("kqmail", "email", "Your email", required=True, key="email"),
        q("kqdate", "date", "Preferred date", key="date"),
    ],
    "n": 12, "partial": 4, "views": 37,
}
FORMS = [CAFE, MEETUP, QUIZ, BUGS, QUOTE]
SLUGS = ["democafe", "demomeetup", "demoquebec", "demobugs", "demokombucha"]

FIRST = ["Lea", "Sam", "Noor", "Gabriel", "Chloe", "Amir", "Rosalie", "Jun", "Felix", "Priya", "Olivier", "Maelle", "Kofi",
         "Sofia", "Mathis", "Hana", "Emile", "Zoe", "Rafael", "Ines", "Lucas", "Anais", "Tomas", "Yara"]
LAST = ["Tremblay", "Gagnon", "Roy", "Nguyen", "Cote", "Haddad", "Bouchard", "Kim", "Lavoie", "Singh", "Pelletier", "Okafor"]
BETTER = ["More plant milk options, please.", "The music was a bit loud around noon.", "Open earlier on weekends!",
          "Nothing, it's perfect.", "A few more power outlets near the window.", "The almond croissant ran out by 10.",
          "Bigger tables for laptops.", "Loved the new seasonal latte.", "The line was long but moved fast.", "",
          "Could you bring back the oat cookies?", "More seats outside in summer."]
PROJECTS = ["A plant watering robot made from an old printer.", "A quilt with LED constellations.",
            "Repairing a 1970s radio.", "A tiny weather station for my balcony.", "A laser-cut chess set.",
            "A keyboard I built and soldered myself."]
BUG_SUMMARY = ["Reminders fire twice", "Can't share a list", "Dark mode text unreadable", "App logs me out daily",
               "Due dates shift by a day", "Sync stuck on 'saving'"]
BUG_STEPS = ["Opened the app, set a reminder for 9:00, got two notifications.",
             "Tapped Share, picked a friend, nothing happened.",
             "Switched to dark mode and the task titles turned black on black."]


def _answers(blocks, rnd, i):
    a = {}
    first, last = rnd.choice(FIRST), rnd.choice(LAST)
    for b in blocks:
        t, bid, key = b["type"], b["id"], b.get("key")
        if t in L.LAYOUT or t in ("calc", "file", "hidden"):
            continue
        if not b.get("required") and rnd.random() < 0.18:
            continue
        if t == "short":
            a[bid] = {"first_name": first, "name": first + " " + last, "summary": rnd.choice(BUG_SUMMARY),
                      "dish": rnd.choice(["poutine", "Poutine", "poutine", "tourtiere", "poutine"])}.get(key, "Example")
        elif t == "email":
            a[bid] = "%s.%s%d@example.com" % (first.lower(), last.lower(), i)
        elif t == "long":
            a[bid] = rnd.choice(PROJECTS if key == "project" else BETTER if key == "better" else BUG_STEPS)
            if not a[bid]:
                a.pop(bid)
        elif t == "scale":
            a[bid] = rnd.choice([10, 10, 9, 9, 9, 8, 8, 7, 10, 6, 9, 5, 10, 8, 3])
        elif t == "rating":
            a[bid] = rnd.choice([5, 5, 4, 5, 4, 3, 5, 4, 2, 5])
        elif t in ("choice", "dropdown"):
            opts = b["options"]
            if b.get("correct") and rnd.random() < 0.62:
                a[bid] = b["correct"][0]
            else:
                a[bid] = rnd.choices([o["id"] for o in opts], weights=[5, 3, 2, 1, 1, 1][:len(opts)])[0]
        elif t == "multi":
            opts = [o["id"] for o in b["options"]]
            a[bid] = rnd.sample(opts, rnd.randint(1, min(3, len(opts))))
        elif t == "yesno":
            a[bid] = "yes" if rnd.random() < 0.35 else "no"
        elif t == "number":
            lo = b["props"].get("min") or 0
            hi = b["props"].get("max") or 10
            a[bid] = rnd.randint(lo, min(hi, lo + 12))
        elif t == "consent":
            a[bid] = True
        elif t == "date":
            a[bid] = (dt.date.today() + dt.timedelta(days=rnd.randint(14, 60))).isoformat()
    clean, _ = L.check_answers(blocks, a)   # drops answers to questions the logic hides
    return clean


def state():
    return C.get_setting("demo", "never")  # "never" | "loaded" | "removed"


def ensure_loaded():
    """Call from the app's main data callables: loads the demo once, unless an admin removed it."""
    if state() == "never":
        load()


def build_form(spec, owner, rnd, is_demo=True, slug=None):
    """A live form with answers spread over the last month (also used by the dev server for Ana's own forms)."""
    blocks = L.clean_blocks(spec["blocks"])
    settings = L.clean_settings(spec["settings"])
    created = C.now() - dt.timedelta(days=34)
    f = app_tables.forms.add_row(owner=owner, title=spec["title"], slug=slug or L.uid(7), blocks=blocks, settings=settings,
                                 status="live", rev=1, collaborators=[], created=created, updated=created + dt.timedelta(days=2),
                                 published=created + dt.timedelta(days=2), views=spec["views"], starts=spec["n"] + spec["partial"],
                                 responses_n=spec["n"], reports_n=0, webhook_log=[], is_demo=is_demo)
    rows, last = [], None
    inputs = [b for b in blocks if b["type"] in L.INPUTS]
    for i in range(spec["n"]):
        ans = _answers(blocks, rnd, i)
        vis = L.visible_ids(blocks, ans)
        got, best = L.score(blocks, ans, vis)
        ans.update({k: v for k, v in L.calc_values(blocks, ans, got).items() if k in vis})
        start = C.now() - dt.timedelta(days=rnd.random() ** 1.4 * 30, minutes=rnd.randint(0, 600))
        secs = rnd.randint(35, 260)
        sub = start + dt.timedelta(seconds=secs)
        last = sub if last is None or sub > last else last
        rows.append(dict(form=f, token=L.uid(20), status="complete", answers=ans, score=got if settings["quiz"] else None,
                         reached=len(inputs), meta={"seconds": secs, "device": rnd.choice(["phone", "phone", "desktop", "tablet"])},
                         started=start, submitted=sub, is_demo=is_demo))
    for i in range(spec["partial"]):
        reached = int(rnd.random() ** 1.6 * (len(inputs) - 1))
        ans = _answers(blocks, rnd, 900 + i)
        keep = {b["id"] for b in inputs[:reached]}
        rows.append(dict(form=f, token=L.uid(20), status="partial", reached=reached,
                         answers={k: v for k, v in ans.items() if k in keep} if settings["save_partial"] else {},
                         meta={}, started=C.now() - dt.timedelta(days=rnd.random() * 30), is_demo=is_demo))
    for i in range(0, len(rows), 300):
        app_tables.responses.add_rows(rows[i:i + 300])
    f["last_response"] = last
    return f


def load():
    remove(remember=False)
    users = []
    for name, email in DEMO_USERS:
        u = app_tables.users.get(email=email) or app_tables.users.add_row(email=email, enabled=False)
        u.update(display_name=name, is_demo=True, signed_up=C.now() - dt.timedelta(days=40))
        users.append(u)
    rnd = random.Random(7)
    for spec, slug in zip(FORMS, SLUGS):
        if app_tables.forms.get(slug=slug) is None:
            sp: dict = spec
            build_form(sp, users[sp["owner"]], rnd, slug=slug)
    C.set_setting("demo", "loaded")
    return counts()


def remove(remember=True):
    for name in DEMO_TABLES:
        for r in getattr(app_tables, name).search(is_demo=True):
            r.delete()
    for u in app_tables.users.search(is_demo=True):
        u.delete()
    if remember:
        C.set_setting("demo", "removed")
    return counts()


def counts():
    out = {"users": len(app_tables.users.search(is_demo=True))}
    for name in DEMO_TABLES:
        out[name] = len(getattr(app_tables, name).search(is_demo=True))
    return out
