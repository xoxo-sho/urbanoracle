"""PR 4b of the real-data plan (RECON 2026-10-uo-real-data §9 row 4b): 乗降客数推移 from a fixed panel of S12 rows.

On main (069ba50) the 交通 tab's 乗降客数推移 is the last sample set, a station
whose figure S12 counts on another row reads データなし, and nothing on a
transport surface says what the operators' figures are. Architect decisions
(2026-11-09), after the verification of S12's fourteen year columns:

* T3 sums panel B2 — the units whose whole 2018 / 2020–2024 series passes the
  checks — per ward and for the 23 wards; 2019 is a gap with its reason;
  values are S12's as published, nothing adjusted or re-dated. The panel is
  committed (``ridership_panel.json`` beside the excerpts): every unit in or
  out, every excluded unit with its reason class. The operators' own figures
  the checks used stay outside the repository.
* Every transport surface carries S12's own notice, verbatim; 駅一覧 shows
  each figure row's 2024 備考.
* A station every row of which says 他路線駅に記載 (重複コード 2) reads
  「他の行に計上」 with a note naming where — the row whose 備考 names it — or,
  where S12 names none, 「他の行に計上（国土数値情報に記載先の明示なし）」.
* Before all that: no 2024 figure enters 日間乗降客 twice (the line a 備考
  names never carries a figure of its own).

Every expected figure is recomputed here from the committed excerpt and the
committed panel; the three views the Architect named are also checked
against the verification report's table. RED on main (069ba50).
"""

from __future__ import annotations

import hashlib
import importlib
import importlib.util
import json
import os
import subprocess
import sys
from collections import Counter, defaultdict
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
PANEL = FIXTURES / "ridership_panel.json"
EXCERPT = FIXTURES / "ksj_S12-25_tokyo23.geojson"
SNAPSHOT = BACKEND / "data" / "stations.json"
BUILDER = ROOT / "etl" / "stations.py"
ROUTE = "/api/v1/transport"

YEARS = [2018, 2020, 2021, 2022, 2023, 2024]
GAP = 2019
REASON_CLASSES = {"repeat_or_lag", "definition_change", "opened_or_closed", "entry_error", "unexplained"}

# The Architect's cross-checks (brief 2026-11-09, the verification report's
# panel B2 table): units in the panel / all units, and the series.
CROSS_CHECK = {
    "東京23区": {"panel": 458, "units": 583, "series": [38_851_287, 25_539_168, 26_963_792, 30_566_467, 33_178_126, 34_561_088], "share": "79.4"},
    "新宿区": {"panel": 25, "units": 37, "series": [4_610_309, 2_897_754, 3_153_901, 3_597_320, 3_870_033, 4_002_737], "share": "79.5"},
    "江戸川区": {"panel": 11, "units": 11, "series": [674_589, 507_861, 531_098, 573_416, 607_126, 627_375], "share": "100.0"},
}

# S12's own notice (the dataset page's 「その他の情報」, second bullet), and the
# part of it the Architect quoted.
NOTICE = "各事業者から提供された駅別乗降客数は、各社で独自に算出したものであり、統一的な基準に基づいたものではありませんので、その旨を認識した上でご利用ください。"
NOTICE_CORE = "各社で独自に算出したものであり、統一的な基準に基づいたものではありません"
S12_PAGE = "https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-S12-2024.html"

COUNTED = "他の行に計上"
COUNTED_UNNAMED = "他の行に計上（国土数値情報に記載先の明示なし）"
# The five stations no row of which carries a figure, as the screen words them.
LABELS = {
    ("新宿区", "飯田橋"): (COUNTED, "乗降客数は千代田区の飯田橋駅（東京メトロ東西線）に含まれます"),
    ("千代田区", "溜池山王"): (COUNTED, "乗降客数は港区の溜池山王駅（東京メトロ銀座線）に含まれます"),
    ("台東区", "日暮里"): (COUNTED, "乗降客数は荒川区の日暮里駅（JR常磐線）に含まれます"),
    ("渋谷区", "新宿"): (COUNTED, "乗降客数は新宿区の新宿駅（京王電鉄京王線、JR中央線）に含まれます"),
    ("墨田区", "とうきょうスカイツリー"): (COUNTED_UNNAMED, None),
}

