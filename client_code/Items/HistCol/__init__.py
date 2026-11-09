from anvil import *

from ._anvil_designer import HistColTemplate


class HistCol(HistColTemplate):
    """One column of a results histogram (scales, NPS, quiz scores). item = {label, h (% of the tallest), cls d/p/g
    (NPS detractor / passive / promoter colours), title}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        c = self.item
        self.dom_nodes["col"].setAttribute("title", c.get("title") or "")
        bar = self.dom_nodes["bar"]
        bar.style.height = "%s%%" % c.get("h", 0)
        if c.get("cls"):
            bar.classList.add(c["cls"])
        self.dom_nodes["lbl"].textContent = c.get("label") or ""
