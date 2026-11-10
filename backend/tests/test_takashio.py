"""Follow-up 3, decision B (Architect, 2026-11-09): 高潮 from 東京都's 2024-12 revision.

On main (9010a53) the 高潮 figures come from 国土数値情報 A49-20 — 東京都's file
as it stood in 2021-03 (the metadata's date). 東京都港湾局・建設局 revised the
「高潮浸水想定区域図」 on 2024-12-19 and publish the revision on the 東京都
オープンデータカタログ (record t000015d1700000007) as ``shape(depth).zip``: 90
shapefiles of 10 m cells on 平面直角座標系 第IX系 (EPSG:6677), each with its
浸水深 ``DepthM`` in metres. The decision:

- that file replaces A49-20 (its URL and sha256 pinned);
- the depth classes are exactly A49-20's seven, cut at the same boundaries —
  0.3m未満 / 0.3m以上0.5m未満 / 0.5m以上1m未満 / 1m以上3m未満 / 3m以上5m未満 /
  5m以上10m未満 / 10m以上20m未満 — applied to DepthM, and the snapshot says so;
- the per-ward share is by the existing method: area inside the N03 ward
  polygon ÷ the polygon's area;
- the licence basis rides in the source block: CC BY 4.0 on the catalogue
  record (read via a mirror — the catalogue is geo-blocked from the build
  machine) and 東京都オープンデータ利用規約 (read directly), which prevails over
  港湾局's site policy; the credit is the 都's CC BY modified-use form;
- the 時点 shown is 「令和6年12月改定」;
- the committed excerpts stay small: the per-ward class areas and the cells of
  one guard ward, from which the guard re-derives that ward's rows here with
  the standard library.

Nothing below is typed by hand except the pinned file, the seven class
boundaries the decision quotes and the Architect's cross-check figures. RED
on main (9010a53).
"""

from __future__ import annotations

import csv
import hashlib
import importlib.util
import json
from decimal import Decimal
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import core.authz as authz
from core import cache
from core.database import get_session
from main import app

BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND.parent
FIXTURES = BACKEND / "tests" / "fixtures" / "disaster"
N03 = BACKEND / "tests" / "fixtures" / "stations" / "ksj_N03-20260101_tokyo23.geojson"
SNAPSHOT = BACKEND / "data" / "disaster_risks.json"
BUILDER = ROOT / "etl" / "disaster.py"
ROUTE = "/api/v1/disaster-risks"
CLASS_CSV = FIXTURES / "tokyo_takashio_r6_tokyo23.csv"
GUARD_CSV = FIXTURES / "tokyo_takashio_r6_guard.csv"

# The pinned file (Architect decision B).
ZIP_URL = "https://data.storage.data.metro.tokyo.lg.jp/kouwan/shape(depth).zip"
ZIP_SHA256 = "1ea3b9788eec769711b4574635058cf66debf4ace128e090088ae0757c5fae9c"
ZIP_BYTES = 44_703_942
CATALOG_RECORD = "t000015d1700000007"
REVISION = "令和6年12月改定"
TERMS = "https://portal.data.metro.tokyo.lg.jp/terms/"

# A49-20's seven classes, as that file labelled them, and the boundaries the
# labels state (the decision quotes them): [from, below) in centimetres.
CLASSES = [
    (1, "0.3m未満", 0, 30),
    (2, "0.3m以上0.5m未満", 30, 50),
    (3, "0.5m以上1m未満", 50, 100),
    (4, "1m以上3m未満", 100, 300),
    (5, "3m以上5m未満", 300, 500),
    (6, "5m以上10m未満", 500, 1000),
    (7, "10m以上20m未満", 1000, 2000),
]

# The Architect's cross-check figures (brief 2026-11-09): any / ≥ 1 m / ≥ 3 m, % of the ward.
CROSS_CHECK = {"中央区": (38.2, 8.1, 1.1), "台東区": (56.3, 17.8, 0.0), "江戸川区": (76.5, 75.5, 40.3), "東京23区": (29.7, 21.9, 9.1)}

CC_BY = "クリエイティブ・コモンズ・ライセンス 表示4.0国際（https://creativecommons.org/licenses/by/4.0/deed.ja）"
TITLE = "高潮浸水想定区域図［想定最大規模］（浸水深）"
CREDIT = f"{TITLE}、東京都、{CC_BY}"
EDITED = f"このサービスは、以下の著作物を改変して利用しています。{CREDIT}"

