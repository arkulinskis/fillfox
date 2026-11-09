from anvil import *

from ._anvil_designer import FunnelStepTemplate


class FunnelStep(FunnelStepTemplate):
    """One step of the drop-off funnel (Results -> Drop-off). item = {k, label, n, w, lost, worst}: the step where most
    people left is marked in the accent colour."""

    def __init__(self, **properties):
        super().__init__(**properties)
        s = self.item
        self.dom_nodes["fill"].style.width = "%s%%" % s.get("w", 0)
        if s.get("worst"):
            self.dom_nodes["step"].classList.add("worst")
        self.lost.visible = bool(s.get("lost"))
