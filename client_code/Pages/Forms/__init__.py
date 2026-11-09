from anvil import *

from ._anvil_designer import FormsTemplate
from ... import ff, router, state


class Forms(FormsTemplate):
    """#forms, the signed-in home: your forms, forms shared with you, read-only examples, and New form (Dialogs/NewForm:
    blank, template, pasted questions, Google Forms, Fillfox JSON). A template picked while signed out (Templates ->
    Use this template -> sign up) waits in browser storage ("pendingTemplate") and is created here."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        state.heading(self.heading, 1)
        for panel in (self.mine_panel, self.shared_panel, self.examples_panel):
            panel.add_event_handler("x-more", self._more)
        self.load()
        self._pending_template()

    def load(self):
        d = state.call("my_forms")
        if not d:
            return
        me = state.me() or {}
        self.hello.text = "Signed in as " + (me.get("name") or "you")
        self.t_forms.text = str(d["totals"]["forms"])
        self.t_answers.text = str(d["totals"]["responses"])
        self.t_live.text = str(len([f for f in d["mine"] if f["status"] == "live"]))
        self.mine_panel.items = d["mine"]
        self.mine_panel.visible = bool(d["mine"])
        self.empty_box.visible = not d["mine"]
        self.shared_panel.items = d["shared"]
        self.shared_count.text = str(len(d["shared"]))
        self.shared_part.visible = bool(d["shared"])
        self.examples_panel.items = d["examples"]
        self.examples_part.visible = bool(d["examples"])

    def _pending_template(self):
        key = state.store_get("pendingTemplate")
        if key and ff.template(key):
            state.store_set("pendingTemplate", None)
            t = ff.instantiate(key)
            r = state.call("create_form", t["title"], t["blocks"], t["settings"])
            if r:
                state.toast("Template copied into your forms", "ok")
                router.go("edit", r["id"])

    def _new(self, tab="start"):
        from ...Dialogs.NewForm import NewForm
        alert(NewForm(tab=tab), buttons=[], large=True, role="app-dialog")

    @handle("new_button", "click")
    def new_button_click(self, **event_args):
        self._new()

    @handle("new_button_2", "click")
    def new_button_2_click(self, **event_args):
        self._new()

    @handle("paste_button", "click")
    def paste_button_click(self, **event_args):
        self._new("paste")

    def _more(self, form, **event_args):
        from ...Dialogs.FormMore import FormMore
        act = alert(FormMore(form=form), buttons=[], role="app-dialog")
        if act == "dup":
            if state.call("duplicate_form", form["id"]):
                state.toast("Duplicated", "ok")
                self.load()
        elif act == "del":
            n = state.plural(form.get("responses") or 0, "answer")
            if confirm("Its %s and uploaded files are deleted too. This can't be undone." % n,
                       title="Delete “%s”?" % form["title"], buttons=[("Cancel", False), ("Delete", True)], role="app-dialog"):
                if state.call("delete_form", form["id"]):
                    state.toast("Deleted")
                    self.load()
