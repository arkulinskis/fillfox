from anvil import *

from ._anvil_designer import TemplateCardTemplate
from ... import ff


class TemplateCard(TemplateCardTemplate):
    """A template in the gallery: a little sheet in its accent colour, category, questions, title. Click -> x-try(key)."""

    def __init__(self, **properties):
        super().__init__(**properties)
        t = self.item
        s = t.get("settings") or {}
        self.dom_nodes["btn"].style.setProperty("--acc", s.get("accent") or "#0a0a0a")
        n = len([b for b in t.get("blocks") or [] if ff.is_asked(b)])
        self.meta.text = "%s · %d questions%s" % (t.get("cat"), n, " · 1 at a time" if s.get("layout") == "focus" else "")

    def try_click(self, event):
        self.parent.raise_event("x-try", key=self.item["key"])
