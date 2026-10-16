"""The two layers of core/logging_setup.py, each checked on its own."""

import logging
import sys

import main  # noqa: F401  importing main applies the production logging configuration
from core.logging_setup import MASK, SecretQueryParamFilter, mask_secrets

ESTAT_URL = "https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData?appId=0123456789abcdef0123456789abcdef01234567&statsDataId=0003448299"
ODPT_URL = "https://api.odpt.org/api/v4/odpt:Station?acl%3AconsumerKey=AbCdEf0123456789"


def test_httpx_and_httpcore_loggers_are_at_warning_after_main_is_imported():
    assert logging.getLogger("httpx").level == logging.WARNING
    assert logging.getLogger("httpcore").level == logging.WARNING


def test_mask_secrets_replaces_appid_and_consumer_key_values_and_keeps_other_parameters():
    assert mask_secrets(ESTAT_URL) == (
        f"https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData?appId={MASK}&statsDataId=0003448299"
    )
    assert mask_secrets(ODPT_URL) == f"https://api.odpt.org/api/v4/odpt:Station?acl%3AconsumerKey={MASK}"
    assert mask_secrets("acl:consumerKey=AbCdEf0123456789 tail") == f"acl:consumerKey={MASK} tail"


def test_filter_masks_message_arguments_and_traceback_text():
    try:
        raise RuntimeError(f"upstream failed for {ESTAT_URL}")
    except RuntimeError:
        exc_info = sys.exc_info()
    record = logging.LogRecord("x", logging.WARNING, __file__, 1, "GET %s", (ODPT_URL,), exc_info)

    assert SecretQueryParamFilter().filter(record) is True

    assert "AbCdEf0123456789" not in record.getMessage()
    assert record.args == ()
    assert "0123456789abcdef0123456789abcdef01234567" not in record.exc_text
    assert f"appId={MASK}" in record.exc_text


def test_records_from_any_logger_are_masked_when_created_after_main_is_imported():
    record = logging.getLogger("some.other.library").makeRecord(
        "some.other.library", logging.INFO, __file__, 1, "fetched %s", (ESTAT_URL,), None
    )
    assert record.getMessage() == (
        f"fetched https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData?appId={MASK}&statsDataId=0003448299"
    )
