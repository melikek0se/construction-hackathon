"""The risk allowance follows where the prices come from."""
from boq import risk


def _row(oz, price, qty, source, suggestion=None):
    return {"item_oz": oz, "label": oz, "price": price, "qty": qty, "source": source, "suggestion": suggestion}


def test_the_allowance_grows_with_what_the_prices_rest_on_and_names_the_items_behind_it():
    quoted = {"1": {"status": "quoted", "taken": True, "valid_until": "2027-02-01", "alternative": False}}
    firm = risk.assess([_row("1", 100.0, 10, "quote")], quoted, "2027-01-15")
    guessed = risk.assess([_row("1", 100.0, 10, "suggestion", {"unit_price": 100.0, "low": 70.0, "high": 130.0})], {}, None)
    assert firm["total"] == guessed["total"] == 1000.0
    assert 0 < firm["allowance_percent"] < 2 < guessed["allowance_percent"]  # ±2 % against ±30 %
    assert guessed["top"][0]["band"] == 30.0 and guessed["by_basis"][0]["basis"] == "history"
    # a quote that runs out before the bid stops binding is softer; an open question tops everything
    soft = risk.assess([_row("1", 100.0, 10, "quote")], quoted, "2027-03-01")
    assert soft["top"][0]["basis"] == "quote_soft" and soft["allowance"] > firm["allowance"]
    waits = risk.assess([_row("1", 100.0, 10, "own"), _row("2", None, 5, None)], {"1": {"status": "waits"}}, None)
    assert waits["top"][0]["basis"] == "open_question" and waits["gaps"] == 1 and waits["priced"] == 1
    assert risk.assess([_row("1", 100.0, 10, "own")], {}, None) == risk.assess([_row("1", 100.0, 10, "own")], {}, None)  # seeded
    assert risk.assess([], {}, None)["allowance"] == 0.0
