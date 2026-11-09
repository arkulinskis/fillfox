from anvil import *

from ._anvil_designer import GuessRowTemplate
from ... import ff


class GuessRow(GuessRowTemplate):
    """One pasted line in the New form dialog: the type Fillfox guessed and the question. item = a block."""

    def __init__(self, **properties):
        super().__init__(**properties)
        b = self.item
        self.kind.text = ff.type_label(b.get("type"))
        extra = ""
        if b.get("options"):
            extra += " · %d options" % len(b["options"])
        if b.get("required"):
            extra += " · required"
        self.text.text = (b.get("label") or "(page break)") + extra
