"""The mock world of the demo mail server (mock/mail/, boq.mockmail): it must build, every LV in it must
read back with the app's parsers, and the app must see its tenders as mail with LVs attached."""
from datetime import date

from boq import inbox, mockmail


def test_the_mock_world_builds_and_every_lv_reads_back():
    said = mockmail.check(say=lambda _: None)
    assert said["messages"] > 100 and said["lvs"] >= 10 and said["items"] > 300


def test_every_message_has_its_own_id_and_answers_only_what_came_before():
    _, mails, _ = mockmail.build()
    ids = [m.message_id for m in mails]
    assert len(ids) == len(set(ids)) and all(i.endswith(">") and ".mock@" in i for i in ids)
    seen = set()
    for m in mails:  # in the order they were sent
        assert not m.message["In-Reply-To"] or str(m.message["In-Reply-To"]) in seen, m.key
        seen.add(m.message_id)


def test_the_tenders_of_the_last_days_reach_our_inbox_with_an_lv_and_a_deadline_ahead():
    today = date.today()
    parties, mails, _ = mockmail.build(today=today)
    ours = parties["us"].first.email
    recent = [inbox.from_eml(m.message.as_bytes()) for m in mails
              if ours in [p.email for p in m.to] and (today - m.at.date()).days <= inbox.LOOK_BACK_DAYS]
    with_lv = [m for m in recent if any(name.lower().endswith((".x83", ".d83", ".xlsx", ".pdf")) for name, _ in m["files"])]
    assert len(with_lv) >= 7
    assert all(m["sender"] and m["subject"] and m["text"] for m in recent)


def test_dates_are_relative_to_the_day_of_the_fill():
    assert mockmail.dated("bis {+12}", date(2026, 11, 22)) == "bis 04.12.2026"
    assert mockmail.dated("{+13|long}", date(2026, 11, 22)) == "Montag, 07.12.2026"  # a Saturday moves to Monday
    assert mockmail.day_of(-1, date(2026, 11, 23)) == date(2026, 11, 20)  # a Sunday moves back to Friday
