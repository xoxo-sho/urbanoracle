"""Production logging: the audit trail at INFO, never an API key.

main.py needs the root logger at INFO so the provisioning audit trail reaches
Cloud Run. That also let httpx's INFO "HTTP Request: GET <url>" line through,
and the e-Stat appId and the ODPT consumer key are URL query parameters — so
every cold fetch wrote both keys to stderr.

Two layers:

1. httpx and httpcore log at WARNING, so request URLs are not logged at all.
2. Defence in depth: every record, from any logger, passes through
   SecretQueryParamFilter at the moment it is created (installed as the record
   factory, so it applies before any handler, including handlers added later
   by uvicorn or a test). A key that reaches a message, its arguments or a
   formatted traceback by some other route is masked there.
"""

import logging
import re

# Query parameters that carry a credential in this service's outbound URLs:
# e-Stat sends appId (services/demographics.py), ODPT sends acl:consumerKey
# (services/odpt.py). httpx does not log headers.
SECRET_QUERY_PARAMS = ("appId", "acl:consumerKey")
MASK = "***"

# Matches the parameter as written (acl:consumerKey) and as percent-encoded in
# a URL (acl%3AconsumerKey); the value runs to the next separator.
_SECRET_PARAM_RE = re.compile(
    r"(?P<name>appId|(?:acl(?::|%3A))?consumerKey)=(?P<value>[^&\s#\"'<>]+)",
    re.IGNORECASE,
)
_TRACEBACK_FORMATTER = logging.Formatter()

ROOT_FORMAT = "%(levelname)s %(name)s %(message)s"
QUIET_LOGGERS = ("httpx", "httpcore")


def mask_secrets(text: str) -> str:
    """Replace the value of every secret query parameter in text with MASK."""
    return _SECRET_PARAM_RE.sub(lambda m: f"{m.group('name')}={MASK}", text)


class SecretQueryParamFilter(logging.Filter):
    """Masks secret query-parameter values in a record's message and traceback.

    Never drops a record: the filter rewrites and always returns True.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            message = record.getMessage()
        except Exception:
            # A msg/args mismatch is reported by logging itself when the record
            # is formatted; leave the record as it is.
            return True
        masked = mask_secrets(message)
        if masked != message:
            record.msg = masked
            record.args = ()
        if record.exc_text:
            record.exc_text = mask_secrets(record.exc_text)
        elif record.exc_info:
            text = _TRACEBACK_FORMATTER.formatException(record.exc_info)
            masked_text = mask_secrets(text)
            if masked_text != text:
                # Formatter.format() uses exc_text when it is already set.
                record.exc_text = masked_text
        if record.stack_info:
            record.stack_info = mask_secrets(record.stack_info)
        return True


_FILTER = SecretQueryParamFilter()
_masking_installed = False


def install_secret_masking() -> None:
    """Pass every record created from now on through SecretQueryParamFilter."""
    global _masking_installed
    if _masking_installed:
        return
    previous = logging.getLogRecordFactory()

    def masked_record_factory(*args, **kwargs) -> logging.LogRecord:
        record = previous(*args, **kwargs)
        _FILTER.filter(record)
        return record

    logging.setLogRecordFactory(masked_record_factory)
    _masking_installed = True


def configure_logging() -> None:
    """Root at INFO for the audit trail; request URLs and key values never logged."""
    logging.basicConfig(level=logging.INFO, format=ROOT_FORMAT, force=True)
    for name in QUIET_LOGGERS:
        logging.getLogger(name).setLevel(logging.WARNING)
    install_secret_masking()
