"""Follow-up 3, decision A (Architect, 2026-11-09): 東京都交通局's own figures beside S12's.

On main (9010a53) every 都営 figure in 駅一覧 is 国土数値情報 S12's. At 46 of
S12's 東京都 rows the 2024年度 value is below the figure 東京都交通局 publishes
itself, and at six stations (押上, 目黒, 白金高輪, 白金台, 新宿, 九段下) and on
the second line of five (三田, 大門, 春日, 神保町, 森下) S12 writes the 都営
figure on another row or on none. The decision (option 3):

- every sum stays on S12 as published — 日間乗降客, 事業者別, 乗降客数推移, the
  comparison table. No number in them changes;
- 駅一覧 shows, for every 都営地下鉄 and 日暮里・舎人ライナー station-line of the
  23 wards, 東京都交通局's published 乗降人員 with its 年度 beside S12's figure:
  都営地下鉄 2024年度, 日暮里・舎人ライナー 2023年度 (the latest open figure);
- the source is the 公共交通オープンデータセンター's public endpoint (no key),
  ``odpt:PassengerSurvey`` for ``odpt.Operator:Toei``, committed as a file and
  built into the snapshot with its source block — URL, retrieval time,
  sha256, CC BY 4.0 — and the credit 「東京都交通局・公共交通オープンデータ協議会」
  in the センター's prescribed form;
- matching is by line and station name, every unmatched or renamed case
  reported;
- the notice gains, as facts only: the sums use 国土数値情報's values; 都営 rows
  also show 交通局's own figure, which counts transfers between 都営 lines on
  both lines; at 46 rows S12's 2024年度 value is below 交通局's. No cause.

Nothing below is typed by hand except the pinned file, the Architect's
spot-check and cross-check figures, and the names of the stations the
decision lists: every other expected value is recomputed here from the
committed 乗降者数情報 and the committed S12 excerpt. RED on main (9010a53).
"""

from __future__ import annotations

import hashlib
import importlib
import importlib.util
import json
import os
import subprocess
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import core.authz as authz
from core import cache
from core.database import get_session
from main import app

BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND.parent
FIXTURES = BACKEND / "tests" / "fixtures" / "stations"
SNAPSHOT = BACKEND / "data" / "stations.json"
BUILDER = ROOT / "etl" / "stations.py"
ROUTE = "/api/v1/transport"
SURVEY = FIXTURES / "odpt_PassengerSurvey_Toei.json"
TITLES = FIXTURES / "odpt_toei_titles.json"
META = FIXTURES / "odpt.meta.json"

# The pinned response (retrieved 2026-11-09 from the public endpoint, no key).
SURVEY_URL = "https://api-public.odpt.org/api/v4/odpt:PassengerSurvey?odpt:operator=odpt.Operator:Toei"
SURVEY_SHA256 = "72ec43dae65535685e8344cacc7ab033264fa4a34267fe1f7c80d524c8cd4e63"
CATALOG = "https://ckan.odpt.org/dataset/r_passenger_survey-toei"

PROVIDER = "東京都交通局・公共交通オープンデータ協議会"
CONTENT = "東京都交通局 乗降者数情報"
# The センター's FAQ form (https://developer.odpt.org/ja/faq-info): provider、name、
# 「クリエイティブ・コモンズ・ライセンス　表示4.0国際（URL）」 — with the full-width
# space the FAQ sets — and, for a modified use, the sentence and a space before it.
CREDIT = f"{PROVIDER}、{CONTENT}、クリエイティブ・コモンズ・ライセンス　表示4.0国際（https://creativecommons.org/licenses/by/4.0/deed.ja）"
EDITED = f"このサービスは、以下の著作物を改変して利用しています。 {CREDIT}"

OPERATOR = "東京都"
LINER = "日暮里・舎人ライナー"
SUBWAY_LINES = ["1号線浅草線", "6号線三田線", "10号線新宿線", "12号線大江戸線"]
SUBWAY_YEAR, LINER_YEAR = 2024, 2023

