from anvil import *
import anvil.js
from anvil.js import window

from ._anvil_designer import EditorTemplate
from ... import ff, state


class Editor(EditorTemplate):
    """The form editor engine (FF.editor, theme/assets/ff-editor.js) as a component. The engine owns its toolbar, the
    four tabs, autosave (save_form), undo/redo, the slash menu, logic dialogs, the live Design preview and the Share
    tools; its server calls go through UI.api (client_code/ff.py bridge). Switching tabs changes the address
    (#edit/<id>/<tab>), which opens a new Edit page: the old engine saves what's pending in destroy()."""

    def __init__(self, **properties):
        self._args = None
        self._ctl = None
        self._shown = False
        super().__init__(**properties)
        self.error_box.visible = False
        window.UI_EDITOR_READY = False

    def open(self, form_id, tab="build"):
        self._args = [form_id, tab or "build"]
        self._mount()

    def _mount(self):
        if not self._shown or self._args is None or self._ctl is not None:
            return
        self._ctl = window.FF.editor(self.dom_nodes["host"], ff.js({"args": self._args, "me": state.me()}))
        self._ctl.ready.then(self._ready, self._failed)

    def _ready(self, *args):
        window.UI_EDITOR_READY = True  # tests wait for this

    def _failed(self, err=None):
        self.dom_nodes["host"].innerHTML = ""
        self.error_text.text = str(getattr(err, "message", "") or "It may have been deleted, or it isn't shared with you.")
        self.error_box.visible = True
        window.UI_EDITOR_READY = True

    @handle("", "show")
    def form_show(self, **event_args):
        self._shown = True
        self._mount()

    @handle("", "hide")
    def form_hide(self, **event_args):
        self._shown = False
        if self._ctl is not None:
            try:
                self._ctl.destroy()
            except Exception as e:
                print("editor destroy: %r" % e)
            self._ctl = None
