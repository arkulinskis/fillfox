from anvil import *

from ._anvil_designer import SummaryCardTemplate


class SummaryCard(SummaryCardTemplate):
    """One question's results on Results -> Summary. item = a card from FF.results.summary: {num, title, sub, wide, empty,
    bigs, bars, hist, nps, texts, notes, icon}. Wide cards (NPS, long answers, quiz scores, payments) span both columns."""

    def __init__(self, **properties):
        super().__init__(**properties)
        c = self.item
        self.classes["wide"] = bool(c.get("wide"))
        self.num.text = c.get("num") or ""
        self.num.visible = bool(c.get("num"))
        self.trophy.visible = c.get("icon") == "trophy"
        self.title.text = c.get("title") or ""
        self.sub.text = c.get("sub") or ""
        self.empty_label.visible = bool(c.get("empty"))
        bigs = c.get("bigs") or []
        self.big_box.visible = bool(bigs)
        if bigs:
            self.big.text = bigs[0]["b"]
            self.big.role = ["rs-big-b", "small"] if bigs[0].get("small") else ["rs-big-b"]
            self.big_text.text = bigs[0]["s"]
        nps = c.get("nps")
        self.nps_box.visible = bool(nps)
        if nps:
            self.dom_nodes["nps_d"].style.width = "%s%%" % nps["d"]
            self.dom_nodes["nps_p"].style.width = "%s%%" % nps["p"]
            self.dom_nodes["nps_g"].style.width = "%s%%" % nps["g"]
            self.nps_legend.text = "%s%% detractors · %s%% passives · %s%% promoters" % (nps["d"], nps["p"], nps["g"])
        notes = c.get("notes") or []
        bars = c.get("bars") or []
        # a note before the bars (ranking: "Average position"), or after them (repeated short answers: "Latest")
        before = bool(notes) and notes[0].startswith("Average position")
        self.note1.text = notes[0] if before else ""
        self.note1.visible = before
        rest = notes[1:] if before else notes
        self.note2.text = "\n".join(rest)
        self.note2.visible = bool(rest)
        self.bars_panel.items = bars
        self.bars_panel.visible = bool(bars)
        self.hist_panel.items = c.get("hist") or []
        self.hist_box.visible = bool(c.get("hist"))
        state_texts = c.get("texts") or []
        self.texts_panel.items = state_texts
        self.texts_panel.visible = bool(state_texts)