# The Architect's spot-check (brief 2026-11-09) and the sums that must not move.
SENGAKUJI = {"own": 209_882, "s12": 33_601}
BELOW_ROWS = 46
K3 = {"江戸川区": 627_375}
K3_TOKYO23 = 43_538_060
T3_TOKYO23_2024 = 34_561_088
# Stations where S12 writes the 都営 figure on another row, and the second
# lines S12 writes on no row of their own (the decision names them).
NO_OWN_ROW = [("押上", "墨田区", "1号線浅草線"), ("目黒", "品川区", "6号線三田線"), ("白金高輪", "港区", "6号線三田線"), ("白金台", "港区", "6号線三田線"), ("新宿", "新宿区", "10号線新宿線"), ("新宿", "渋谷区", "12号線大江戸線"), ("九段下", "千代田区", "10号線新宿線")]
SECOND_LINES = [("三田", "港区", "6号線三田線"), ("大門", "港区", "12号線大江戸線"), ("春日", "文京区", "12号線大江戸線"), ("神保町", "千代田区", "10号線新宿線"), ("森下", "江東区", "12号線大江戸線")]

ACTIVE = {"Authorization": "Bearer active-token"}
TOKENS = {"active-token": {"sub": "gipuid_toei_active_00000001", "email": "analyst@customcorp.jp", "email_verified": True}}


def _builder():
    assert BUILDER.is_file()
    spec = importlib.util.spec_from_file_location("stations_etl_toei", BUILDER)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="module")
def etl():
    return _builder()


@pytest.fixture(scope="module")
def built(etl) -> dict:
    return etl.build()


def _snapshot() -> dict:
    return json.loads(SNAPSHOT.read_text(encoding="utf-8"))


def _key(name: str) -> str:
    return unicodedata.normalize("NFKC", name).replace("ヶ", "ケ").replace(" ", "")


def _short(line: str) -> str:
    head, sep, tail = line.partition("号線")
    return tail if sep and head.isdigit() else line


@pytest.fixture(scope="module")
def published() -> dict[tuple[str, str], tuple[int, int]]:
    """(the センター's line title, station title) → (latest 年度, 1日平均乗降人員), from the committed files."""
    titles = json.loads(TITLES.read_text(encoding="utf-8"))
    out = {}
    for obj in json.loads(SURVEY.read_text(encoding="utf-8")):
        latest = max(obj["odpt:passengerSurveyObject"], key=lambda o: o["odpt:surveyYear"])
        station = titles["stations"][obj["odpt:station"][0]]["title"]
        line = titles["railways"][obj["odpt:railway"][0]]["title"]
        out[(line, _key(station))] = (latest["odpt:surveyYear"], latest["odpt:passengerJourneys"])
    return out


@pytest.fixture(scope="module")
def toei_rows(etl) -> list[dict]:
    """S12's 東京都 rows on the five lines, each with its ward and its own 2024 figure (None on another row)."""
    n03 = json.loads((FIXTURES / etl.N03_EXCERPT).read_text(encoding="utf-8"))
    s12 = json.loads((FIXTURES / etl.S12_EXCERPT).read_text(encoding="utf-8"))
    index = etl.WardIndex(n03["features"])
    rows = []
    for f in s12["features"]:
        p = f["properties"]
        if p[etl.OPERATOR] != OPERATOR or p[etl.LINE] not in SUBWAY_LINES + [LINER]:
            continue
        ward = index.ward_of(*etl.midpoint(f["geometry"]["coordinates"]))
        own = p[etl.column(2024, 3)] if (p[etl.column(2024, 0)] == 1 and p[etl.column(2024, 1)] == 1) else None
        rows.append({"name": p[etl.NAME], "line": p[etl.LINE], "ward": ward[1], "s12": own})
    return rows


def _figures(snapshot: dict) -> dict[tuple[str, str, str], dict]:
    """(station, ward, line) → the own figure on that station."""
    out = {}
    for st in snapshot["stations"]:
        for f in st.get("ownFigures", []):
            assert (st["name"], st["ward"], f["line"]) not in out
            out[(st["name"], st["ward"], f["line"])] = f
    return out


# --- the committed source ------------------------------------------------------------------


def test_the_source_is_the_pinned_public_endpoint_response_with_its_licence_and_provider():
    meta = json.loads(META.read_text(encoding="utf-8"))
    assert hashlib.sha256(SURVEY.read_bytes()).hexdigest() == SURVEY_SHA256 == meta["survey"]["sha256"]
    assert meta["survey"]["url"] == SURVEY_URL and meta["survey"]["bytes"] == SURVEY.stat().st_size
    assert meta["retrieved"].startswith("2026-11-09T") and meta["retrieved"].endswith("Z")
    assert "CC BY 4.0" in meta["licence"] and meta["provider"] == PROVIDER and meta["catalog"] == CATALOG
    # The public endpoint: no token in any address, anywhere in the committed files.
    for path in (SURVEY, TITLES, META):
        text = path.read_text(encoding="utf-8")
        assert "consumerKey" not in text and "acl:" not in text, path.name
    assert all(u["url"].startswith("https://api-public.odpt.org/") for u in meta["titles"]["from"])
    assert SURVEY.stat().st_size + TITLES.stat().st_size + META.stat().st_size < 150_000


