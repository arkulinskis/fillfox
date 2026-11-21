import anvil.server
from anvil import *
from anvil.js import window

from ._anvil_designer import LiveResultsTemplate
from ... import ff, router, state


class LiveResults(LiveResultsTemplate):
    """#r/<slug>: a form's live results page, only when the owner turns it on (Edit -> Share -> "Live results page").
    Anyone with the link sees totals as charts (Items/SummaryCard, from LiveResults.get_live_results): fixed-answer
    questions only, never typed answers, and nothing until 5 people have answered. No account, no Shell (like #f),
    in the form's language (FF.T words), with "Answer this form" and the Fillfox footer that brings new creators."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        state.heading(self.title, 1)
        state.heading(self.closed_title, 1)
        self._slug = args[0] if args else ""
        state.set_control_attr(self.refresh_button, "aria-label", "Refresh")
        state.set_control_attr(self.refresh_button, "title", "Refresh")
        self.main_box.visible = self.closed_box.visible = False
        self.load()

    def load(self):
        try:
            d: dict = anvil.server.call("get_live_results", self._slug)
        except Exception as e:
            print("get_live_results failed: %r" % e)
            d = {"ok": False, "error": "These results didn't load. Check your connection and try again."}
        self.loading_box.visible = False
        t = ff.tr(str(d.get("lang") or "en"))
        self.dom_nodes["made"].textContent = t.get("made") or "Made with Fillfox"
        self.dom_nodes["make_own"].textContent = t.get("makeOwn") or "Make your own forms, free."
        if not d.get("ok") or d.get("off"):
            title = str(d.get("title") or "")
            self.closed_title.text = title
            self.closed_title.visible = bool(title)
            self.closed_message.text = str(d.get("error") or t.get("notShared") or "These results aren't shared.")
            self.closed_box.visible = True
            self.main_box.visible = False
            window.document.title = (title + " · " if title else "") + "Fillfox"
            return
        self.main_box.visible = True
        self.closed_box.visible = False
        title = str(d.get("title") or "Untitled form")
        window.document.title = title + " · " + (t.get("live") or "Live results") + " · Fillfox"
        self.title.text = title
        n = int(d.get("n") or 0)
        self.count_label.text = "%s · %d %s" % (t.get("live") or "Live results", n, t.get("answers") or "answers")
        enough = bool(d.get("enough"))
        cards = d.get("cards") or []
        self.cards_panel.items = cards if enough else []
        self.cards_panel.visible = enough and bool(cards)
        self.wait_box.visible = not enough
        self.wait_text.text = (t.get("wait") or "Results appear after {n} answers. So far: {k}.").replace(
            "{n}", str(d.get("min") or 5)).replace("{k}", str(n))
        self.totals_note.text = t.get("totals") or ""
        state.set_attr(self.answer_link, "href", router.href("f", d.get("slug") or self._slug))
        self.dom_nodes["answer_text"].textContent = t.get("answerIt") or "Answer this form"

    @handle("refresh_button", "click")
    def refresh_button_click(self, **event_args):
        self.load()
        state.toast("Up to date", "ok")
