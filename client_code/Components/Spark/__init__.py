from anvil import *

from ._anvil_designer import SparkTemplate
from ... import ff


class Spark(SparkTemplate):
    """A tiny line chart of answers per day: the SVG comes from the engine (FF.spark), decorative (aria-hidden)."""

    def __init__(self, **properties):
        self._counts = []
        super().__init__(**properties)

    @property
    def counts(self):
        return self._counts

    @counts.setter
    def counts(self, value):
        self._counts = list(value or [])
        self.dom_nodes["box"].innerHTML = ff.spark_svg(self._counts) if self._counts else ""