def test_the_snapshot_carries_the_source_block_the_licence_and_the_credit(built):
    assert built["sources"]["operatorFigures"]["year"] == SUBWAY_YEAR
    assert built["sources"]["operatorFigures"]["table"] == "odpt:PassengerSurvey"
    label = built["sources"]["operatorFigures"]["label"]
    assert CONTENT in label and f"都営地下鉄 {SUBWAY_YEAR}年度" in label and f"{LINER} {LINER_YEAR}年度" in label
    cut = built["inputs"]["odpt_PassengerSurvey_Toei.json"]
    assert cut["sha256"] == SURVEY_SHA256
    assert cut["cut_from"]["url"] == SURVEY_URL and cut["cut_from"]["sha256"] == SURVEY_SHA256
    assert cut["cut_from"]["retrieved"].startswith("2026-11-09T") and "CC BY 4.0" in cut["cut_from"]["licence"]
    licence = built["licence"]["operatorFigures"]
    assert "CC BY 4.0" in licence["name"] and licence["url"].startswith("https://creativecommons.org/licenses/by/4.0/")
    assert CATALOG in licence["basis"] and PROVIDER in licence["basis"] and "アクセストークンの要らない公開エンドポイント" in licence["basis"]
    assert built["credit"]["toei"] == CREDIT and built["credit"]["toei_edited"] == EDITED
    # The S12 credits and the licence the sums rest on are untouched.
    assert built["credit"]["edited_s12"].endswith("を加工して作成") and built["licence"]["url"].endswith("agreement.html")


# --- every 都営 station-line, matched by line and station name -------------------------------------


def test_every_toei_station_line_of_the_23_wards_carries_the_published_figure_and_its_year(built, published, toei_rows):
    figures = _figures(built)
    want: dict[tuple[str, str, str], dict] = {}
    for r in toei_rows:
        year, value = published[(_short(r["line"]), _key(r["name"]))]
        entry = want.setdefault((r["name"], r["ward"], r["line"]), {"operator": OPERATOR, "line": r["line"], "year": year, "passengers": value, "s12": None})
        if r["s12"] is not None:
            entry["s12"] = (entry["s12"] or 0) + r["s12"]
    assert figures == want
    assert len(figures) == built["operatorFigures"]["stationLines"] == 118
    assert {f["year"] for (_, _, line), f in figures.items() if line in SUBWAY_LINES} == {SUBWAY_YEAR}
    assert {f["year"] for (_, _, line), f in figures.items() if line == LINER} == {LINER_YEAR}
    assert sum(1 for (_, _, line) in figures if line == LINER) == 13
    # No other operator's line, and no 荒川線 (the 乗降者数情報 has none), carries one.
    for st in built["stations"]:
        lines = {(o["name"], line) for o in st["operators"] for line in o["lines"]}
        for f in st.get("ownFigures", []):
            assert (f["operator"], f["line"]) in lines and f["line"] in SUBWAY_LINES + [LINER]


def test_the_architects_spot_checks(built):
    figures = _figures(built)
    sengakuji = figures[("泉岳寺", "港区", "1号線浅草線")]
    assert (sengakuji["passengers"], sengakuji["s12"], sengakuji["year"]) == (SENGAKUJI["own"], SENGAKUJI["s12"], SUBWAY_YEAR)
    # Where S12 writes the 都営 figure on another row, the station still shows 交通局's.
    for key in NO_OWN_ROW + SECOND_LINES:
        assert key in figures, key
        assert figures[key]["s12"] is None and figures[key]["passengers"] > 0 and figures[key]["year"] == SUBWAY_YEAR
    # 三田 carries both lines: the first with S12's own figure, the second without one.
    assert figures[("三田", "港区", "1号線浅草線")]["s12"] is not None
    assert [f["line"] for f in next(s for s in built["stations"] if s["name"] == "三田" and s["ward"] == "港区")["ownFigures"]] == ["1号線浅草線", "6号線三田線"]
    # A liner station: the latest open figure is 2023年度.
    nippori = figures[("日暮里", "荒川区", LINER)]
    assert nippori["year"] == LINER_YEAR and nippori["passengers"] > nippori["s12"] > 0


