import anvil.server
from anvil import *

from ._anvil_designer import ResultsTemplate
from ... import ff, router, state

TABS = ("summary", "answers", "dropoff", "unfinished")


def _median(xs):
    a = sorted(xs)
    m = len(a) // 2
    if not a:
        return 0
    return a[m] if len(a) % 2 else (a[m - 1] + a[m]) / 2.0


def _pct(n, d):
    return int(round(100.0 * n / d)) if d else 0


class Results(ResultsTemplate):
    """#results/<id>[/answers|dropoff|unfinished]: what people answered. Summary (a card per question: bars, NPS, quiz
    scores, latest text answers), every answer (search, open one, delete, erase a person, CSV), the drop-off funnel and
    unfinished answers. The numbers come from FF.results (ff-results.js, same maths as the JavaScript version); this page
    draws them with RepeatingPanels. Demo examples are read-only ("Use a copy")."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        state.heading(self.heading, 1)
        self._id = args[0] if args else ""
        self._tab = args[1] if len(args) > 1 and args[1] in TABS else "summary"
        self._query = ""
        self.rows_panel.add_event_handler("x-open", self._open)
        self.load()

    def load(self):
        try:
            d = anvil.server.call("get_results", self._id)
        except Exception as e:
            if type(e).__name__ != "PermissionDenied":
                raise
            self.main_part.visible = False
            self.denied_text.text = str(e) or "You don't have access to that form."
            return
        self.denied_box.visible = False
        self._d = d
        self._frame()
        self._draw()

    # ---- the frame: title, buttons, numbers, tabs
    def _frame(self):
        d, f = self._d, self._d["form"]
        ro = d["role"] == "viewer"
        self.heading.text = f.get("title") or "Untitled form"
        text, colour = ff.status(f.get("status"), f.get("open"))
        self.status_badge.text = text
        self.status_badge.role = ["badge"] + (["badge-" + colour] if colour else [])
        self.demo_note.text = ("Example by %s · made-up people" % f.get("owner")) if f.get("demo") else ""
        self.dup_button.visible = ro
        self.edit_link.visible = not ro
        state.set_attr(self.edit_link, "href", router.href("edit", self._id))
        state.set_attr(self.open_link, "href", router.href("f", f.get("slug")))
        self.ro_note.visible = ro
        fu, rs = d["funnel"], d["responses"]
        secs = [r.get("seconds") for r in rs if r.get("seconds")]
        phones = len([r for r in rs if r.get("device") == "phone"])
        self.k_views.text = str(fu["views"])
        self.k_starts.text = str(fu["starts"])
        self.k_done.text = str(len(rs))
        self.k_rate.text = "%d%%" % _pct(len(rs), fu["starts"])
        self.k_min.text = str(round(_median(secs) / 6.0) / 10.0) if secs else "–"
        self.k_phone.text = "%d%%" % _pct(phones, len(rs))
        self.n_answers.text = str(len(rs))
        self.n_unfinished.text = str(d.get("partial_count") or 0)
        for name, link in (("summary", self.tab_summary), ("answers", self.tab_answers),
                           ("dropoff", self.tab_dropoff), ("unfinished", self.tab_unfinished)):
            state.set_attr(link, "href", router.href("results", self._id, name))
            link.classes["on"] = name == self._tab
            state.set_attr(link, "aria-current", "page" if name == self._tab else None)
        self.erase_button.visible = self.delall_button.visible = not ro

    def _draw(self):
        self.summary_part.visible = self._tab == "summary"
        self.table_part.visible = self._tab in ("answers", "unfinished")
        self.dropoff_part.visible = self._tab == "dropoff"
        if self._tab == "summary":
            self._summary()
        elif self._tab == "dropoff":
            self._dropoff()
        else:
            self._table()

    # ---- summary
    def _summary(self):
        d = self._d
        has = bool(d["responses"])
        self.cards_panel.items = ff.results_summary(d) if has else []
        self.cards_panel.visible = has
        self.no_answers.visible = not has
        self.share_link.visible = d["role"] != "viewer"
        state.set_attr(self.share_link, "href", router.href("edit", self._id, "share"))

    # ---- answers / unfinished
    def _table(self):
        d, partial = self._d, self._tab == "unfinished"
        f = d["form"]
        hidden = partial and not (f["settings"].get("save_partial") or f.get("demo"))
        self.not_kept.visible = hidden
        self.table_box.visible = not hidden
        self.partial_intro.visible = partial
        if hidden:
            self.not_kept_title.text = "%d people started but didn't finish." % (d.get("partial_count") or 0)
            self.settings_link.visible = d["role"] != "viewer"
            state.set_attr(self.settings_link, "href", router.href("edit", self._id, "settings"))
            return
        t = ff.results_table(d, partial, self._query)
        self.row_count.text = state.plural(t["count"], "unfinished answer" if partial else "answer")
        self.delall_button.text = "Delete all"
        n = len(t["cols"])
        self.dom_nodes["table"].style.setProperty("--cols", str(n))
        self.head_panel.items = [{"text": c, "head": True} for c in t["cols"]]
        self.rows_panel.items = t["rows"]
        self.table_wrap.visible = bool(t["rows"])
        self.more_note.visible = bool(t["more"])
        self.no_rows.visible = not t["rows"]
        self.no_rows_text.text = "Nothing matches" if self._query else ("No unfinished answers" if partial else "No answers yet")

    @handle("search_box", "change")
    def search_box_change(self, **event_args):
        self._query = self.search_box.text or ""
        self._table()

    def _open(self, response_id, **event_args):
        from ...Dialogs.AnswerDetail import AnswerDetail
        det = ff.results_detail(self._d, response_id)
        if det and alert(AnswerDetail(detail=det), buttons=[], large=True, role="app-dialog") == "delete":
            if state.call("delete_response", self._id, response_id):
                state.toast("Deleted")
                self.load()

    @handle("delall_button", "click")
    def delall_button_click(self, **event_args):
        which = "partial" if self._tab == "unfinished" else "all"
        title = "Delete every unfinished answer?" if which == "partial" else "Delete every answer?"
        if confirm("Uploaded files go too. This can't be undone.", title=title,
                   buttons=[("Cancel", False), ("Delete all", True)], role="app-dialog"):
            r = state.call("delete_all_responses", self._id, which)
            if r:
                state.toast(state.plural(r.get("deleted") or 0, "answer") + " deleted")
                self.load()

    @handle("erase_button", "click")
    def erase_button_click(self, **event_args):
        from ...Dialogs.EraseAnswers import EraseAnswers
        text = alert(EraseAnswers(), buttons=[], role="app-dialog")
        if text:
            r = state.call("erase_respondent", self._id, text)
            if r:
                n = r.get("deleted") or 0
                state.toast(state.plural(n, "answer") + " erased" if n else "No answer contained that.", "ok" if n else None)
                self.load()

    # ---- drop-off
    def _dropoff(self):
        fu = ff.results_funnel(self._d)
        started = bool(fu.get("started"))
        self.callout.visible = bool(fu.get("callout")) and started
        if fu.get("callout"):
            self.callout_title.text = fu["callout"]["title"]
            self.callout_text.text = fu["callout"]["text"]
        self.funnel_panel.items = fu["steps"] if started else []
        self.funnel_panel.visible = self.funnel_note.visible = started
        self.no_starts.visible = not started

    # ---- buttons
    @handle("csv_button", "click")
    def csv_button_click(self, **event_args):
        ff.results_csv(self._d)

    @handle("dup_button", "click")
    def dup_button_click(self, **event_args):
        r = state.call("duplicate_form", self._id)
        if r:
            state.toast("Copied into your forms", "ok")
            router.go("edit", r["id"])
