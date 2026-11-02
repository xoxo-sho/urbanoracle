"""No API key value may reach a log record.

The e-Stat appId travels as a URL query parameter. httpx logs every request
URL at INFO, and main.py raises the root logger to INFO for the provisioning
audit trail — together they wrote the key to Cloud Run's stderr on every cold
fetch.

This drives the real data routes through a mocked transport (so httpx's own
request logging runs exactly as in production), under the logging
configuration that importing main applies, and inspects every record that is
created while the routes run.
"""

import asyncio
import logging

import httpx
import pytest

import main  # noqa: F401  importing main applies the production logging configuration
from core import cache
from routers import data as data_routes

# Shaped like the real value (e-Stat appId: 40 hex) so a masker keyed on the
# value's shape would be exercised too.
ESTAT_KEY = "e5a1" + "0123456789abcdef" * 2 + "c0de"
FORMAT = logging.Formatter("%(levelname)s %(name)s %(message)s")


class _CollectEverything(logging.Handler):
    def __init__(self) -> None:
        super().__init__(level=logging.NOTSET)
        self.records: list[logging.LogRecord] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.records.append(record)


def _record_text(record: logging.LogRecord) -> str:
    # The formatted line is what a handler writes; msg and args are what a
    # structured handler could serialise instead.
    return "\n".join([FORMAT.format(record), str(record.msg), repr(record.args)])


def _mock_upstream(status: int):
    requested: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requested.append(str(request.url))
        if status != 200:
            return httpx.Response(status, json={})
        if request.url.host == "api.e-stat.go.jp":
            return httpx.Response(
                200,
                json={
                    "GET_STATS_DATA": {
                        "RESULT": {"STATUS": 0},
                        "STATISTICAL_DATA": {"DATA_INF": {"VALUE": []}},
                    }
                },
            )
        return httpx.Response(404, json={})

    return handler, requested


@pytest.mark.parametrize("status", [200, 500], ids=["upstream-200", "upstream-500"])
def test_no_api_key_value_in_any_log_record_during_estat_calls(monkeypatch, status):
    monkeypatch.setenv("ESTAT_API_KEY", ESTAT_KEY)
    handler, requested = _mock_upstream(status)
    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda *args, **kwargs: real_client(*args, transport=httpx.MockTransport(handler), **kwargs),
    )

    # Recreate the production logging state. main.py puts the root logger at
    # INFO, and the server process never runs Alembic. In this test session the
    # migration fixture does: Alembic's fileConfig lowers root to WARNING and
    # disables every logger that already exists (httpx among them), which would
    # make a clean log here vacuous. Undo exactly that, and nothing else — the
    # httpx/httpcore levels are what is under test and are left as main set them.
    root = logging.getLogger()
    previous_root_level = root.level
    for existing in list(logging.Logger.manager.loggerDict.values()):
        if isinstance(existing, logging.Logger) and existing.disabled:
            monkeypatch.setattr(existing, "disabled", False)
    root.setLevel(logging.INFO)
    collector = _CollectEverything()
    root.addHandler(collector)
    cache.clear()
    try:
        asyncio.run(data_routes.get_demographics())
    finally:
        root.removeHandler(collector)
        root.setLevel(previous_root_level)
        cache.clear()

    # The key really travelled through httpx, so a clean log is not vacuous.
    assert any(ESTAT_KEY in url for url in requested if "api.e-stat.go.jp" in url)

    leaking = [
        f"{r.name} {r.levelname}"
        for r in collector.records
        if ESTAT_KEY in _record_text(r)
    ]
    assert leaking == [], f"{len(leaking)} log record(s) carry an API key value: {leaking}"
