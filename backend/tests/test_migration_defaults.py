"""The LIVE migration must produce is_active DEFAULT false.

Asserted against information_schema of the migrated disposable DB — not
against the model definition — because the schema default is the last line
of defense: a row the provisioning logic never evaluated must not be active.
"""

from sqlalchemy import text


def test_users_is_active_default_is_false(migrated_engine):
    with migrated_engine.connect() as conn:
        default = conn.execute(
            text(
                "SELECT column_default FROM information_schema.columns "
                "WHERE table_name='users' AND column_name='is_active'"
            )
        ).scalar()
    assert default == "false"


def test_auth_uid_is_varchar_not_uuid(migrated_engine):
    with migrated_engine.connect() as conn:
        row = conn.execute(
            text(
                "SELECT data_type, character_maximum_length "
                "FROM information_schema.columns "
                "WHERE table_name='users' AND column_name='auth_uid'"
            )
        ).one()
    assert row.data_type == "character varying"
    assert row.character_maximum_length == 128


def test_org_id_not_null(migrated_engine):
    with migrated_engine.connect() as conn:
        nullable = conn.execute(
            text(
                "SELECT is_nullable FROM information_schema.columns "
                "WHERE table_name='users' AND column_name='org_id'"
            )
        ).scalar()
    assert nullable == "NO"
