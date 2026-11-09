import json

import anvil.server
from anvil import *

from ._anvil_designer import NewFormTemplate
from ... import ff, router, state

TABS = ["start", "tpl", "paste", "google", "import"]
SAMPLE = ("Your name *\nEmail *\nWhich workshop? (Pottery / Weaving / Printmaking)\nHow did you hear about us?\n- Instagram\n"
          "- A friend\n- Walking by\nHow would you rate our last event?\nAnything else you'd like to tell us?")


class NewForm(NewFormTemplate):
    """New form, five ways: blank, a template (FF.TEMPLATES), pasted questions (FF.parseQuestions guesses each type,
    shown live), a Google Forms link (import_google_form), or a Fillfox JSON file. Opens the editor on success."""

    def __init__(self, tab="start", **properties):
        super().__init__(**properties)
        self._tabs = {"start": self.tab_start, "tpl": self.tab_tpl, "paste": self.tab_paste,
                      "google": self.tab_google, "import": self.tab_import}
        self._parts = {"start": self.start_part, "tpl": self.tpl_part, "paste": self.paste_part,
                       "google": self.google_part, "import": self.import_part}
        self.tpl_panel.items = ff.templates()
        self.tpl_panel.add_event_handler("x-pick", self._pick)
        self.paste_box.text = SAMPLE
        state.set_control_attr(self.paste_box, "spellcheck", "false")
        self._show(tab if tab in TABS else "start")

    def _show(self, tab):
        self._tab = tab
        for name in TABS:
            self._parts[name].visible = name == tab
            self._tabs[name].role = ["fm-tab", "on"] if name == tab else ["fm-tab"]
            state.set_control_attr(self._tabs[name], "aria-pressed", "true" if name == tab else "false")
        if tab == "paste":
            self._guess()

    @handle("tab_start", "click")
    def tab_start_click(self, **event_args):
        self._show("start")

    @handle("tab_tpl", "click")
    def tab_tpl_click(self, **event_args):
        self._show("tpl")

    @handle("tab_paste", "click")
    def tab_paste_click(self, **event_args):
        self._show("paste")

    @handle("tab_google", "click")
    def tab_google_click(self, **event_args):
        self._show("google")

    @handle("tab_import", "click")
    def tab_import_click(self, **event_args):
        self._show("import")

    @handle("close_button", "click")
    def close_button_click(self, **event_args):
        self.raise_event("x-close-alert", value=None)

    # ---- making it
    def _make(self, title, blocks, settings, button=None):
        if button is not None:
            button.enabled = False
        try:
            r = state.call("create_form", title, blocks, settings)
        finally:
            if button is not None:
                button.enabled = True
        if r:
            self.raise_event("x-close-alert", value=r["id"])
            router.go("edit", r["id"])

    @handle("create_button", "click")
    def create_button_click(self, **event_args):
        self._make((self.title_box.text or "").strip() or "Untitled form", [], {}, self.create_button)

    @handle("title_box", "pressed_enter")
    def title_box_pressed_enter(self, **event_args):
        self.create_button_click()

    def _pick(self, key, **event_args):
        t = ff.instantiate(key)
        self._make(t["title"], t["blocks"], t["settings"])

    # ---- paste
    def _guess(self):
        blocks = ff.parse_questions(self.paste_box.text)
        self.guess_panel.items = blocks
        self.guess_empty.visible = not blocks

    @handle("paste_box", "change")
    def paste_box_change(self, **event_args):
        self._guess()

    @handle("paste_button", "click")
    def paste_button_click(self, **event_args):
        blocks = ff.parse_questions(self.paste_box.text)
        if not blocks:
            state.toast("Type at least one question.", "error")
            return
        self._make("Untitled form", blocks, {}, self.paste_button)

    # ---- Google Forms
    @handle("google_button", "click")
    def google_button_click(self, **event_args):
        self.google_error.visible = False
        self.google_button.enabled = False
        try:
            r = anvil.server.call("import_google_form", self.url_box.text or "")
        finally:
            self.google_button.enabled = True
        if not r or r.get("ok") is False:
            self.google_error.text = (r or {}).get("error") or "That didn't work."
            self.google_error.visible = True
            return
        if r.get("skipped"):
            state.toast("Imported %s. Skipped: %s." % (state.plural(r.get("questions") or 0, "question"),
                                                       ", ".join(x.get("why", "") for x in r["skipped"])))
        self._make(r["title"], r["blocks"], r["settings"], self.google_button)

    # ---- JSON
    @handle("json_loader", "change")
    def json_loader_change(self, file=None, **event_args):
        self.json_name.text = file.name if file else ""

    @handle("import_button", "click")
    def import_button_click(self, **event_args):
        f = self.json_loader.file
        if not f:
            state.toast("Choose a .json file first.", "error")
            return
        try:
            d = json.loads(f.get_bytes().decode("utf-8"))
        except Exception:
            d = None
        if not isinstance(d, dict) or not isinstance(d.get("blocks"), list):
            state.toast("That isn't a Fillfox JSON file.", "error")
            return
        self._make(d.get("title") or "Imported form", d["blocks"], d.get("settings") or {}, self.import_button)
