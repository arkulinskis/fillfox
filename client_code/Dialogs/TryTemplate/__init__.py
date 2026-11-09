from anvil import *

from ._anvil_designer import TryTemplateTemplate
from ... import ff


class TryTemplate(TryTemplateTemplate):
    """Try a template right here, full screen (nothing is saved). Closes with "use" (copy it into your forms) or None."""

    def __init__(self, key=None, **properties):
        super().__init__(**properties)
        tpl = ff.template(key) or {}
        t = ff.instantiate(key)
        self.bar_title.text = "TEMPLATE · %s · try it, nothing is saved" % (tpl.get("title") or "").upper()
        self.view.show_form({"slug": "tpl-" + str(key), "title": t["title"], "blocks": t["blocks"], "settings": t["settings"]},
                            "template")

    @handle("use_button", "click")
    def use_button_click(self, **event_args):
        self.raise_event("x-close-alert", value="use")

    @handle("close_button", "click")
    def close_button_click(self, **event_args):
        self.raise_event("x-close-alert", value=None)
