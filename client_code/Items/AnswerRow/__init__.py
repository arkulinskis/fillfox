from anvil import *

from ._anvil_designer import AnswerRowTemplate


class AnswerRow(AnswerRowTemplate):
    """One answer in the Results table: when it was sent (or how far it got), the score, the first five questions.
    item = {id, cells}. Click or Enter -> x-open(response_id) on the panel (the page opens Dialogs/AnswerDetail)."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.cells.items = [{"text": c} for c in self.item.get("cells") or []]
        self.dom_nodes["row"].setAttribute("aria-label", "Open the answer from " + (self.item.get("cells") or [""])[0])

    def row_click(self, event):
        self.parent.raise_event("x-open", response_id=self.item["id"])

    def row_key(self, event):
        if getattr(event, "key", None) == "Enter" or getattr(event, "key", None) == " ":
            event.preventDefault()
            self.row_click(event)