ACTIVE = {"Authorization": "Bearer active-token"}
TOKENS = {"active-token": {"sub": "gipuid_trend_active_000001", "email": "analyst@customcorp.jp", "email_verified": True}}


# --- the committed files, read without the builder's own trend code -----------------


def _builder():
    spec = importlib.util.spec_from_file_location("stations_etl_trend", BUILDER)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="module")
def etl():
    return _builder()


@pytest.fixture(scope="module")
def built(etl) -> dict:
    return etl.build()


@pytest.fixture(scope="module")
def panel() -> dict:
    assert PANEL.is_file(), f"no panel at {PANEL}"
    return json.loads(PANEL.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def features() -> list[dict]:
    return json.loads(EXCERPT.read_text(encoding="utf-8"))["features"]


def col(year: int, kind: int) -> str:
    """S12's four columns per year from 2011: 重複コード, データ有無コード, 備考, 乗降客数."""
    return f"S12_{6 + 4 * (year - 2011) + kind:03d}"


def figure(props: dict, year: int) -> int | None:
    if props[col(year, 0)] != 1 or props[col(year, 1)] != 1:
        return None
    return props[col(year, 3)]


@pytest.fixture(scope="module")
def ward_of(etl, features) -> dict[int, tuple[str, str]]:
    """feature (1-based) -> (ward code, ward name), by the builder's geometry only."""
    n03 = json.loads((FIXTURES / etl.N03_EXCERPT).read_text(encoding="utf-8"))
    index = etl.WardIndex(n03["features"])
    return {i: index.ward_of(*etl.midpoint(f["geometry"]["coordinates"])) for i, f in enumerate(features, start=1)}


@pytest.fixture(scope="module")
def expected(panel, features, ward_of) -> dict[str, dict]:
    """Per view (東京23区 and each ward): units, panel units, 日間乗降客, the panel series — recomputed here."""
    out: dict[str, dict] = defaultdict(lambda: {"units": 0, "panel": 0, "series": [0] * len(YEARS)})
    for unit in panel["units"]:
        props = [features[r["feature"] - 1]["properties"] for r in unit["rows"]]
        sums = [sum(v for v in (figure(p, y) for p in props) if v is not None) for y in YEARS]
        for name in ("東京23区", unit["ward"]):
            out[name]["units"] += 1
            if unit["in"]:
                out[name]["panel"] += 1
                out[name]["series"] = [a + b for a, b in zip(out[name]["series"], sums)]
    k3: dict[str, int] = defaultdict(int)
    for i, f in enumerate(features, start=1):
        v = figure(f["properties"], 2024)
        if v is not None:
            k3["東京23区"] += v
            k3[ward_of[i][1]] += v
    for name, view in out.items():
        view["passengers"] = k3[name]
    return dict(out)


# --- first: nothing enters 日間乗降客 twice -------------------------------------------


def test_no_line_a_remark_names_carries_a_figure_of_its_own(etl, features):
    """For every 2024 row whose 備考 says another line is included, that line's
    own row at the station carries no 2024 figure (重複コード 2, value 0)."""
    operators = {f["properties"]["S12_002"] for f in features}
    named = 0
    for f in features:
        p = f["properties"]
        remark = p[col(2024, 2)]
        if not remark:
            continue
        assert remark.endswith("を含む"), remark
        for operator, line in etl.named_lines(remark, p["S12_002"], operators):
            for g in features:
                q = g["properties"]
                if g is f or q["S12_002"] != operator or q["S12_003"] != line or q["S12_001g"] != p["S12_001g"]:
                    continue
                named += 1
                assert figure(q, 2024) is None and q[col(2024, 3)] == 0, (p["S12_001"], operator, line, q[col(2024, 0)], q[col(2024, 3)])
    assert named >= 90, named  # 98 on S12-25: the check is not vacuous


# --- the committed panel --------------------------------------------------------------


def test_panel_names_its_decision_its_years_and_the_excerpt_it_was_written_against(panel):
    assert panel["id"] == "B2" and panel["decided"] == "2026-11-09"
    assert panel["years"] == YEARS and panel["gapYears"] == [GAP]
    assert panel["excerpt"]["file"] == EXCERPT.name
    assert panel["excerpt"]["sha256"] == hashlib.sha256(EXCERPT.read_bytes()).hexdigest()
    assert set(panel["reasonClasses"]) == REASON_CLASSES


def test_panel_rows_are_the_excerpts_rows_each_2024_figure_row_in_exactly_one_unit(panel, features, ward_of):
    seen: Counter[int] = Counter()
    for unit in panel["units"]:
        assert unit["rows"], unit
        for ref in unit["rows"]:
            p = features[ref["feature"] - 1]["properties"]
            assert (p["S12_001c"], p["S12_002"], p["S12_003"], p["S12_001"]) == (ref["code"], ref["operator"], ref["line"], ref["station"]), ref
            assert ward_of[ref["feature"]] == (unit["wardCode"], unit["ward"]), ref
            seen[ref["feature"]] += 1
    assert max(seen.values()) == 1
    with_figure = {i for i, f in enumerate(features, start=1) if figure(f["properties"], 2024) is not None}
    assert with_figure <= set(seen), sorted(with_figure - set(seen))[:5]


def test_every_unit_is_in_or_out_and_every_excluded_unit_states_a_reason_class(panel, features):
    for unit in panel["units"]:
        props = [features[r["feature"] - 1]["properties"] for r in unit["rows"]]
        sums = {y: sum(v for v in (figure(p, y) for p in props) if v is not None) for y in YEARS}
        assert sums[2024] > 0, unit["rows"]
        if unit["in"] is True:
            assert "reasons" not in unit
            assert all(sums[y] > 0 for y in YEARS), (unit["rows"], sums)
        else:
            assert unit["in"] is False
            assert unit["reasons"], unit["rows"]
            for reason in unit["reasons"]:
                assert reason["class"] in REASON_CLASSES and reason["years"], unit["rows"]
                assert set(reason["years"]) <= set(range(YEARS[0], YEARS[-1] + 1)), reason


def test_panel_counts_match_the_cross_checks(expected):
    for name, check in CROSS_CHECK.items():
        assert (expected[name]["panel"], expected[name]["units"]) == (check["panel"], check["units"]), name
    assert len(expected) == 24  # 東京23区 and the 23 wards


def test_panel_carries_no_operator_figure(panel):
    """The panel says in or out and why, by class — it holds no number but years and S12 row positions."""
    def numbers(node, path=""):
        if isinstance(node, bool):
            return
        if isinstance(node, (int, float)):
            yield path, node
        elif isinstance(node, dict):
            for k, v in node.items():
                yield from numbers(v, f"{path}.{k}")
        elif isinstance(node, list):
            for v in node:
                yield from numbers(v, f"{path}[]")
    allowed = {".years[]", ".gapYears[]", ".units[].rows[].feature", ".units[].reasons[].years[]"}
    assert {path for path, _ in numbers(panel)} <= allowed


# --- the builder's trend equals the recomputation -------------------------------------


def test_trend_equals_the_panel_summed_over_the_excerpt_for_all_24_views(built, expected):
    trend = built["trend"]
    assert trend["years"] == YEARS
    assert trend["panel"]["id"] == "B2"
    assert (trend["panel"]["unitsIn"], trend["panel"]["units"]) == (expected["東京23区"]["panel"], expected["東京23区"]["units"])
    views = {v["name"]: v for v in trend["views"]}
    assert set(views) == set(expected)
    assert trend["views"][0]["name"] == "東京23区" and trend["views"][0]["code"] == "13100"
    assert [v["code"] for v in trend["views"][1:]] == [f"131{n:02d}" for n in range(1, 24)]
    for name, e in expected.items():
        v = views[name]
        assert (v["units"], v["panelUnits"]) == (e["units"], e["panel"]), name
        assert [p["year"] for p in v["series"]] == YEARS, name
        assert [p["passengers"] for p in v["series"]] == e["series"], name
        assert v["passengers"] == e["passengers"], name
        assert v["panelPassengers"] == e["series"][-1], name


def test_trend_matches_the_reports_panel_table(built):
    views = {v["name"]: v for v in built["trend"]["views"]}
    for name, check in CROSS_CHECK.items():
        v = views[name]
        assert [p["passengers"] for p in v["series"]] == check["series"], name
        assert f"{100 * v['panelPassengers'] / v['passengers']:.1f}" == check["share"], name


def test_the_23_ward_series_is_the_sum_of_the_ward_series(built):
    total, *wards = built["trend"]["views"]
    for i, point in enumerate(total["series"]):
        assert point["passengers"] == sum(w["series"][i]["passengers"] for w in wards)
    assert total["units"] == sum(w["units"] for w in wards) and total["panelUnits"] == sum(w["panelUnits"] for w in wards)
    assert total["passengers"] == sum(w["passengers"] for w in built["wards"])


def test_2019_is_a_gap_whose_reason_is_in_s12_itself(built, panel, features):
    """Every 東日本旅客鉄道 row of the panel has 乗降客数2019 equal to 乗降客数2018."""
    assert GAP not in built["trend"]["years"]
    (gap,) = built["trend"]["gaps"]
    assert gap["year"] == GAP
    same = both = 0
    for unit in panel["units"]:
        if not unit["in"]:
            continue
        for ref in unit["rows"]:
            p = features[ref["feature"] - 1]["properties"]
            if p["S12_002"] != "東日本旅客鉄道":
                continue
            a, b = figure(p, GAP - 1), figure(p, GAP)
            if a and b is not None:
                both += 1
                same += a == b
    assert both > 0 and same == both
    assert gap["repeating"] == [{"operator": "東日本旅客鉄道", "rows": both}]
    assert gap["text"] == f"2019年度は表示しません：国土数値情報の2019年度の値が、パネルの東日本旅客鉄道{both}行すべてで前年度（2018年度）と同じ値のため"


def test_builder_names_the_trend_source_and_the_panel_among_its_inputs(built):
    source = built["sources"]["trend"]
    assert source["year"] == 2024 and source["table"] == "S12-25"
    for y in YEARS:
        assert f"乗降客数{y}" in source["label"]
    assert f"乗降客数{GAP}" not in source["label"]
    record = built["inputs"]["ridership_panel.json"]
    assert record["sha256"] == hashlib.sha256(PANEL.read_bytes()).hexdigest()
    assert record["path"] == "backend/tests/fixtures/stations/ridership_panel.json"


def test_builder_refuses_a_panel_that_no_longer_fits_the_excerpt(etl, tmp_path):
    def build_with(mutate) -> None:
        # Every committed input of the builder — whatever it reads beside the
        # excerpts and the panel (follow-up 3 added the 東京都交通局 figures' files).
        for source in FIXTURES.iterdir():
            if source.is_file():
                (tmp_path / source.name).write_bytes(source.read_bytes())
        doc = json.loads(PANEL.read_text(encoding="utf-8"))
        mutate(doc)
        (tmp_path / PANEL.name).write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
        etl.build(tmp_path)

    build_with(lambda d: None)  # the committed panel builds from a copy
    with pytest.raises(ValueError):
        build_with(lambda d: d["excerpt"].__setitem__("sha256", "0" * 64))
    with pytest.raises(ValueError):
        build_with(lambda d: d["units"].pop())  # a 2024 figure row in no unit
    with pytest.raises(ValueError):
        build_with(lambda d: next(u for u in d["units"] if not u["in"]).pop("reasons"))
    with pytest.raises(ValueError):
        build_with(lambda d: d["units"][0]["rows"][0].__setitem__("station", "別の駅"))


    def admit_a_station_that_opened_inside_the_window(d: dict) -> None:
        unit = next(u for u in d["units"] if not u["in"] and u["reasons"][0]["class"] == "opened_or_closed")
        unit["in"] = True
        del unit["reasons"]

    with pytest.raises(ValueError):
        build_with(admit_a_station_that_opened_inside_the_window)


# --- S12's notice, the rows' 備考, the stations counted on another row ----------------


def test_builder_carries_s12s_own_notice_verbatim_with_where_it_is(built):
    assert built["notes"]["source_notice"] == NOTICE
    assert NOTICE_CORE in built["notes"]["source_notice"]
    assert S12_PAGE in built["notes"]["source_notice_at"]
    assert "その他の情報" in built["notes"]["source_notice_at"]


def test_every_figure_rows_2024_remark_is_on_its_station_as_s12_writes_it(built, features, ward_of):
    want: Counter[tuple[str, str, str, str, str]] = Counter()
    for i, f in enumerate(features, start=1):
        p = f["properties"]
        if figure(p, 2024) is not None and p[col(2024, 2)]:
            want[(ward_of[i][1], p["S12_001"], p["S12_002"], p["S12_003"], p[col(2024, 2)])] += 1
    got: Counter[tuple[str, str, str, str, str]] = Counter()
    for s in built["stations"]:
        for r in s.get("remarks", []):
            got[(s["ward"], s["name"], r["operator"], r["line"], r["text"])] += 1
    assert got == want
    assert sum(want.values()) >= 60  # 69 on S12-25
    assert ("新宿区", "新宿", "京王電鉄", "京王線", "京王新線、東京都・10号線新宿線・12号線大江戸線を含む") in got


def test_the_five_stations_counted_on_another_row_say_where_or_that_s12_names_none(built):
    by_key = {(s["ward"], s["name"]): s for s in built["stations"] if s["dailyPassengers"] is None}
    assert set(by_key) == set(LABELS)
    for key, (label, note) in LABELS.items():
        s = by_key[key]
        assert s["countedElsewhere"]["label"] == label, key
        assert s.get("note") == note, key
        if note is None:
            assert s["countedElsewhere"]["targets"] == [] and "note" not in s
        else:
            assert s["countedElsewhere"]["targets"], key
            for target in s["countedElsewhere"]["targets"]:
                assert target["ward"] in note and target["station"] in note
                assert target["remark"].endswith("を含む")
    assert all("他路線駅の行に記載" not in s.get("note", "") for s in built["stations"])
    assert all("countedElsewhere" not in s for s in built["stations"] if s["dailyPassengers"] is not None)


def test_each_named_target_is_the_figure_row_whose_remark_names_the_station_s_line(built, features, ward_of, etl):
    operators = {f["properties"]["S12_002"] for f in features}
    stations = {(s["ward"], s["name"]): s for s in built["stations"]}
    for (ward, name), (_, note) in LABELS.items():
        if note is None:
            continue
        own = [(f["properties"]["S12_002"], f["properties"]["S12_003"]) for i, f in enumerate(features, start=1) if f["properties"]["S12_001"] == name and ward_of[i][1] == ward]
        for target in stations[(ward, name)]["countedElsewhere"]["targets"]:
            named = etl.named_lines(target["remark"], target["operator"], operators)
            assert any(pair in named for pair in own), (ward, name, target)
            holder = stations[(target["ward"], target["station"])]
            assert holder["dailyPassengers"], target


# --- the snapshot, the route, the startup check ---------------------------------------


def _snapshot() -> dict:
    return json.loads(SNAPSHOT.read_text(encoding="utf-8"))


def test_snapshot_is_a_fresh_build_and_carries_the_trend(built):
    snapshot = _snapshot()
    assert "trend" in snapshot, "backend/data/stations.json has no trend — etl/stations.py build has not been run"
    assert snapshot == built


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


def test_route_sends_the_trend_beside_data_as_total(client, built):
    body = client.get(ROUTE, headers=ACTIVE).json()
    assert body["status"] == "ok" and "isLive" not in body
    total = body["total"]
    assert total["code"] == "13100" and total["name"] == "東京23区"
    trend = total["trend"]
    assert trend["years"] == YEARS
    assert trend["gaps"] == [{"year": g["year"], "text": g["text"]} for g in built["trend"]["gaps"]]
    assert trend["views"] == built["trend"]["views"]
    assert trend["panel"] == "B2"
    assert body["sources"]["trend"] == built["sources"]["trend"]
    # PR 4's three fields are untouched.
    for key in ("ridership", "stations", "wards"):
        assert body["sources"][key] == built["sources"][key]


def test_route_matches_the_reports_panel_table(client):
    views = {v["name"]: v for v in client.get(ROUTE, headers=ACTIVE).json()["total"]["trend"]["views"]}
    for name, check in CROSS_CHECK.items():
        assert [p["passengers"] for p in views[name]["series"]] == check["series"], name
        assert (views[name]["panelUnits"], views[name]["units"]) == (check["panel"], check["units"]), name


def test_route_rows_carry_the_remarks_and_the_counted_elsewhere_record(client, built):
    rows = client.get(ROUTE, headers=ACTIVE).json()["data"]
    by_id = {r["id"]: r for r in rows}
    for s in built["stations"]:
        r = by_id[f"s12-{s['code']}-{s['wardCode']}"]
        assert r.get("remarks") == s.get("remarks"), s["name"]
        assert r.get("note") == s.get("note"), s["name"]
        if "countedElsewhere" in s:
            assert r["countedElsewhere"]["label"] == s["countedElsewhere"]["label"]
            assert r["dailyPassengers"] is None
        else:
            assert "countedElsewhere" not in r
    assert sum(1 for r in rows if "countedElsewhere" in r) == len(LABELS)


def _import_main_with(path: Path) -> subprocess.CompletedProcess:
    env = {**os.environ, "STATIONS_PATH": str(path)}
    return subprocess.run([sys.executable, "-c", "import main"], cwd=BACKEND, env=env, capture_output=True, text=True, timeout=60)


@pytest.mark.parametrize(
    "mutate",
    [
        pytest.param(lambda s: s.pop("trend"), id="no trend"),
        pytest.param(lambda s: s["trend"]["views"].pop(), id="a ward without a trend view"),
        pytest.param(lambda s: s["trend"]["views"][0]["series"][0].__setitem__("passengers", 1), id="23区 series not the sum of the wards"),
        pytest.param(lambda s: s["trend"]["views"][1].__setitem__("panelUnits", s["trend"]["views"][1]["units"] + 1), id="more panel units than units"),
        pytest.param(lambda s: s["trend"]["views"][1].__setitem__("passengers", 1), id="a view's 日間乗降客 not the ward's"),
        pytest.param(lambda s: s["trend"]["views"][1]["series"].pop(), id="a series without its last year"),
        pytest.param(lambda s: s["trend"].__setitem__("gaps", []), id="no gap reason"),
        pytest.param(lambda s: s["notes"].pop("source_notice"), id="S12's notice missing"),
        pytest.param(lambda s: s["sources"].pop("trend"), id="the trend source missing"),
        pytest.param(lambda s: next(st for st in s["stations"] if st["dailyPassengers"] is None).pop("countedElsewhere"), id="a station without a figure and without its record"),
        pytest.param(lambda s: next(st for st in s["stations"] if st.get("remarks"))["remarks"][0].__setitem__("text", ""), id="an empty 備考"),
    ],
)
def test_startup_refuses_a_snapshot_whose_trend_or_labels_are_broken(tmp_path, mutate):
    snapshot = _snapshot()
    mutate(snapshot)
    bad = tmp_path / "stations.json"
    bad.write_text(json.dumps(snapshot, ensure_ascii=False), encoding="utf-8")
    proc = _import_main_with(bad)
    assert proc.returncode != 0, "the app started on a snapshot with a broken trend"
    assert "stations" in proc.stderr


def test_validator_accepts_the_committed_snapshot():
    transport = importlib.import_module("services.transport")
    transport.validate(_snapshot())
    assert set(transport.REQUIRED_KEYS) >= {"trend"}
