from anvil import *

from ._anvil_designer import CoachTipTemplate
from ... import state


class CoachTip(CoachTipTemplate):
    """One tip of the finish-rate coach (Results -> Drop-off). item = {num, title, text, href, cta} from
    FF.results.coach: a rule over this form's own numbers, with a link to the editor tab that fixes it."""

    def __init__(self, **properties):
        super().__init__(**properties)
        t = self.item
        self.fix_link.visible = bool(t.get("href"))  # (example forms: read-only, no editor link)
        state.set_attr(self.fix_link, "href", t.get("href") or "#forms")
        self.dom_nodes["cta"].textContent = t.get("cta") or "Fix it in the editor"
