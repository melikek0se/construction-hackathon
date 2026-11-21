"""The audit of the requests to Claude: every request is one row, with what it belongs to."""
import asyncio
from types import SimpleNamespace

from fastapi.testclient import TestClient

from boq import spend
from boq.api import app
from boq.checks import llm
from boq.model import BoQ, Item, SourceRef

client = TestClient(app)


class _Claude:
    """Stands in for the API: answers with no finding and reports the tokens a real answer would."""
    def __init__(self):
        self.beta = SimpleNamespace(messages=SimpleNamespace(create=self.create))

    async def create(self, **_request):
        usage = SimpleNamespace(input_tokens=1000, output_tokens=500, cache_read_input_tokens=2000,
                                cache_creation_input_tokens=4000)
        return SimpleNamespace(model="claude-opus-5-5", usage=usage, stop_reason="end_turn",
                               content=[SimpleNamespace(type="text", text='{"findings": []}')])


def _lv(name: str) -> BoQ:
    item = Item(oz="1.1", short_text="Rohrgraben ausheben", long_text="Boden lösen und seitlich lagern", unit="m3",
                source=SourceRef(file=f"{name}.x83"))
    return BoQ(name=name, file=f"{name}.x83", format="gaeb_xml", items=[item])


def test_a_request_is_noted_with_its_tokens_and_a_cached_answer_as_free():
    boq = _lv("audit")
    with spend.scope(project_id="P1", file=boq.file, run_id="R1"):
        asyncio.run(llm.run_llm_checks(boq, [], client=_Claude()))
        asyncio.run(llm.run_llm_checks(boq, [], client=_Claude()))  # the same LV again: from the cache
    audit = client.get("/api/spend", params={"project": "P1"}).json()
    assert audit["requests"] == 1 and audit["cached"] == 1
    # 1000 in × 4 + 4000 written × 4 × 1.25 + 2000 read × 0.20 + 500 out × 20, per million
    assert audit["usd"] == round((1000 * 4 + 4000 * 4 * 1.25 + 2000 * 0.2 + 500 * 20) / 1e6, 4)
    sent, free = (c for c in sorted(audit["calls"], key=lambda c: c["cached"]))
    assert sent["purpose"] == "AI review" and sent["file"] == "audit.x83" and sent["run_id"] == "R1"
    assert (sent["input_tokens"], sent["output_tokens"], sent["cache_write_tokens"]) == (1000, 500, 4000)
    assert free["cached"] and free["usd"] == 0 and free["input_tokens"] == 0
    assert audit["by_purpose"][0] == {"purpose": "AI review", "requests": 1, "cached": 1, "usd": audit["usd"],
                                      "input_tokens": 1000, "output_tokens": 500, "cache_read_tokens": 2000,
                                      "cache_write_tokens": 4000}
    assert client.get("/api/spend", params={"project": "other"}).json()["requests"] == 0
    assert client.get("/api/spend").json()["requests"] == 1  # all projects


def test_a_model_without_a_list_price_has_tokens_and_no_usd():
    spend.record("chat", "some-other-model", {"input_tokens": 10, "output_tokens": 5})
    audit = client.get("/api/spend").json()
    assert audit["unpriced"] == 1 and audit["usd"] == 0 and audit["calls"][0]["usd"] is None
