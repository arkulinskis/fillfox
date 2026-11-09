from anvil import *

from ._anvil_designer import EditTemplate
from ... import router, state

TABS = ("build", "design", "settings", "share")


class Edit(EditTemplate):
    """#edit/<id>[/design|settings|share]: the form editor for owners and teammates (Components/Editor wraps the engine).
    Build: write the form like a document (type + Enter, "/" for blocks), logic in sentences, form checker. Design:
    layout, colour, font, cover, language, live preview. Settings: endings, quiz, limits, privacy, notifications.
    Share: publish, link, QR, prefill links, embed code, webhook, team, JSON export. Examples (viewers) are sent to
    their results by the engine."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        if not args:
            router.go("forms")
            return
        tab = args[1] if len(args) > 1 and args[1] in TABS else "build"
        self.editor.open(args[0], tab)