ACTIVE = {"Authorization": "Bearer active-token"}
TOKENS = {"active-token": {"sub": "gipuid_takashio_active_0001", "email": "analyst@customcorp.jp", "email_verified": True}}


def _builder():
    spec = importlib.util.spec_from_file_location("disaster_etl_takashio", BUILDER)
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
def meta() -> dict:
    return json.loads((FIXTURES / "ksj.meta.json").read_text(encoding="utf-8"))


def _class_rows() -> list[dict]:
    return list(csv.DictReader(CLASS_CSV.read_text(encoding="utf-8").splitlines()))


def _three(block: dict) -> tuple[float, float, float]:
    """any / ≥ 1 m / ≥ 3 m, % of the ward, to one decimal — classes 1–7, 4–7 and 5–7."""
    m2 = {c["code"]: c["m2"] for c in block["classes"]}
    return tuple(round(sum(v for c, v in m2.items() if c >= low) / block["wardM2"] * 100, 1) for low in (1, 4, 5))


# --- the pinned file and what was cut from it ------------------------------------------


def test_the_source_is_the_pinned_file_of_the_2024_12_revision(meta):
    t = meta["takashio"]
    assert (t["url"], t["sha256"], t["bytes"]) == (ZIP_URL, ZIP_SHA256, ZIP_BYTES)
    assert t["revision"] == REVISION and t["revised"] == "2024-12-19" and t["publisher"] == "東京都港湾局・建設局"
    assert t["catalog_record"] == CATALOG_RECORD and CATALOG_RECORD in t["catalog"]
    assert "EPSG:6677" in t["crs"] and t["cell_m"] == 10
    assert t["members"] == 90 and t["cells"] == sum(int(n) for n in t["cells_per_class"].values())
    assert "A49" not in meta, "the A49-20 block is still in the meta"


def test_the_classes_are_exactly_a49_20s_seven_boundaries(etl, built, meta):
    assert etl.HIGHTIDE_CLASSES == [(code, label) for code, label, _, _ in CLASSES]
    assert etl.HIGHTIDE_BOUNDS_CM == [(code, lo, hi) for code, _, lo, hi in CLASSES]
    assert meta["takashio"]["class_bounds_cm"] == [[code, lo, hi] for code, _, lo, hi in CLASSES]
    assert [(c["code"], c["label"]) for c in built["hazards"]["hightide"]["classes"]] == [(code, label) for code, label, _, _ in CLASSES]
    # A depth on a boundary belongs to the class that begins there (「…以上」).
    for code, _, lo, hi in CLASSES:
        assert etl.depth_class(lo if lo else 1) == code and etl.depth_class(hi - 1) == code
    assert etl.depth_class(meta["takashio"]["depth_cm_max"]) == 7
    with pytest.raises(ValueError):
        etl.depth_class(2000)
    # The snapshot says the classes follow the same boundaries as before.
    note = built["notes"]["hightide_classes"]
    assert "これまでと同じ7区分の境界" in note and "0.3m・0.5m・1m・3m・5m・10m・20m" in note


def test_committed_excerpts_are_the_class_areas_and_one_small_guard(meta):
    rows = _class_rows()
    assert len(rows) == 23 * 7 and {r["label"] for r in rows} == {label for _, label, _, _ in CLASSES}
    assert CLASS_CSV.stat().st_size + GUARD_CSV.stat().st_size < 50_000
    assert not list(FIXTURES.glob("ksj_A49-20*")), "the A49-20 excerpts are still committed"
    guard = meta["takashio"]["guard_ward"]
    assert sum(int(r["cells"]) for r in rows if r["code"] == guard) == meta["takashio"]["guard_cells"]
    assert sum(1 for r in rows if r["code"] == guard and float(r["m2"]) > 0) >= 2


# --- the shares -------------------------------------------------------------------------


