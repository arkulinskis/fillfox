from anvil import *

from ._anvil_designer import ReportRowTemplate
from ... import state

REASONS = {"phishing": "Asks for passwords or bank details", "spam": "Spam or scam", "illegal": "Illegal or harmful",
           "impersonation": "Pretends to be someone else", "other": "Something else"}


class ReportRow(ReportRowTemplate):
    """An open report in Admin -> Reports: reason, when, who (optional email), details, and the reported form with its
    moderation buttons (Items/AdminFormRow in a one-item panel). A change raises x-changed on this row's panel so the
    page reloads the list."""

    def __init__(self, **properties):
        super().__init__(**properties)
        r = self.item
        self.reason.text = REASONS.get(r.get("reason"), r.get("reason") or "")
        self.when.text = state.date_time(r.get("created"))
        self.email_link.text = r.get("email") or ""
        self.email_link.url = ("mailto:" + r["email"]) if r.get("email") else ""
        self.email_link.visible = bool(r.get("email"))
        self.details.text = r.get("details") or ""
        self.details.visible = bool(r.get("details"))
        self.gone.visible = not r.get("form")
        self.form_panel.items = [r["form"]] if r.get("form") else []
        self.form_panel.add_event_handler("x-changed", self._changed)

    def _changed(self, **event_args):
        if self.parent is not None:
            self.parent.raise_event("x-changed")
