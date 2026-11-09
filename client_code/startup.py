"""The app starts here (anvil.yaml: startup module). The engines' bridge (ff.install), one server call to learn who is
signed in (Anvil's loading spinner shows meanwhile), the Privacy & Terms kit, then the page for the address."""
import anvil.server

from . import ff, legal, router, state

LEGAL_THEME = {"accent": "#ff4f1f"}  # colours for the Privacy & Terms page (match --c-accent in app.css)

ff.install()  # the JavaScript engines' server bridge and toasts
legal.setup(LEGAL_THEME)
state.set_me(anvil.server.call("get_me"))
if state.me():
    legal.refresh_soon()
router.start()
