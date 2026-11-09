from anvil import *

from ._anvil_designer import AdminFormRowTemplate
from ... import ff, state

DONE = {"suspend": "Form paused", "restore": "Form live again", "dismiss": "Reports closed"}


class AdminFormRow(AdminFormRowTemplate):
    """A form in Admin -> Forms and inside each report: status, open reports, owner, answers, and the moderation buttons
    (pause / restore / dismiss reports: admin_moderate). After a change it raises x-changed on its panel."""

    def __init__(self, **properties):
        super().__init__(**properties)
        f = self.item or {}
        text, colour = ff.status(f.get("status"))
        self.status_badge.text = text
        self.status_badge.role = ["badge"] + (["badge-" + colour] if colour else [])
        self.status_badge.visible = bool(text)
        n = f.get("reports") or 0
        self.reports_badge.text = state.plural(n, "open report")
        self.reports_badge.visible = bool(n)
        self.demo_badge.visible = bool(f.get("demo"))
        self.owner.text = "%s · %s" % (f.get("owner") or "", f.get("owner_email") or "")
        self.answers.text = state.plural(f.get("responses") or 0, "answer")
        self.title_link.text = f.get("title") or "Untitled form"
        self.title_link.url = "#f/" + (f.get("slug") or "")
        suspended = f.get("status") == "suspended"
        self.restore_button.visible = suspended
        self.suspend_button.visible = not suspended
        self.dismiss_button.visible = bool(n)

    def _act(self, action):
        if state.call("admin_moderate", self.item["id"], action):
            state.toast(DONE[action], "ok")
            if self.parent is not None:
                self.parent.raise_event("x-changed")

    @handle("restore_button", "click")
    def restore_button_click(self, **event_args):
        self._act("restore")

    @handle("suspend_button", "click")
    def suspend_button_click(self, **event_args):
        self._act("suspend")

    @handle("dismiss_button", "click")
    def dismiss_button_click(self, **event_args):
        self._act("dismiss")
