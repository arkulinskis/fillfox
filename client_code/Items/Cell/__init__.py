from anvil import *

from ._anvil_designer import CellTemplate


class Cell(CellTemplate):
    """One cell of the answers table (Results). item = {text, head}. The row is a CSS grid (--cols on the table)."""

    def __init__(self, **properties):
        super().__init__(**properties)
        if self.item.get("head"):
            self.classes["head"] = True
