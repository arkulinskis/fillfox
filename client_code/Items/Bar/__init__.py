from anvil import *

from ._anvil_designer import BarTemplate


class Bar(BarTemplate):
    """One bar in a results card. item = {t, v, w, cls}: label, value text, width in % (-1 = no bar, just the numbers),
    cls "top" (the most picked) or "ok" (a correct quiz answer)."""

    def __init__(self, **properties):
        super().__init__(**properties)
        b = self.item
        if b.get("cls"):
            self.dom_nodes["bar"].classList.add(b["cls"])
        if b.get("w", -1) < 0:
            self.dom_nodes["track"].style.display = "none"
        else:
            self.dom_nodes["fill"].style.width = "%s%%" % b["w"]
