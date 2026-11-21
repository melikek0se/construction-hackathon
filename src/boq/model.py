"""Normalised BoQ model shared by all parsers and checks (see docs/06-architecture.md)."""
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

ItemKind = Literal["normal", "lump_sum", "contingency", "alternative", "hourly", "surcharge"]


class SourceRef(BaseModel):
    file: str
    line: int | None = None  # GAEB 90 line number of the item header
    page: int | None = None  # PDF page of the item number
    y: float | None = None  # PDF: centre of the item-number line, in points from the top of that page
    xml_id: str | None = None  # GAEB XML Item ID


class Item(BaseModel):
    oz: str  # dotted item number without leading zeros, e.g. "2.1.240"
    path: list[str] = Field(default_factory=list)  # title labels from root to item
    short_text: str = ""
    long_text: str = ""
    qty: Decimal | None = None
    unit_raw: str = ""
    unit: str = ""  # normalised, see units.py
    kind: ItemKind = "normal"
    refs: list[str] = Field(default_factory=list)  # "wie Position ..." targets, as OZ
    up: Decimal | None = None  # unit price (bids and awards only)
    total: Decimal | None = None
    source: SourceRef

    @property
    def text(self) -> str:
        return f"{self.short_text}\n{self.long_text}".strip()

    @property
    def label(self) -> str:
        """Short text, or the first line of the long text when there is none."""
        return self.short_text or self.long_text.split("\n", 1)[0]


class Remark(BaseModel):
    """Free text that is not an item: preliminary remarks, notes between items."""
    path: list[str] = Field(default_factory=list)
    text: str


class BoQ(BaseModel):
    name: str = ""
    file: str
    format: Literal["gaeb_xml", "gaeb_90", "pdf", "excel"]
    phase: str = ""  # 83 tender, 84 bid, 86 award
    # What the file says about itself, for the intake (boq.intake); empty where it says nothing.
    project_no: str = ""  # the tender's number: GAEB NamePrj, "Projekt: 79-222" in a page header
    project: str = ""  # the project's name, as opposed to `name`, which is the LV's own label
    lv_label: str = ""  # PDF only: the LV label of the page header (`name` stays the file name there)
    client: str = ""
    heading: str = ""  # PDF only: what the document calls itself ("Anfrage", "Angebot", ...)
    forms: int = 0  # PDF only: pages of contract forms (VHB), i.e. a package and not a bare LV
    items: list[Item] = Field(default_factory=list)
    remarks: list[Remark] = Field(default_factory=list)


class Finding(BaseModel):
    item_oz: str | None  # None = finding about the whole LV
    related_oz: list[str] = Field(default_factory=list)
    category: Literal["error", "unclear_scope", "quantity", "change_order", "contract_risk", "price"]
    check_id: str
    title: str = ""  # one-line headline for the UI
    severity: Literal["info", "warn", "high"]
    evidence: str  # quoted text that triggered it
    explanation: str  # why it matters to an estimator
    action: Literal["ask_client", "add_surcharge", "get_quote", "note_for_claims", "fix_typo"]
    money_at_stake: Decimal | None = None
    question_de: str = ""  # bidder question (Bieterfrage) in German, ready to send; only for ask_client
    origin: Literal["rule", "llm"] = "rule"
