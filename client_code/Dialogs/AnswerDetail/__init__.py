from anvil import *

from ._anvil_designer import AnswerDetailTemplate
from ... import state


class AnswerDetail(AnswerDetailTemplate):
    """One answer, every question (FF.results.detail): signatures, files, emails, Stripe payments. Closes with
    "delete" (the page deletes it) or None."""

    def __init__(self, detail=None, **properties):
        super().__init__(**properties)
        d = detail or {}
        self.title.text = d.get("title") or "Answer"
        state.heading(self.title, 2)
        self.sub.text = d.get("sub") or ""
        self.fields_panel.items = d.get("fields") or []
        self.delete_button.visible = bool(d.get("can_delete"))

    @handle("close_button", "click")
    def close_button_click(self, **event_args):
        self.raise_event("x-close-alert", value=None)

    @handle("delete_button", "click")
    def delete_button_click(self, **event_args):
        self.raise_event("x-close-alert", value="delete")
