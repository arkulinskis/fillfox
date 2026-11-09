from anvil import *

from ._anvil_designer import DetailFieldTemplate


class DetailField(DetailFieldTemplate):
    """One question and its answer in Dialogs/AnswerDetail. item = {label, kind, text, href, src, files}: kind is text,
    empty, typed (a typed signature), sig (a drawn one, as an image), email (a mailto link), files, paid."""

    def __init__(self, **properties):
        super().__init__(**properties)
        f = self.item
        kind = f.get("kind") or "text"
        self.text.visible = kind in ("text", "empty", "typed")
        self.text.text = f.get("text") or ""
        if kind == "empty":
            self.text.role = ["rs-dd-t", "faint"]
        if kind == "typed":
            self.text.role = ["rs-dd-t", "rs-sig-typed"]
        self.link.visible = kind == "email"
        if kind == "email":
            self.link.text, self.link.url = f.get("text") or "", f.get("href") or ""
        sig = self.dom_nodes["sig"]
        if kind == "sig":
            sig.setAttribute("src", f.get("src") or "")
        else:
            sig.style.display = "none"
        self.paid.visible = kind == "paid"
        self.paid.text = f.get("text") or ""
        self.files_panel.visible = kind == "files"
        if kind == "files":
            self.files_panel.items = [{"text": x["name"], "href": x["href"], "small": ""} for x in f.get("files") or []]
