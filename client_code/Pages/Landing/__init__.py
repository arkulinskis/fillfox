from anvil import *

from ._anvil_designer import LandingTemplate
from ... import state

# The app's video on the Addanapp YouTube channel (APP_MAKER/youtube/manifest.json), shown in the Watch section.
YT_VIDEO = "1T24l_1OT_k"


class Landing(LandingTemplate):
    """#landing: the promise, the live demo (three panes on a 9-second CSS loop), the Watch section (the YouTube video),
    how it works, features, what's free here, questions. Static copy lives in the template; only the signed-in
    variations are set here."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        me = state.me()
        self.guest_cta.visible = self.band_guest.visible = not me
        self.member_cta.visible = self.band_member.visible = bool(me)
        self.dom_nodes["yt_cover"].addEventListener("click", self._play)

    def _play(self, event):
        """Swap the video's cover for YouTube's player (privacy-enhanced); nothing loads from YouTube before this click."""
        self.dom_nodes["yt_frame"].innerHTML = (
            '<iframe src="https://www.youtube-nocookie.com/embed/' + YT_VIDEO + '?autoplay=1&rel=0&playsinline=1" '
            'title="Fillfox video" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen '
            'referrerpolicy="strict-origin-when-cross-origin"></iframe>')