def test_shares_are_the_class_areas_inside_the_n03_polygon_over_its_area(built, etl):
    areas = etl.ward_areas()
    m2 = {(r["code"], int(r["class"])): float(r["m2"]) for r in _class_rows()}
    for w in built["wards"]:
        block = w["hightide"]
        assert abs(block["wardM2"] - round(areas[w["code"]], 3)) < 1e-6
        for c in block["classes"]:
            assert c["m2"] == round(m2[(w["code"], c["code"])], 3)
            assert c["share"] == round(m2[(w["code"], c["code"])] / areas[w["code"]] * 100, 4)
        inside = sum(m2[(w["code"], code)] for code, _, _, _ in CLASSES)
        assert inside <= areas[w["code"]] * (1 + 1e-9), w["name"]
        assert block["share"] == round(inside / areas[w["code"]] * 100, 4)


def test_the_architects_cross_check_figures(built):
    by_name = {w["name"]: w for w in built["wards"]}
    for name, want in CROSS_CHECK.items():
        record = built["total"] if name == "東京23区" else by_name[name]
        assert _three(record["hightide"]) == want, name
    # The six wards the map does not reach have no area in any class.
    for name in ("世田谷区", "渋谷区", "中野区", "杉並区", "豊島区", "練馬区"):
        assert by_name[name]["hightide"]["m2"] == 0


def test_the_guard_wards_rows_are_re_derived_from_its_cells_with_the_standard_library(etl, meta):
    """Independent of the extract: project the guard ward's N03 rings with the
    builder's 第IX系 formula, clip them to each committed 10 m cell
    (Sutherland–Hodgman, written here), and sum per class."""
    guard = meta["takashio"]["guard_ward"]
    polygons = []
    for f in json.loads(N03.read_text(encoding="utf-8"))["features"]:
        if f["properties"]["N03_007"] == guard:
            g = f["geometry"]
            for rings in [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]:
                polygons.append([[etl.Z.tm_project(lon, lat) for lon, lat in ring] for ring in rings])
    assert polygons

    def clip(ring, x0, y0, x1, y1):
        out = ring[:-1] if ring[0] == ring[-1] else list(ring)
        for axis, bound, above in ((0, x0, True), (0, x1, False), (1, y0, True), (1, y1, False)):
            src, out = out, []
            for i, cur in enumerate(src):
                prev = src[i - 1]
                p_in = prev[axis] >= bound if above else prev[axis] <= bound
                c_in = cur[axis] >= bound if above else cur[axis] <= bound
                if p_in != c_in:
                    t = (bound - prev[axis]) / (cur[axis] - prev[axis])
                    out.append((bound, prev[1] + t * (cur[1] - prev[1])) if axis == 0 else (prev[0] + t * (cur[0] - prev[0]), bound))
                if c_in:
                    out.append(cur)
        return out

    def shoelace(ring):
        return abs(sum(ring[i][0] * ring[(i + 1) % len(ring)][1] - ring[(i + 1) % len(ring)][0] * ring[i][1] for i in range(len(ring)))) / 2

    m2 = {code: 0.0 for code, _, _, _ in CLASSES}
    cells = {code: 0 for code, _, _, _ in CLASSES}
    guard_rows = list(csv.DictReader(GUARD_CSV.read_text(encoding="utf-8").splitlines()))
    assert len(guard_rows) == meta["takashio"]["guard_cells"]
    for r in guard_rows:
        x, y, cm = float(r["x"]), float(r["y"]), int(Decimal(r["depth_m"]) * 100)
        code = next(code for code, _, lo, hi in CLASSES if lo <= cm < hi)
        area = 0.0
        for rings in polygons:
            outer = clip(rings[0], x - 5, y - 5, x + 5, y + 5)
            if len(outer) >= 3:
                area += shoelace(outer) - sum(shoelace(h) for h in (clip(hole, x - 5, y - 5, x + 5, y + 5) for hole in rings[1:]) if len(h) >= 3)
        assert 0 < area <= 100 + 1e-6, r
        m2[code] += area
        cells[code] += 1
    rows = {int(r["class"]): r for r in _class_rows() if r["code"] == guard}
    for code, _, _, _ in CLASSES:
        assert abs(m2[code] - float(rows[code]["m2"])) < 0.002, (code, m2[code], rows[code]["m2"])
        assert cells[code] == int(rows[code]["cells"])
    # The builder's own verify agrees.
    assert etl.verify() == []


# --- the source block, the 時点, the licence basis and the credit ------------------------------


