"""What a project's card says beside the questions: answers to decide on, and how far the bid is."""
import uuid
from decimal import Decimal

from sqlalchemy import delete, insert

from boq import amendments, bid, db


def test_the_card_counts_the_answers_to_decide_and_the_prices_entered():
    pid = uuid.uuid4().hex
    assert amendments.tally(pid) is None and bid.tally(pid) is None  # nothing yet: the card says nothing
    try:
        with db.engine().begin() as conn:
            for kind, status in (("quantity", "accepted"), ("allowance", "accepted"), ("settle", "proposed"),
                                 ("quantity", "proposed"), ("note", "rejected")):
                conn.execute(insert(db.amendments).values(id=uuid.uuid4().hex, project_id=pid, file="lv.x83", item_oz="1.1",
                                                          kind=kind, value={}, quote="", status=status, created=db.now()))
        assert amendments.tally(pid) == {"proposed": 2, "accepted": 2, "quantities": 1, "allowances": 1}

        # the same LV priced in its GAEB file, one item also in its print-out: counted once, on the fuller file
        bid.keep(pid, "lv.x83", {"1.1": (Decimal("9.50"), "own"), "1.2": (Decimal("3"), "suggestion")})
        bid.keep(pid, "lv.pdf", {"1.1": (Decimal("9.50"), "own")})
        assert bid.tally(pid) == {"priced": 2, "priced_all": 3, "from_suggestions": 1}
        bid.keep(pid, "lv.pdf", {"1.1": (None, "own")})
        assert bid.tally(pid) == {"priced": 2, "priced_all": 2, "from_suggestions": 1}
    finally:
        with db.engine().begin() as conn:
            conn.execute(delete(db.amendments).where(db.amendments.c.project_id == pid))
            conn.execute(delete(db.bid_prices).where(db.bid_prices.c.project_id == pid))
