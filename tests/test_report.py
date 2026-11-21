"""Risk report and bidder questions."""
from decimal import Decimal
from pathlib import Path

from fastapi.testclient import TestClient

from boq import api
from boq.checks import run_checks
from boq.model import Finding
from boq.parsers import parse_file
from boq.report import build_report, mechanism, render_html, render_questions

DATA = Path(__file__).parent.parent / "dataset"
A = DATA / "01_gaeb_xml" / "8209.003_Leistungsverzeichnis_leer.X83"
A_AWARD = DATA / "02_gaeb_90" / "[ORT_024] LV24069.D86"
D = DATA / "01_gaeb_xml" / "GAEB-[PROJEKT_004].X83"


def report_of(path):
    boq = parse_file(str(path))
    return build_report(boq, run_checks(boq))


def test_report_counts_add_up():
    boq = parse_file(str(A))
    findings = run_checks(boq)
    r = build_report(boq, findings)
    assert sum(r["counts"].values()) == len(findings) == len(r["findings"])
    assert sum(s["items"] for s in r["sections"]) == len(boq.items) == r["lv"]["items"]
    assert sum(s["high"] + s["warn"] + s["info"] for s in r["sections"]) == len(findings)
    assert sum(a["count"] for a in r["actions"]) == len(findings)
    assert r["lv"]["net_total"] is None and all(s["value"] is None for s in r["sections"])  # no prices, no money
    assert r["top_items"][0]["points"] >= r["top_items"][-1]["points"]


def test_real_contradictions_become_german_bidder_questions():
    r = report_of(A)
    questions = {q["item_oz"]: q for q in r["questions"]}
    q = questions["5.1.4"]
    assert q["question"] == ("Der Kurztext nennt DN 125, der Langtext dagegen DN 100. "
                             "Welche Nennweite ist auszuführen und zu kalkulieren?")
    assert q["evidence"] == "„Edelstahl-Rohr DN 125“"  # the quoted passage only, no English around it
    assert [q["no"] for q in r["questions"]] == list(range(1, len(r["questions"]) + 1))
    text = render_questions(r)
    assert "Position 5.1.4" in text and "Position 5.1.46" in text and q["question"] in text
    assert text.index("Position 5.1.4:") < text.index("Position 5.1.46:")  # LV order


def test_priced_file_reports_values_from_the_file_only():
    boq = parse_file(str(A_AWARD))
    r = build_report(boq, run_checks(boq))
    assert Decimal(str(r["lv"]["net_total"])) == Decimal("536991.65")
    assert abs(sum(s["value"] for s in r["sections"]) - 536991.65) < 0.01
    lump = next(k for k in r["position_types"] if k["kind"] == "lump_sum")
    assert lump["items"] == 14 and lump["value"] > 0


def test_change_order_mechanisms():
    def f(check_id, category):
        return Finding(item_oz="1", category=category, check_id=check_id, severity="warn", evidence="e",
                       explanation="x", action="ask_client")

    assert mechanism(f("C-PRESSURE-TEST", "change_order")) == "abs6"   # missing item
    assert mechanism(f("C-TRENCH-SHORING", "contract_risk")) is None   # priced into another item
    assert mechanism(f("C-SUPPLY-INSTALL-QTY", "quantity")) == "abs3"
    assert mechanism(f("R-DIM-MISMATCH", "error")) == "abs5"
    assert mechanism(f("R-LUMP-SUM-SCOPE", "unclear_scope")) == "abs7"
    assert mechanism(f("R-WORDING", "contract_risk")) is None
    r = report_of(A)
    assert {c["clause"] for c in r["change_orders"]} == {"§2 Abs. 5", "§2 Abs. 7"}


def test_html_report_escapes_lv_text_and_has_every_part():
    boq = parse_file(str(D))
    boq.items[0].short_text = '<script>alert("x")</script>'
    page = render_html(build_report(boq, run_checks(boq)))
    assert "<script>alert" not in page and "&lt;script&gt;" in page
    for heading in ("Summary", "Where the risk sits", "Change-order potential", "Bidder questions", "All findings"):
        assert f"<h2>{heading}" in page


def test_api_serves_report_and_questions_including_ai_findings(monkeypatch):
    client = TestClient(api.app)
    with open(D, "rb") as fh:
        analysis_id = client.post("/api/analyze", files={"file": (D.name, fh)}).json()["id"]
    before = client.get(f"/api/analyses/{analysis_id}/report").json()
    assert before["checks"]["llm"] == 0 and before["questions"] == []

    async def fake_review(boq, findings):
        return [Finding(item_oz="2.12", category="unclear_scope", check_id="L-UNCLEAR-SCOPE", severity="warn",
                        title="Grading undefined", evidence="„Körnung 0/X“", explanation="x", action="ask_client",
                        origin="llm", question_de="Welche Körnung ist für den Grubenkies vorgesehen?")], {}

    monkeypatch.setattr(api, "run_llm_checks", fake_review)
    assert client.post(f"/api/analyses/{analysis_id}/llm").status_code == 200
    after = client.get(f"/api/analyses/{analysis_id}/report").json()
    assert after["checks"]["llm"] == 1 and after["questions"][0]["item_oz"] == "2.12"
    txt = client.get(f"/api/analyses/{analysis_id}/bieterfragen.txt")
    assert "Welche Körnung ist für den Grubenkies vorgesehen?" in txt.text
    assert "attachment" in txt.headers["content-disposition"]
    html = client.get(f"/api/analyses/{analysis_id}/report.html")
    assert html.status_code == 200 and "Frage 1 – Position 2.12" in html.text
    assert client.get("/api/analyses/unknown/report.html").status_code == 404


def test_bidder_question_names_every_item_it_is_about():
    """A missing-item finding triggered by three supply items, or one AI finding on a clause quoted for
    several items, is one question; the client must see all the item numbers, not only the first."""
    boq = parse_file(str(D))
    finding = Finding(item_oz="2.5", related_oz=["2.6", "2.7"], category="change_order", check_id="C-TEST",
                      severity="high", evidence="2.5 „Rohrgrabenaushub“", explanation="e", action="ask_client",
                      question_de="Ist das Verfüllen einzurechnen?")
    r = build_report(boq, [finding])
    assert "Betrifft auch: Positionen 2.6, 2.7" in render_questions(r)
    assert "Betrifft auch: Positionen 2.6, 2.7" in render_html(r)
