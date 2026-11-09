from anvil import *

from ._anvil_designer import FormCardTemplate
from ... import ff, router, state


class FormCard(FormCardTemplate):
    """One form on the dashboard. item = a my_forms() summary {id, slug, title, status, open, role, accent, ...}.
    Viewers (the read-only examples) get Results / Try it / Use a copy; owners and teammates Edit / Results / Link / More.
    Clicks that change the list go to the page: x-duplicate, x-more."""

    def __init__(self, **properties):
        super().__init__(**properties)
        f = self.item
        viewer = f.get("role") == "viewer"
        self.dom_nodes["swatch"].style.background = f.get("accent") or "#0a0a0a"
        text, colour = ff.status(f.get("status"), f.get("open"))
        self.status_badge.text = text
        self.status_badge.role = ["badge"] + (["badge-" + colour] if colour else [])
        self.focus_badge.visible = f.get("layout") == "focus"
        self.quiz_badge.visible = bool(f.get("quiz"))
        if f.get("demo"):
            self.owner_badge.text = "Example · " + (f.get("owner") or "")
        elif f.get("role") == "editor":
            self.owner_badge.text = "Shared by " + (f.get("owner") or "")
        self.owner_badge.visible = bool(f.get("demo") or f.get("role") == "editor")
        main = router.href("results" if viewer else "edit", f["id"])
        state.set_attr(self.title_link, "href", main)
        self.title_label.text = f.get("title") or "Untitled form"
        when = (" · last answer " + state.ago(f["last_response"])) if f.get("last_response") else (" · updated " + state.ago(f.get("updated")))
        self.meta.text = state.plural(f.get("questions") or 0, "question") + when
        self.answers_num.text = str(f.get("responses") or 0)
        self.finish_num.text = "–" if f.get("completion") is None else "%d%%" % f["completion"]
        self.spark.counts = f.get("spark") or []
        self.owner_acts.visible = not viewer
        self.viewer_acts.visible = viewer
        state.set_attr(self.edit_link, "href", router.href("edit", f["id"]))
        state.set_attr(self.results_link, "href", router.href("results", f["id"]))
        state.set_attr(self.v_results_link, "href", router.href("results", f["id"]))
        state.set_attr(self.try_link, "href", router.href("f", f.get("slug")))
        self.link_button.visible = f.get("status") == "live"
        self.more_button.tooltip = "More for " + (f.get("title") or "this form")
        state.set_control_attr(self.more_button, "aria-label", "More for " + (f.get("title") or "this form"))

    @handle("link_button", "click")
    def link_button_click(self, **event_args):
        ff.copy(ff.form_url(self.item["slug"]), "Link copied")

    @handle("dup_button", "click")
    def dup_button_click(self, **event_args):
        r = state.call("duplicate_form", self.item["id"])
        if r:
            state.toast("Copied into your forms", "ok")
            router.go("edit", r["id"])

    @handle("more_button", "click")
    def more_button_click(self, **event_args):
        self.parent.raise_event("x-more", form=self.item)
