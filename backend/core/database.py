"""Engine/session wiring. The URL comes ONLY from DATABASE_URL.

In production the value is mounted from Secret Manager (urbanoracle-db-url);
locally and in CI it points at a disposable postgres. There is no default —
refusing to guess a database is the fail-closed behavior.
"""

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from core.config import settings

_engine: Engine | None = None
_session_factory: sessionmaker | None = None


def get_engine() -> Engine:
    global _engine, _session_factory
    if _engine is None:
        url = settings.DATABASE_URL
        if not url:
            raise RuntimeError("DATABASE_URL is not set — refusing to guess a database")
        _engine = create_engine(url, pool_pre_ping=True)
        _session_factory = sessionmaker(bind=_engine, expire_on_commit=False)
    return _engine


def get_session() -> Iterator[Session]:
    """FastAPI dependency yielding a short-lived session."""
    get_engine()
    assert _session_factory is not None
    session = _session_factory()
    try:
        yield session
    finally:
        session.close()