def test_the_matching_report_lists_every_unmatched_or_renamed_case(built):
    m = built["operatorFigures"]["matching"]
    assert m["objects"] == 119 and m["matched"] == 118
    # 本八幡 (新宿線) lies in 千葉県: the one object outside the 23 wards.
    assert [(c["line"], c["station"]) for c in m["outsideWards"]] == [("新宿線", "本八幡")]
    assert m["unmatchedInsideWards"] == [] and m["s12RowsWithoutObject"] == []
    assert m["renamed"] == []
    assert m["linesWithoutObjects"] == ["荒川線"]
    assert "駅名の一致" in m["rule"]


def test_builder_refuses_a_file_that_no_longer_fits(etl, tmp_path):
    def build_with(mutate_titles=None, mutate_survey=None) -> None:
        for source in FIXTURES.iterdir():
            if source.is_file():
                (tmp_path / source.name).write_bytes(source.read_bytes())
        if mutate_titles:
            doc = json.loads(TITLES.read_text(encoding="utf-8"))
            mutate_titles(doc)
            (tmp_path / TITLES.name).write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
        if mutate_survey:
            (tmp_path / SURVEY.name).write_bytes(mutate_survey(SURVEY.read_bytes()))
        etl.build(tmp_path)

    build_with()  # the committed files build from a copy
    with pytest.raises(ValueError):  # the response is not the one the meta pins
        build_with(mutate_survey=lambda raw: raw.replace(b"209882", b"209883"))
    with pytest.raises(ValueError):  # a station inside the 23 wards that matches no S12 row
        build_with(mutate_titles=lambda d: d["stations"]["odpt.Station:Toei.Asakusa.Sengakuji"].__setitem__("title", "別の駅"))


# --- every sum stays on S12 ----------------------------------------------------------------------


def test_no_sum_moves(built, toei_rows):
    wards = {w["name"]: w["passengers"] for w in built["wards"]}
    assert {name: wards[name] for name in K3} == K3
    assert sum(wards.values()) == K3_TOKYO23
    total = built["trend"]["views"][0]
    assert total["code"] == "13100" and total["passengers"] == K3_TOKYO23
    assert total["series"][-1] == {"year": 2024, "passengers": T3_TOKYO23_2024}
    # A station's figure is still the sum of its operators' S12 figures, and
    # 東京都's S12 figure at a station is still the sum of its S12 rows there —
    # 交通局's own figure is in neither.
    s12_at = defaultdict(int)
    for r in toei_rows:
        if r["s12"] is not None:
            s12_at[(r["name"], r["ward"])] += r["s12"]
    for st in built["stations"]:
        known = [o["passengers"] for o in st["operators"] if o["passengers"] is not None]
        assert st["dailyPassengers"] == (sum(known) if known else None), st["name"]
        own = [f for f in st.get("ownFigures", []) if f["s12"] is not None]
        if own and not any(line == "荒川線" for o in st["operators"] if o["name"] == OPERATOR for line in o["lines"]):
            toei = next(o for o in st["operators"] if o["name"] == OPERATOR)
            assert toei["passengers"] == sum(f["s12"] for f in own) == s12_at[(st["name"], st["ward"])], st["name"]


def test_the_snapshot_without_the_own_figures_is_the_one_main_serves(built):
    """Byte for byte what `git show 9010a53:backend/data/stations.json` holds in
    its wards, trend and stations — recomputed here from S12 alone."""
    for st in built["stations"]:
        st = {k: v for k, v in st.items() if k != "ownFigures"}
        assert set(st) <= {"code", "name", "ward", "wardCode", "lat", "lng", "dailyPassengers", "operators", "remarks", "countedElsewhere", "note"}
    assert built == _snapshot()


# --- the notice: facts only -------------------------------------------------------------------------


