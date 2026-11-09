from anvil import *

from ._anvil_designer import ReportFormTemplate
from ... import state


class ReportForm(ReportFormTemplate):
    """"Report this form" (the link in every form's footer): a reason, details, an optional email -> report_form.
    Three open reports pause a live form until an admin looks (server side)."""

    def __init__(self, slug="", **properties):
        super().__init__(**properties)
        self._slug = slug
        state.set_control_attr(self.email_box, "autocomplete", "email")

    def _reason(self):
        for rb in (self.r_phishing, self.r_spam, self.r_impersonation, self.r_illegal, self.r_other):
            if rb.selected:
                return rb.value
        return "other"

    @handle("cancel_button", "click")
    def cancel_button_click(self, **event_args):
        self.raise_event("x-close-alert", value=None)

    @handle("send_button", "click")
    def send_button_click(self, **event_args):
        self.send_button.enabled = False
        try:
            r = state.call("report_form", self._slug, self._reason(), self.details_box.text or "", self.email_box.text or "")
        finally:
            self.send_button.enabled = True
        if r:
            state.toast("Thank you. We'll look at it.", "ok")
            self.raise_event("x-close-alert", value=True)
