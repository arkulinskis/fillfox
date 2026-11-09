from anvil import *
from anvil.js import window

from ._anvil_designer import FormMoreTemplate
from ... import router, state


class FormMore(FormMoreTemplate):
    """More for one form: Duplicate, Preview (the draft as people will see it), Delete (owners only).
    Closes with "dup", "del" or None; the dashboard does the work."""

    def __init__(self, form=None, **properties):
        super().__init__(**properties)
        self._form = form or {}
        self.title.text = self._form.get("title") or "Untitled form"
        state.heading(self.title, 2)
        self.delete_button.visible = self._form.get("role") == "owner"

    @handle("dup_button", "click")
    def dup_button_click(self, **event_args):
        self.raise_event("x-close-alert", value="dup")

    @handle("preview_button", "click")
    def preview_button_click(self, **event_args):
        self.raise_event("x-close-alert", value=None)
        window.location.hash = router.href("f", self._form.get("slug")) + "?preview=1"

    @handle("delete_button", "click")
    def delete_button_click(self, **event_args):
        self.raise_event("x-close-alert", value="del")

    @handle("cancel_button", "click")
    def cancel_button_click(self, **event_args):
        self.raise_event("x-close-alert", value=None)