def test_the_notice_states_the_three_facts_with_counts_recomputed_from_the_files(built, published, toei_rows):
    below = {"subway": 0, "liner": 0}
    for r in toei_rows:
        if r["s12"] is not None and r["s12"] < published[(_short(r["line"]), _key(r["name"]))][1]:
            below["liner" if r["line"] == LINER else "subway"] += 1
    assert below == {"subway": 44, "liner": 2} and sum(below.values()) == BELOW_ROWS
    block = built["operatorFigures"]
    assert block["below"] == {"rows": BELOW_ROWS, "subway": 44, "liner": 2, "s12Year": 2024}
    assert block["years"] == [{"name": "都営地下鉄", "year": SUBWAY_YEAR}, {"name": LINER, "year": LINER_YEAR}]
    assert block["publisher"] == "東京都交通局" and block["provider"] == PROVIDER
    sums, shown, rows = block["notice"]
    # 1 the sums use 国土数値情報's values;
    assert "国土数値情報" in sums and all(word in sums for word in ("日間乗降客", "事業者別", "乗降客数推移", "23区の中での位置"))
    # 2 都営 rows also show 交通局's own figure, with its 年度, which counts transfers between 都営 lines on both lines;
    assert "東京都交通局の公表値" in shown and f"都営地下鉄 {SUBWAY_YEAR}年度" in shown and f"{LINER} {LINER_YEAR}年度" in shown
    assert "都営地下鉄の路線どうしの乗り換えは両方の路線で数えられています" in shown
    # 3 at 46 rows S12's 2024年度 value is below 交通局's.
    assert f"{BELOW_ROWS}行" in rows and "44行" in rows and "2行" in rows and "国土数値情報の2024年度の値" in rows
    # No cause is asserted anywhere in the notice.
    for sentence in block["notice"]:
        assert not any(word in sentence for word in ("ため", "原因", "理由", "誤", "漏", "除いた", "含まれていない")), sentence
    basis = block["transfersBasis"]
    assert "都営線相互の乗り換え客数を引いたもの" in basis["quote"] and basis["url"].startswith("https://spec.api.metro.tokyo.lg.jp/spec/t000018d0000000030-")


# --- the route -----------------------------------------------------------------------------------------


@pytest.fixture()
def client(db_session, monkeypatch):
    monkeypatch.delenv("URBANORACLE_ALLOWLIST_DOMAINS", raising=False)
    monkeypatch.delenv("URBANORACLE_FREEMAIL_DOMAINS", raising=False)
    monkeypatch.setattr(authz, "decode_auth_token", lambda tok: TOKENS.get(tok))
    cache.clear()

    def _session_override():
        yield db_session

    app.dependency_overrides[get_session] = _session_override
    yield TestClient(app)
    app.dependency_overrides.clear()
    cache.clear()


def test_route_sends_the_own_figures_on_the_stations_and_the_notice_beside_data(client, built):
    resp = client.get(ROUTE, headers=ACTIVE)
    assert resp.status_code == 200, resp.text[:300]
    body = resp.json()
    # The contract the route had: the same envelope keys, the same record fields — the figures are additions.
    assert set(body) == {"status", "data", "sources", "total"} and body["status"] == "ok"
    served = {r["id"]: r for r in body["data"]}
    assert len(served) == len(built["stations"]) == 499
    carried = 0
    for st in built["stations"]:
        r = served[f"s12-{st['code']}-{st['wardCode']}"]
        assert r.get("ownFigures") == st.get("ownFigures")
        carried += len(r.get("ownFigures", []))
        assert set(r) - {"ownFigures"} <= {"id", "code", "name", "lat", "lng", "type", "dailyPassengers", "lines", "ward", "wardCode", "operators", "remarks", "countedElsewhere", "note"}
    assert carried == 118
    sengakuji = next(r for r in body["data"] if r["name"] == "泉岳寺駅")
    assert sengakuji["dailyPassengers"] == SENGAKUJI["s12"]
    assert sengakuji["ownFigures"] == [{"operator": OPERATOR, "line": "1号線浅草線", "year": SUBWAY_YEAR, "passengers": SENGAKUJI["own"], "s12": SENGAKUJI["s12"]}]
    total = body["total"]
    assert set(total) == {"code", "name", "trend", "operatorFigures"}
    block = total["operatorFigures"]
    assert block["notice"] == built["operatorFigures"]["notice"] and block["credit"] == EDITED
    assert block["years"] == built["operatorFigures"]["years"] and block["below"]["rows"] == BELOW_ROWS
    assert body["sources"]["operatorFigures"] == built["sources"]["operatorFigures"]


def test_route_sums_are_the_ones_main_serves(client):
    body = client.get(ROUTE, headers=ACTIVE).json()
    per_ward = defaultdict(int)
    per_operator = defaultdict(int)
    for r in body["data"]:
        per_ward[r["ward"]] += r["dailyPassengers"] or 0
        for o in r["operators"]:
            per_operator[o["name"]] += o["passengers"] or 0
    assert per_ward["江戸川区"] == K3["江戸川区"] and sum(per_ward.values()) == K3_TOKYO23
    assert sum(per_operator.values()) == K3_TOKYO23
    view = body["total"]["trend"]["views"][0]
    assert view["name"] == "東京23区" and view["series"][-1] == {"year": 2024, "passengers": T3_TOKYO23_2024}


