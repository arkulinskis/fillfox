from anvil import *

from ._anvil_designer import TemplatesTemplate
from ... import ff, router, state


class Templates(TemplatesTemplate):
    """#templates[/key]: the template gallery, open to everyone. Open one to fill it in (Dialogs/TryTemplate); "Use this
    template" copies it into your forms (visitors sign up first and find it waiting: "pendingTemplate")."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        state.heading(self.heading, 1)
        tpls = ff.templates()
        self.lead.text = "%d free templates. Open one to fill it in yourself. Like it? Copy it and change anything." % len(tpls)
        self.blank_button.visible = bool(state.me())
        cats = ["All"]
        for t in tpls:
            if t["cat"] not in cats:
                cats.append(t["cat"])
        self._cats, self._cat = cats, "All"
        self.cat_panel.add_event_handler("x-pick", self._pick_cat)
        self.grid_panel.add_event_handler("x-try", self._try)
        self._draw()
        self._open = args[0] if args and ff.template(args[0]) else None

    @handle("", "show")
    def form_show(self, **event_args):
        if self._open:
            key, self._open = self._open, None
            self._try(key)

    def _draw(self):
        self.cat_panel.items = [{"key": c, "label": c, "on": c == self._cat} for c in self._cats]
        self.grid_panel.items = [t for t in ff.templates() if self._cat == "All" or t["cat"] == self._cat]

    def _pick_cat(self, key, **event_args):
        self._cat = key
        self._draw()
        state.refocus(self.cat_panel, key)

    def _try(self, key, **event_args):
        from ...Dialogs.TryTemplate import TryTemplate
        if alert(TryTemplate(key=key), buttons=[], large=True, role="tp-dialog") == "use":
            self._use(key)

    def _use(self, key):
        if not state.me():
            state.store_set("pendingTemplate", key)
            router.remember_after("#forms")
            state.toast("Make a free account and the template is waiting for you.")
            router.go("auth", "signup")
            return
        t = ff.instantiate(key)
        r = state.call("create_form", t["title"], t["blocks"], t["settings"])
        if r:
            state.toast("Copied into your forms", "ok")
            router.go("edit", r["id"])

    @handle("blank_button", "click")
    def blank_button_click(self, **event_args):
        from ...Dialogs.NewForm import NewForm
        alert(NewForm(tab="start"), buttons=[], large=True, role="app-dialog")
