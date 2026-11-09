from anvil import *
import anvil.js

from ._anvil_designer import FormViewTemplate
from ... import ff


class FormView(FormViewTemplate):
    """Wraps the form renderer (FF.render). show_form(form, mode) for a try-out (mode "template": nothing is saved);
    show_public(form, preview, embed, on_report) for the real #f page, wired to the server by FF.publicForm.mount
    (progress, uploads, submit, the per-visit token) exactly like the JavaScript version."""

    def __init__(self, **properties):
        self._todo = None
        self._ctl = None
        self._shown = False
        super().__init__(**properties)

    def show_form(self, form, mode="template"):
        self._todo = lambda: window_render(self.dom_nodes["host"], form, mode)
        self._draw()

    def show_public(self, form, preview=False, embed=False, on_report=None):
        def go():
            return anvil.js.window.FF.publicForm.mount(self.dom_nodes["host"], ff.js(form), bool(preview), bool(embed),
                                                       on_report or (lambda: None))
        self._todo = go
        self._draw()

    def _draw(self):
        if self._shown and self._todo is not None:
            self._destroy()
            self._ctl = self._todo()

    def _destroy(self):
        if self._ctl is not None:
            try:
                self._ctl.destroy()
            except Exception:
                pass
            self._ctl = None

    @handle("", "show")
    def form_show(self, **event_args):
        self._shown = True
        self._draw()

    @handle("", "hide")
    def form_hide(self, **event_args):
        self._shown = False
        self._destroy()


def window_render(el, form, mode):
    return anvil.js.window.FF.render(el, ff.js(form), ff.js({"mode": mode}))
