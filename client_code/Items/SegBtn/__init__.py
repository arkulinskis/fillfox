from anvil import *

from ._anvil_designer import SegBtnTemplate


class SegBtn(SegBtnTemplate):
    """A toggle button in a row of choices. item = {key, label, on}. Click -> x-pick(key) on the panel."""

    def __init__(self, **properties):
        super().__init__(**properties)
        b = self.dom_nodes["btn"]
        b.setAttribute("data-key", str(self.item["key"]))
        b.setAttribute("aria-pressed", "true" if self.item.get("on") else "false")
        if self.item.get("on"):
            b.classList.add("on")

    def btn_click(self, event):
        self.parent.raise_event("x-pick", key=self.item["key"])
