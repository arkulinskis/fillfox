from anvil import *

from ._anvil_designer import TextAnswerTemplate


class TextAnswer(TextAnswerTemplate):
    """A recent text answer (or an uploaded file, as a link) in a results card. item = {text, small, href}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        a = self.item
        if a.get("href"):
            self.link.text, self.link.url = a.get("text") or "", a["href"]
            self.text.visible = False
        else:
            self.text.text = a.get("text") or ""
            self.link.visible = False