def test_route_does_not_touch_the_network(client, monkeypatch):
    import socket

    import httpx

    def explode(*args, **kwargs):
        raise AssertionError("/transport must answer from the committed snapshot, not the network")

    # The test client is itself an httpx.Client, so what is closed is every way
    # out: a new async client, the module-level call, and name resolution.
    monkeypatch.setattr(httpx.AsyncClient, "__init__", explode, raising=False)
    monkeypatch.setattr(httpx, "get", explode, raising=False)
    monkeypatch.setattr(socket, "getaddrinfo", explode)
    assert client.get(ROUTE, headers=ACTIVE).status_code == 200


# --- startup validation -------------------------------------------------------------------------------


def _import_main_with(path: Path) -> subprocess.CompletedProcess:
    env = {**os.environ, "STATIONS_PATH": str(path)}
    return subprocess.run([sys.executable, "-c", "import main"], cwd=BACKEND, env=env, capture_output=True, text=True, timeout=60)


def _station(s: dict, name: str, ward: str) -> dict:
    return next(st for st in s["stations"] if st["name"] == name and st["ward"] == ward)


@pytest.mark.parametrize(
    "mutate",
    [
        pytest.param(lambda s: s.pop("operatorFigures"), id="no operatorFigures block"),
        pytest.param(lambda s: s["sources"].pop("operatorFigures"), id="the own-figure source missing"),
        pytest.param(lambda s: s["credit"].pop("toei_edited"), id="the provider's credit missing"),
        pytest.param(lambda s: s["credit"].__setitem__("toei_edited", "東京都交通局の資料をもとに作成"), id="a credit not in the CC BY form"),
        pytest.param(lambda s: s["licence"].pop("operatorFigures"), id="the licence basis missing"),
        pytest.param(lambda s: _station(s, "泉岳寺", "港区")["ownFigures"][0].__setitem__("passengers", None), id="an own figure null"),
        pytest.param(lambda s: _station(s, "泉岳寺", "港区")["ownFigures"][0].__setitem__("passengers", 209882.5), id="an own figure not an integer"),
        pytest.param(lambda s: _station(s, "泉岳寺", "港区")["ownFigures"][0].pop("year"), id="an own figure without its 年度"),
        pytest.param(lambda s: _station(s, "泉岳寺", "港区")["ownFigures"][0].pop("s12"), id="an own figure without S12's beside it"),
        pytest.param(lambda s: _station(s, "泉岳寺", "港区")["ownFigures"][0].__setitem__("line", "山手線"), id="an own figure on a line the station does not have"),
        pytest.param(lambda s: _station(s, "泉岳寺", "港区")["ownFigures"][0].__setitem__("s12", 209882), id="S12's figure beside it more than the operator's S12 figure"),
        pytest.param(lambda s: _station(s, "泉岳寺", "港区").pop("ownFigures"), id="fewer station-lines than the block states"),
        pytest.param(lambda s: s["operatorFigures"]["below"].__setitem__("rows", 45), id="rows below not subway + liner"),
        pytest.param(lambda s: s["operatorFigures"].__setitem__("notice", s["operatorFigures"]["notice"][:2]), id="the notice not stating the rows below"),
        pytest.param(lambda s: s["operatorFigures"].pop("matching"), id="the matching report missing"),
    ],
)
def test_startup_refuses_a_malformed_snapshot(tmp_path, mutate):
    snapshot = _snapshot()
    mutate(snapshot)
    bad = tmp_path / "stations.json"
    bad.write_text(json.dumps(snapshot, ensure_ascii=False), encoding="utf-8")
    proc = _import_main_with(bad)
    assert proc.returncode != 0, "the app started on a malformed snapshot"
    assert "stations" in proc.stderr


def test_startup_accepts_the_committed_snapshot():
    proc = _import_main_with(SNAPSHOT)
    assert proc.returncode == 0, proc.stderr[-800:]


def test_a_sum_that_took_an_own_figure_in_is_refused():
    """日間乗降客 computed with 交通局's figure in place of S12's does not validate."""
    service = importlib.import_module("services.transport")
    snapshot = _snapshot()
    st = _station(snapshot, "泉岳寺", "港区")
    toei = next(o for o in st["operators"] if o["name"] == OPERATOR)
    toei["passengers"] = SENGAKUJI["own"]
    st["dailyPassengers"] = SENGAKUJI["own"]
    with pytest.raises(service.SnapshotError):
        service.validate(snapshot)
