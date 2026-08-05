"""Fixtures. The database is ALWAYS a disposable one.

DATABASE_URL must point at the CI service container or a local throwaway
postgres. There is no fallback and no default — pointing tests at a real
database by accident is exactly the failure this refuses to allow.

Schema comes from the real Alembic migration (upgrade head), not
Base.metadata.create_all — the migration-defaults test asserts what the
migration actually produces, so the migration must be what runs.
"""

import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker


@pytest.fixture(scope="session")
def database_url() -> str:
    url = os.environ.get("DATABASE_URL", "")
    if not url:
        pytest.exit(
            "DATABASE_URL must point at a DISPOSABLE test postgres "
            "(CI service container or local throwaway). Refusing to guess.",
            returncode=1,
        )
    return url


@pytest.fixture(scope="session")
def migrated_engine(database_url):
    engine = create_engine(database_url)
    # Disposable DB: reset so repeated local runs start from a clean slate.
    with engine.begin() as conn:
        conn.execute(
            text("DROP TABLE IF EXISTS users, organizations, alembic_version CASCADE")
        )
    cfg = Config(str(BACKEND / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND / "alembic"))
    command.upgrade(cfg, "head")
    yield engine
    engine.dispose()


@pytest.fixture()
def session_factory(migrated_engine):
    return sessionmaker(bind=migrated_engine, expire_on_commit=False)


@pytest.fixture()
def db_session(migrated_engine, session_factory):
    with migrated_engine.begin() as conn:
        conn.execute(text("TRUNCATE users, organizations CASCADE"))
    session = session_factory()
    try:
        yield session
    finally:
        session.close()
