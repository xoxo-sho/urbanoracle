"""Station ridership from ODPT (公共交通オープンデータセンター).

The station GeoJSON we ship carries geometry and line names but no ridership,
which is why every station reported 0 passengers. ODPT publishes real figures,
but joining them to our data has three traps, each handled explicitly here.

**1. The join is two-hop, not by name.** ODPT identifies a station by URN
(``odpt.Station:TokyoMetro.Ginza.Shibuya``), and the ridership survey keys on
that URN. Only the station master (``odpt:Station``) carries the Japanese
name. So: our name -> ``dc:title`` -> ``owl:sameAs`` URN -> survey figure.

**2. Names differ by a kana character.** ODPT writes 霞ケ関 (katakana ケ); the
GeoJSON writes 霞ヶ関 (small ヶ). An exact-string join drops such stations
*silently* — they simply show no ridership, indistinguishable from a station
ODPT genuinely does not cover. ``normalize_station_name`` folds these; it
recovers 7 stations, and removing it is a silent regression, so it has its own
fault-injection test.

**3. The figure means different things per operator.** ``odpt:includeAlighting``
is true for most records (乗降客数, boardings + alightings) and false for a
minority (乗車人員, boardings only). Mixing them yields a column with no single
definition. Only ``includeAlighting == true`` records are used; the rest are
treated as no-data.

Anything not covered — JR East, Keio, Odakyu, Tokyu, Keisei, and the
boardings-only records — becomes ``None``, never 0. A fabricated zero would
read as "this station has no passengers", which is a claim the data does not
make.
"""

import logging
import unicodedata

import httpx

from core.config import settings

logger = logging.getLogger(__name__)

ODPT_BASE = "https://api.odpt.org/api/v4"
STATION_ENDPOINT = f"{ODPT_BASE}/odpt:Station"
SURVEY_ENDPOINT = f"{ODPT_BASE}/odpt:PassengerSurvey"

SOURCE_LABEL = "公共交通オープンデータセンター（ODPT）"


def normalize_station_name(name: str) -> str:
    """Fold the spelling differences between our GeoJSON and ODPT.

    Trailing 駅 only — stripping every 駅 would turn 大塚駅前 into 大塚前 and
    quietly match the wrong stop.
    """
    if not name:
        return ""
    text = name.strip()
    if text.endswith("駅"):
        text = text[:-1]
    text = unicodedata.normalize("NFKC", text)
    # Small kana used interchangeably in station names.
    text = text.replace("ヶ", "ケ").replace("ヵ", "カ")
    return text.strip()


def build_name_to_urn(stations: list[dict]) -> dict[str, str]:
    """Pure: odpt:Station records -> {normalized JP name: URN}."""
    mapping: dict[str, str] = {}
    for s in stations:
        title = s.get("dc:title")
        urn = s.get("owl:sameAs")
        if not title or not urn:
            continue
        mapping.setdefault(normalize_station_name(title), urn)
    return mapping


def build_urn_to_passengers(surveys: list[dict]) -> dict[str, int]:
    """Pure: odpt:PassengerSurvey records -> {URN: latest passengers}.

    Only records that include alighting are kept, so every returned figure is
    a 乗降客数 on the same definition. Boardings-only records are omitted
    entirely rather than being scaled or mixed in.
    """
    out: dict[str, int] = {}
    for survey in surveys:
        if survey.get("odpt:includeAlighting") is not True:
            continue
        objects = survey.get("odpt:passengerSurveyObject") or []
        usable = [
            o for o in objects
            if isinstance(o.get("odpt:passengerJourneys"), int)
            and isinstance(o.get("odpt:surveyYear"), int)
        ]
        if not usable:
            continue
        latest = max(usable, key=lambda o: o["odpt:surveyYear"])
        for urn in survey.get("odpt:station") or []:
            out[urn] = latest["odpt:passengerJourneys"]
    return out


def build_ridership(stations: list[dict], surveys: list[dict]) -> dict[str, int]:
    """Pure: the full two-hop join -> {normalized JP name: passengers}."""
    name_to_urn = build_name_to_urn(stations)
    urn_to_passengers = build_urn_to_passengers(surveys)
    return {
        name: urn_to_passengers[urn]
        for name, urn in name_to_urn.items()
        if urn in urn_to_passengers
    }


def latest_survey_year(surveys: list[dict]) -> int | None:
    """The newest survey year present, for the provenance line."""
    years = [
        o.get("odpt:surveyYear")
        for s in surveys
        if s.get("odpt:includeAlighting") is True
        for o in (s.get("odpt:passengerSurveyObject") or [])
        if isinstance(o.get("odpt:surveyYear"), int)
    ]
    return max(years) if years else None


async def fetch_ridership() -> tuple[dict[str, int], int | None]:
    """Live ridership keyed by normalized station name.

    Raises on any failure so the caller reports isLive=false and renders
    データなし, rather than silently showing zeros.
    """
    api_key = settings.ODPT_API_KEY
    if not api_key:
        raise RuntimeError("ODPT_API_KEY is not set")

    params = {"acl:consumerKey": api_key}
    async with httpx.AsyncClient() as client:
        station_res = await client.get(STATION_ENDPOINT, params=params, timeout=60.0)
        if station_res.status_code != 200:
            raise RuntimeError(f"odpt:Station error: {station_res.status_code}")
        survey_res = await client.get(SURVEY_ENDPOINT, params=params, timeout=60.0)
        if survey_res.status_code != 200:
            raise RuntimeError(f"odpt:PassengerSurvey error: {survey_res.status_code}")

    stations = station_res.json()
    surveys = survey_res.json()
    if not isinstance(stations, list) or not isinstance(surveys, list):
        # An auth failure returns an object, not the expected array.
        raise RuntimeError("ODPT returned an unexpected payload shape")

    ridership = build_ridership(stations, surveys)
    if not ridership:
        raise RuntimeError("ODPT returned no usable ridership records")
    return ridership, latest_survey_year(surveys)
