"""LLM checks without the network: request building, evidence validation, caching, API errors."""
import asyncio
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from boq.checks import llm, run_checks
from boq.parsers import parse_file

D = Path(__file__).parent.parent / "dataset" / "01_gaeb_xml" / "GAEB-[PROJEKT_004].X83"
E = D.parent / "501-24-01_GAEB-XML_sas.x83"


def answer(oz, evidence, check="unclear_scope"):
    return {"item_oz": oz, "check": check, "severity": "warn", "title": "t", "evidence": evidence,
            "explanation": "e", "action": "ask_client"}


def run(boq, answers, monkeypatch):
    calls = []

    async def fake_ask(client, context, task, usage=None):
        calls.append((context, task))
        return answers if len(calls) == 1 else []

    monkeypatch.setattr(llm, "_ask", fake_ask)
    findings, stats = asyncio.run(llm.run_llm_checks(boq, run_checks(boq), client=object()))
    return findings, stats, calls


def test_only_findings_with_verbatim_evidence_survive(monkeypatch):
    boq = parse_file(str(D))
    findings, stats, _ = run(boq, [
        answer("2.5", "Aushub   mit Verbau\noder geböscht"),      # in the item text, layout aside
        answer("2.5", "Der Verbau ist in voller Höhe auszuführen"),  # invented
        answer("9.9.9", "Aushub mit Verbau oder geböscht"),          # no such item
        answer("2.5", "Aushub mit Verbau oder geböscht", check="made_up"),
        answer("3.6", "Die derzeitige Verrohrung hat einen Durchmesser von 600 mm"),   # preliminary remarks
        answer("2.17", "Die derzeitige Verrohrung hat einen Durchmesser von 600 mm"),  # same clause again
    ], monkeypatch)
    assert stats["kept"] == 2 and stats["dropped"] == 3
    f, remark = findings
    assert (remark.item_oz, remark.related_oz) == ("3.6", ["2.17"])  # one finding, not two
    assert (f.item_oz, f.check_id, f.category, f.origin) == ("2.5", "L-UNCLEAR-SCOPE", "unclear_scope", "llm")
    assert f.evidence == "„Aushub mit Verbau oder geböscht“"


def test_requests_share_one_context_and_cover_every_item(monkeypatch):
    boq = parse_file(str(E))  # 296 items in four titles; title 2 is larger than one request
    _, stats, calls = run(boq, [], monkeypatch)
    assert stats["requests"] == len(calls) > 4
    assert len({context for context, _ in calls}) == 1  # identical prefix, so it can be prompt-cached
    context = calls[0][0]
    assert all(f"\n{i.oz} | " in context for i in boq.items)  # the index lists the whole LV
    reviewed = "".join(task for _, task in calls)
    assert all(f'<item oz="{i.oz}"' in reviewed for i in boq.items)
    assert all(task.count("<item oz=") <= llm.MAX_ITEMS_PER_REQUEST for _, task in calls)
    assert "2.3.23: Short text and long text name different pipe sizes" in reviewed  # rule finding passed on


def test_answers_are_cached_on_disk(monkeypatch, tmp_path):
    monkeypatch.setattr(llm, "CACHE_DIR", tmp_path)

    class Block:
        type, text = "text", '{"findings": []}'

    class Messages:
        calls = 0

        async def create(self, **kwargs):
            Messages.calls += 1
            assert kwargs["model"] == llm.MODEL and kwargs["output_config"]["format"]["schema"] == llm.SCHEMA
            usage = type("U", (), {"input_tokens": 10, "cache_creation_input_tokens": 0,
                                   "cache_read_input_tokens": 5, "output_tokens": 3})()
            return type("R", (), {"stop_reason": "end_turn", "content": [Block()], "usage": usage})()

    client = type("C", (), {"beta": type("B", (), {"messages": Messages()})()})()
    assert asyncio.run(llm._ask(client, "ctx", "task")) == []
    assert asyncio.run(llm._ask(client, "ctx", "task")) == []
    assert Messages.calls == 1 and len(list(tmp_path.iterdir())) == 1


def test_api_reports_missing_credentials(monkeypatch):
    from boq import api

    async def no_key(boq, findings):
        raise llm.LLMUnavailable("No working Claude API credentials.")

    monkeypatch.setattr(api, "run_llm_checks", no_key)
    client = TestClient(api.app)
    with open(D, "rb") as fh:
        analysis = client.post("/api/analyze", files={"file": (D.name, fh)}).json()
    r = client.post(f"/api/analyses/{analysis['id']}/llm")
    assert r.status_code == 503 and "credentials" in r.json()["detail"]
    assert client.post("/api/analyses/unknown/llm").status_code == 404
