"""Migration 002 — verification_email_sends — and the test cleanup (R-B12).

The table behind POST /api/v1/auth/verification-email's cooldown and daily
limit: id bigserial primary key, auth_uid varchar(128) NOT NULL (users.auth_uid's
type), sent_at timestamptz NOT NULL default now(), an index on
(auth_uid, sent_at DESC); no foreign key, no email column. The schema comes
from the real migration (conftest runs `upgrade head`), and the table joins
conftest's DROP and TRUNCATE lists so no test can see another's rows.
"""

import re
from pathlib import Path

from sqlalchemy import text

TABLE = "verification_email_sends"
INDEX = "ix_verification_email_sends_auth_uid_sent_at"


def test_rb12_table_shape(db_session):
    columns = db_session.execute(
        text(
            "SELECT column_name, data_type, is_nullable, column_default, character_maximum_length "
            "FROM information_schema.columns "
            "WHERE table_schema = 'public' AND table_name = :t ORDER BY ordinal_position"
        ),
        {"t": TABLE},
    ).all()
    constraints = db_session.execute(
        text(
            "SELECT tc.constraint_type, kcu.column_name "
            "FROM information_schema.table_constraints tc "
            "JOIN information_schema.key_column_usage kcu "
            "ON tc.constraint_name = kcu.constraint_name "
            "WHERE tc.table_schema = 'public' AND tc.table_name = :t"
        ),
        {"t": TABLE},
    ).all()
    index = db_session.execute(
        text("SELECT indexdef FROM pg_indexes WHERE tablename = :t AND indexname = :i"),
        {"t": TABLE, "i": INDEX},
    ).scalar_one_or_none()

    assert [(c[0], c[1], c[2]) for c in columns] == [
        ("id", "bigint", "NO"),
        ("auth_uid", "character varying", "NO"),
        ("sent_at", "timestamp with time zone", "NO"),
    ], columns
    assert str(columns[0][3]).startswith("nextval("), "id is a bigserial"
    assert columns[1][4] == 128, "auth_uid is varchar(128), users.auth_uid's type"
    assert columns[2][3] == "now()"
    assert [tuple(c) for c in constraints] == [("PRIMARY KEY", "id")], "no foreign key"
    assert index is not None and "(auth_uid, sent_at DESC)" in index, index


def test_rb12_insert_select_delete(db_session):
    uid = "ledger-gipuid-insert-000001"
    row_id = db_session.execute(
        text(f"INSERT INTO {TABLE} (auth_uid) VALUES (:u) RETURNING id"), {"u": uid}
    ).scalar_one()
    db_session.commit()
    sent_at = db_session.execute(
        text(f"SELECT sent_at FROM {TABLE} WHERE id = :i"), {"i": row_id}
    ).scalar_one()
    assert sent_at.tzinfo is not None, "timestamptz, defaulted by now()"
    db_session.execute(text(f"DELETE FROM {TABLE} WHERE id = :i"), {"i": row_id})
    db_session.commit()
    left = db_session.execute(
        text(f"SELECT count(*) FROM {TABLE} WHERE auth_uid = :u"), {"u": uid}
    ).scalar_one()
    assert left == 0


def test_rb12_model_matches_the_table():
    from db import models

    assert hasattr(models, "VerificationEmailSend"), "db.models.VerificationEmailSend does not exist yet"
    table = models.VerificationEmailSend.__table__
    assert table.name == TABLE
    assert list(table.c.keys()) == ["id", "auth_uid", "sent_at"]
    assert table.c.auth_uid.type.length == 128
    assert [i.name for i in table.indexes] == [INDEX]


def test_rb12_conftest_drops_and_truncates_the_table():
    """The repo's two cleanup lists (conftest.py: DROP at session start,
    TRUNCATE per test) must name the ledger, or a test's rows survive into the
    next test — the same property Parti pins with PER_UID_TABLES."""
    source = Path(__file__).with_name("conftest.py").read_text(encoding="utf-8")
    drop = re.search(r"DROP TABLE IF EXISTS[^\n]*", source)
    truncate = re.search(r"TRUNCATE[^\n]*", source)
    assert drop and TABLE in drop.group(0), drop.group(0) if drop else "no DROP TABLE in conftest"
    assert truncate and TABLE in truncate.group(0), truncate.group(0) if truncate else "no TRUNCATE in conftest"


def test_rb12_each_test_starts_with_an_empty_ledger(db_session):
    """Functional half of the cleanup check: whatever an earlier test left,
    this test's fixture has already emptied it."""
    assert db_session.execute(text(f"SELECT count(*) FROM {TABLE}")).scalar_one() == 0
    db_session.execute(text(f"INSERT INTO {TABLE} (auth_uid) VALUES ('ledger-gipuid-leftover-01')"))
    db_session.commit()


def test_rb12_the_leftover_above_is_gone(db_session):
    assert db_session.execute(text(f"SELECT count(*) FROM {TABLE}")).scalar_one() == 0