def test_the_source_block_names_the_map_its_revision_and_the_pinned_file(built):
    source = built["sources"]["hightide"]
    assert source["year"] == 2024 and source["table"] == REVISION
    assert "東京都港湾局・建設局" in source["label"] and "高潮浸水想定区域図" in source["label"] and "想定最大規模" in source["label"]
    assert built["notes"]["hightide_as_of"] == f"時点：{REVISION}"
    assert built["hazards"]["hightide"]["asOf"] == {"text": REVISION, "date": "2024-12-19"}
    cut = built["inputs"]["tokyo_takashio_r6_tokyo23.csv"]
    assert cut["sha256"] == hashlib.sha256(CLASS_CSV.read_bytes()).hexdigest()
    assert (cut["cut_from"]["url"], cut["cut_from"]["sha256"], cut["cut_from"]["bytes"]) == (ZIP_URL, ZIP_SHA256, ZIP_BYTES)
    assert cut["cut_from"]["revision"] == REVISION and cut["cut_from"]["catalog_record"] == CATALOG_RECORD


def test_the_licence_basis_says_what_was_read_directly_and_what_through_the_mirror(built):
    licence = built["licence"]["hightide"]
    assert licence["url"] == TERMS and "CC BY 4.0" in licence["name"]
    basis = licence["basis"]
    assert CATALOG_RECORD in basis and "CC-BY-4.0" in basis
    # The catalogue page was not read directly — the basis must say so, not claim it.
    assert "ミラー" in basis and "search.ckan.jp" in basis and "HTTP 403" in basis and "直接読んだものではない" in basis
    # 東京都オープンデータ利用規約 was, and it prevails over 港湾局's site policy.
    assert TERMS in basis and "直接読了" in basis and "本利用規約が優先するものとします" in basis
    assert "無断で複製・転用することはできません" in basis and "kouwan.metro.tokyo.lg.jp/policy" in basis


def test_the_credit_is_the_tokyo_cc_by_modified_use_form(built):
    credit = built["credit"]
    assert credit["takashio"] == CREDIT and credit["takashio_edited"] == EDITED
    assert "edited_a49" not in credit and "A49" not in json.dumps(credit, ensure_ascii=False)


def test_snapshot_is_a_fresh_build_and_names_a49_only_as_where_the_classes_came_from(built):
    snapshot = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    assert built == snapshot
    # What the route serves — records, 23区 total, sources — does not name A49 at all.
    served = json.dumps({"wards": snapshot["wards"], "total": snapshot["total"], "sources": snapshot["sources"]}, ensure_ascii=False)
    assert "A49" not in served
    assert snapshot["hazards"]["hightide"]["classesFrom"].startswith("国土数値情報 高潮浸水想定区域データ A49-20")


def test_k2_and_the_hero_do_not_move(built):
    """K2 (地域危険度) and the LP hero (地域危険度 and 洪水) read nothing of 高潮."""
    hero = json.loads((ROOT / "src" / "data" / "hero-spread.json").read_text(encoding="utf-8"))
    assert _builder().hero(json.loads((BACKEND / "data" / "land_prices.json").read_text(encoding="utf-8")), built) == hero
    assert built["total"]["earthquake"]["rank5"] == 85 and built["total"]["earthquake"]["n"] == 3138
    assert "高潮" not in json.dumps(hero, ensure_ascii=False)


# --- the route ---------------------------------------------------------------------------


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


def test_route_serves_the_new_shares_with_the_revision_as_the_source_and_no_a49(client, built):
    resp = client.get(ROUTE, headers=ACTIVE)
    assert resp.status_code == 200, resp.text[:300]
    body = resp.json()
    # The contract is the one the route had: the same envelope, the same record shape.
    assert set(body) == {"status", "data", "sources", "total"} and body["status"] == "ok"
    assert "A49" not in resp.text
    assert body["sources"]["hightide"] == built["sources"]["hightide"]
    by_name = {r["region"]: r for r in body["data"]}
    assert len(by_name) == 23
    for name, want in CROSS_CHECK.items():
        record = body["total"] if name == "東京23区" else by_name[name]
        assert set(record["hightide"]) == {"wardM2", "m2", "share", "classes"}
        assert [set(c) for c in record["hightide"]["classes"]] == [{"code", "label", "m2", "share"}] * 7
        assert _three(record["hightide"]) == want, name
