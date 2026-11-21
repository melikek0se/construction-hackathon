"""Which passages of a project a question is about: local search, no model, no database.

Sending every LV of a project to the model with each question is simple and expensive (project F: 316,700
tokens). A question is about a handful of items, so the items are ranked here and only the best go to the
model, with a short index of all LVs so it still knows what the project consists of.

Ranking is BM25 over words and over 4-letter pieces of words: German LVs say "Dachablauf", "Dachabläufe" and
"Dachentwässerungsabläufe" for the same thing, and whole words alone would miss two of the three. On top of
the ranking:
- items named in the question by number ("Pos. 6.1.180") are always included,
- for the best hits, the most similar items of the *other* LVs are added (the same work seen from the other
  trade, which is what questions between LVs are about),
- an item that refers back ("wie vor", "wie Pos. …") brings the item it refers to.
"""
import math
import re
from collections import Counter
from dataclasses import dataclass

from boq.model import BoQ, Item

TOP = 28  # best passages for the question itself
PER_HIT_ELSEWHERE = 2  # for each of the best hits: this many similar items from other LVs …
HITS_EXPANDED = 8  # … for this many hits
MAX_PASSAGES = 60
REMARK_CHARS = 900  # preliminary remarks are cut into pieces of about this size
MAX_ITEM_CHARS = 3000  # a longer item text is shown up to here; the rest is still checked for quotes

_WORD = re.compile(r"[a-zäöüß0-9]+")
_OZ = re.compile(r"(?<![\d.,])(\d{1,3}(?:\.\d{1,4}){1,4})\.?(?![\d,])")
_STOP = set("""der die das den dem des ein eine einer eines einem einen und oder für mit von vom zu zur zum im in
an am auf aus bei bis nach über unter durch als auch ist sind wird werden wie was wer wo welche welches welcher
welchem welchen dieses diese dieser diesem nicht nur je pro inkl einschl sowie bzw gem laut gibt es hat haben
the a an of in on for to is are does do which what who where this that and or with from by""".split())


@dataclass
class Passage:
    file: str
    oz: str  # "" = a piece of the preliminary remarks or a note between items
    text: str
    item: Item | None = None
    order: int = 0  # position in its document
    score: float = 0.0


def _terms(text: str) -> list[str]:
    out = []
    for word in _WORD.findall(text.lower()):
        if word in _STOP or len(word) < 2:
            continue
        out.append(word)
        if len(word) > 5 and not word.isdigit():
            out += ["#" + word[i:i + 4] for i in range(len(word) - 3)]
    return out


def passages(documents: list[BoQ]) -> list[Passage]:
    """Every item of every document, and the remarks cut into pieces."""
    out = []
    for doc in documents:
        n = 0
        for remark in doc.remarks:
            piece = ""
            for paragraph in remark.text.split("\n"):
                if piece and len(piece) + len(paragraph) > REMARK_CHARS:
                    out.append(Passage(doc.file, "", piece.strip(), order=(n := n + 1)))
                    piece = ""
                piece += paragraph + "\n"
            if piece.strip():
                out.append(Passage(doc.file, "", piece.strip(), order=(n := n + 1)))
        for item in doc.items:
            text = " / ".join(item.path) + "\n" + item.text
            out.append(Passage(doc.file, item.oz, text, item=item, order=(n := n + 1)))
    return out


class Index:
    """BM25 over the passages of a project."""

    def __init__(self, documents: list[BoQ]):
        self.documents = documents
        self.passages = passages(documents)
        self.counts = [Counter(_terms(p.text)) for p in self.passages]
        self.lengths = [sum(c.values()) for c in self.counts]
        self.mean = (sum(self.lengths) / len(self.lengths)) if self.lengths else 1.0
        df = Counter(t for c in self.counts for t in c)
        n = len(self.passages)
        self.idf = {t: math.log(1 + (n - d + 0.5) / (d + 0.5)) for t, d in df.items()}
        self.postings: dict[str, list[int]] = {}
        for i, c in enumerate(self.counts):
            for t in c:
                self.postings.setdefault(t, []).append(i)

    def rank(self, text: str, skip_file: str | None = None) -> list[tuple[float, int]]:
        query = Counter(_terms(text))
        scores: dict[int, float] = {}
        for term, weight in query.items():
            idf = self.idf.get(term)
            if idf is None:
                continue
            idf *= 0.35 if term.startswith("#") else 1.0  # pieces of words support, whole words lead
            for i in self.postings[term]:
                if skip_file is not None and self.passages[i].file == skip_file:
                    continue
                tf = self.counts[i][term]
                norm = tf * 2.2 / (tf + 1.2 * (0.25 + 0.75 * self.lengths[i] / self.mean))
                scores[i] = scores.get(i, 0.0) + idf * norm * min(weight, 2)
        return sorted(((s, i) for i, s in scores.items()), reverse=True)

    def select(self, question: str, earlier: str = "", reading: str | None = None) -> list[Passage]:
        """The passages to show the model, grouped later by document. `earlier` is the previous question
        of the conversation (a follow-up like "and how long?" has no subject of its own); `reading` is
        the file that is open, whose items win ties and whose numbers a bare "Pos. 7" refers to."""
        picked: dict[int, float] = {}
        ranked = self.rank(question + " " + question + " " + earlier)
        for score, i in ranked[:TOP]:
            picked[i] = score * (1.15 if self.passages[i].file == reading else 1.0)
        for score, i in ranked[:HITS_EXPANDED]:  # the same work in the other LVs
            hit = self.passages[i]
            if hit.item is None:
                continue
            for other, j in self.rank(hit.item.text, skip_file=hit.file)[:PER_HIT_ELSEWHERE]:
                picked.setdefault(j, score * 0.5)
        named = set(_OZ.findall(question))
        by_place = {(p.file, p.oz): i for i, p in enumerate(self.passages) if p.oz}
        for i, p in enumerate(self.passages):
            if p.oz and p.oz in named and (reading is None or p.file == reading or
                                           (reading, p.oz) not in by_place):
                picked[i] = max(picked.get(i, 0.0), 1e6)  # asked for by number
        for i in list(picked):  # what an item refers back to
            p = self.passages[i]
            if p.item is None:
                continue
            for ref in p.item.refs:
                j = by_place.get((p.file, ref))
                if j is not None:
                    picked.setdefault(j, picked[i] * 0.6)
            if re.match(r"\s*wie (vor|zuvor)\b", p.item.text.lower()) and i > 0 and self.passages[i - 1].file == p.file:
                picked.setdefault(i - 1, picked[i] * 0.6)
        best = sorted(picked.items(), key=lambda kv: -kv[1])[:MAX_PASSAGES]
        out = []
        for i, score in best:
            p = self.passages[i]
            out.append(Passage(p.file, p.oz, p.text, p.item, p.order, score))
        return out


def overview(documents: list[BoQ]) -> str:
    """What the project consists of: every LV with its sections, so that "is there an LV for …" can be
    answered although only a few items are shown."""
    lines = []
    for doc in documents:
        sections: list[str] = []
        for item in doc.items:
            if item.path and item.path[0] not in sections:
                sections.append(item.path[0])
        lines.append(f'<lv file="{doc.file}" name="{doc.name or doc.file}" items="{len(doc.items)}">'
                     + ("; ".join(sections[:14]) if sections else "") + "</lv>")
    return "<project_overview>\n" + "\n".join(lines) + "\n</project_overview>"
