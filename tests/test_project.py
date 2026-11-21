"""Project of several trade LVs: interface statements, graph and cross-LV findings (dataset project F)."""
from decimal import Decimal
from pathlib import Path

from fastapi.testclient import TestClient

from boq import api
from boq.model import BoQ, Item, SourceRef
from boq.parsers import parse_file
from boq.project import analyse_project, lv_name, provides, statements

F = Path(__file__).parent.parent / "dataset" / "03_pdf_hochbau_projekt"
LVS = {lv_name(b): b for b in (parse_file(str(p)) for p in sorted(F.glob("*.pdf")))}
RESULT = analyse_project(LVS)


def lv(file, *items):
    return BoQ(file=file, format="pdf", items=[
        Item(oz=oz, short_text=label, long_text=text, qty=Decimal(qty), unit_raw=unit, unit=unit,
             source=SourceRef(file=file)) for oz, label, text, qty, unit in items])


def test_trades_come_from_file_and_section_titles():
    assert provides(LVS["18 Estrich"]) == {"estrich"}
    assert provides(LVS["15a Abdichtung Bodenplatte Buero"]) == {"abdichtung"}  # not concrete work
    assert {"beton", "mauerwerk", "erdarbeiten"} <= provides(LVS["00 Roh und Erdauarbeiten"])
    assert provides(LVS["04 Porenbetonfassade"]) == {"porenbeton"}


def test_interface_statements_are_read_from_the_item_text():
    found = statements("18 Estrich", LVS["18 Estrich"])
    kinds = {s.kind for s in found}
    assert kinds == {"prior", "following", "by_others"}
    following = next(s for s in found if s.quote == "Folgeleistung: Bodenbelag keramisch")
    assert following.trades == {"bodenbelag", "fliesen"} and not following.explicit
    assert any(s.explicit and s.quote.startswith("Vorleistung (baus.)") for s in found)


def test_graph_puts_the_screed_before_the_floor_coverings():
    edges = {(e["source"], e["target"]): e for e in RESULT["edges"]}
    e = edges[("18 Estrich", "20 Bodenbelagsarbeiten")]
    assert e["count"] >= 3 and all(x["quote"] for x in e["examples"])
    assert ("17 Trockenbau", "03 Malerarbeiten") in edges  # "Vorleistung: GK Abhangdecke"
    assert len(RESULT["edges"]) < 60  # one edge per real dependency, not per shared word
    assert {n["id"] for n in RESULT["nodes"]} == set(LVS)


def test_roof_drains_fall_between_two_trades():
    """Roofing installs drains 'supplied by others'; roof drainage connects to drains 'by others'."""
    (f,) = [f for f in RESULT["findings"] if f["check_id"] == "P-BOTH-EXPECT-OTHERS"]
    assert f["lvs"] == ["12 Dachabdichtung", "14b Dachentwaesserung"] and f["severity"] == "high"
    quotes = " ".join(s["quote"] for s in f["statements"])
    assert "Bauseitig gelieferte Dach" in quotes and "bauseitigen Dachablauf" in quotes


def test_lv_repeated_inside_another_lv():
    same = {tuple(f["lvs"]): f for f in RESULT["findings"] if f["check_id"] == "P-SAME-SCOPE"}
    f = same[("01 Fertigteiltreppen", "00 Roh und Erdauarbeiten")]
    assert f["title"].startswith("6 of 6 items")
    part_of = {n["id"]: n["part_of"] for n in RESULT["nodes"]}
    assert part_of["01 Fertigteiltreppen"] == "00 Roh und Erdauarbeiten" and part_of["18 Estrich"] is None
    assert ("19 Sektionaltore Stahltueren", "21 Natursteinarbeiten") not in same  # only hourly rates in common


def test_statement_resolution_rules():
    floor = lv("LV_20_Bodenbelag.pdf",
               ("1", "Untergrund vorbereiten", "Vorleistung (baus.): Estrich", 10, "m2"),
               ("2", "Teppichboden verlegen", "Vorleistung: Untergrund vorbereiten\nFolgeleistung: endfertig", 10, "m2"),
               ("3", "Sockelleiste", "Vorleistung: Wandputz", 5, "m"))
    result = analyse_project({"20 Bodenbelag": floor, "18 Estrich": lv("LV_18_Estrich.pdf", ("1", "Zementestrich", "", 10, "m2"))})
    assert [(e["source"], e["target"]) for e in result["edges"]] == [("18 Estrich", "20 Bodenbelag")]
    assert result["statements"]["internal"] == 1  # item 2 names item 1 of its own LV
    (gap,) = result["findings"]
    assert gap["check_id"] == "P-INTERFACE-GAP" and "Putz" in gap["title"]  # no plaster LV in the project


def test_api_project_from_dataset_folder_and_single_lv():
    client = TestClient(api.app)
    assert client.get("/api/projects/samples").json() == [{"folder": "03_pdf_hochbau_projekt", "files": 27}]
    project = client.get("/api/projects/sample", params={"folder": "03_pdf_hochbau_projekt"}).json()
    assert len(project["lvs"]) == 27 and len(project["nodes"]) == 27 and project["edges"]
    estrich = next(row for row in project["lvs"] if row["name"] == "18 Estrich")
    analysis = client.get(f"/api/analyses/{estrich['analysis_id']}").json()
    assert analysis["boq"]["file"] == "LV_18_Estrich.pdf" and len(analysis["boq"]["items"]) == estrich["items"]
    assert client.get("/api/projects/sample", params={"folder": "../x"}).status_code == 404
    with open(F / "LV_18_Estrich.pdf", "rb") as a, open(F / "LV_20_Bodenbelagsarbeiten.pdf", "rb") as b:
        r = client.post("/api/projects", files=[("files", ("LV_18_Estrich.pdf", a)), ("files", ("LV_20_Bodenbelagsarbeiten.pdf", b))])
    assert r.status_code == 200 and [row["name"] for row in r.json()["lvs"]] == ["18 Estrich", "20 Bodenbelagsarbeiten"]
