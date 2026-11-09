import anvil.server
from anvil import *
from anvil.js import window

from ._anvil_designer import FillTemplate
from ... import state


class Fill(FillTemplate):
    """#f/<slug>[?key=value]: the public form, no account needed and no app header or footer (no Shell layout).
    ?preview=1 lets the owner and teammates try a draft (answers aren't saved); ?embed=1 for iframes (the renderer posts
    its height to the parent window). The form itself is the renderer engine in Components/FormView; a form that is
    paused, unpublished, closed or missing shows a friendly closed card instead."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        state.heading(self.closed_title, 1)
        self.view.visible = self.closed_box.visible = False
        slug = args[0] if args else ""
        flags = window.FF.publicForm.flags()
        try:
            d: dict = anvil.server.call("get_public_form", slug, bool(flags.preview))
        except Exception as e:
            d = {"ok": False, "error": "This form didn't load. Check your connection and try again."}
            print("get_public_form failed: %r" % e)
        self.loading_box.visible = False
        if not d.get("ok") or d.get("closed"):
            title = str(d.get("title") or "")
            self.closed_title.text = title
            self.closed_title.visible = bool(title)
            self.closed_message.text = str(d.get("message") or d.get("error") or "This form isn't available.")
            self.closed_box.visible = True
            return
        form: dict = d["form"]
        self._slug = form["slug"]
        self.view.visible = True
        self.view.show_public(form, bool(d.get("preview")), bool(flags.embed), self._report)

    def _report(self):
        from ...Dialogs.ReportForm import ReportForm
        alert(ReportForm(slug=self._slug), buttons=[], role="app-dialog")
