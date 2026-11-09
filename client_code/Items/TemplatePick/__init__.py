from anvil import *

from ._anvil_designer import TemplatePickTemplate


class TemplatePick(TemplatePickTemplate):
    """A template in the New form dialog. item = one of FF.TEMPLATES. Click -> x-pick(key) on the panel."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.dom_nodes["swatch"].style.background = (self.item.get("settings") or {}).get("accent") or "#0a0a0a"

    def pick_click(self, event):
        self.dom_nodes["btn"].disabled = True
        self.parent.raise_event("x-pick", key=self.item["key"])
