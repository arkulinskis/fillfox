from anvil import *

from ._anvil_designer import EraseAnswersTemplate
from ... import state


class EraseAnswers(EraseAnswersTemplate):
    """Erase a person's answers (privacy requests): closes with the text to look for, or None."""

    def __init__(self, **properties):
        super().__init__(**properties)

    @handle("", "show")
    def form_show(self, **event_args):
        self.text_box.focus()

    @handle("cancel_button", "click")
    def cancel_button_click(self, **event_args):
        self.raise_event("x-close-alert", value=None)

    @handle("text_box", "pressed_enter")
    def text_box_pressed_enter(self, **event_args):
        self.erase_button_click()

    @handle("erase_button", "click")
    def erase_button_click(self, **event_args):
        text = (self.text_box.text or "").strip()
        if not text:
            state.toast("Type an email address or an exact answer.", "error")
            return
        self.raise_event("x-close-alert", value=text)
