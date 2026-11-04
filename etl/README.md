# etl/ — builders for the committed data snapshots

Precedent set by real-data plan PR 3 (RECON 2026-10-uo-real-data §6, §9 row 3):

- the builder script is committed here; raw downloads go to `etl/_downloads/`,
  which is git-ignored, and `etl/` is excluded from the container image
  (`.dockerignore`);
- the derived snapshot and its source block (URL, stat_infid / statsDataId,
  公開日, sha256 of each raw file, licence and credit wording) are committed
  under `backend/data/` and served by a gated route;
- the committed source files the test suite builds its expected values from
  live under `backend/tests/fixtures/`, and a drift test asserts the snapshot
  equals a fresh build from them.

Run from the repo root with `-I`, so nothing in the download directory can be
imported by accident:

```
python -I etl/population_trends.py extract   # raw xlsx → committed excerpt (needs etl/requirements.txt)
python -I etl/population_trends.py build     # committed sources → backend/data/population_trends.json
python -I etl/stations.py extract            # raw 国土数値情報 zips (S12-25, N03-20260101 東京都) → committed excerpts (stdlib only)
python -I etl/stations.py build              # committed excerpts → backend/data/stations.json
python -I etl/land_prices.py extract         # raw 国土数値情報 zip (L01-26 東京都) → committed CSV excerpt (stdlib only)
python -I etl/land_prices.py build           # committed excerpt → backend/data/land_prices.json
python -I etl/zoning.py extract              # raw 国土数値情報 A55-24 zip + datalist xlsx → committed excerpts (pyshp, shapely, openpyxl)
python -I etl/zoning.py build                # committed excerpts → backend/data/zoning.json (stdlib only)
python -I etl/zoning.py verify               # the two-ward GeoJSON re-derives the CSV (stdlib only)
```

`etl/stations.py` (real-data plan PR 4) expects the raw zips unzipped under
`etl/_downloads/ksj_S12-25/` and `etl/_downloads/ksj_N03-20260101_13/`; the
fixture README under `backend/tests/fixtures/stations/` records their URLs,
sizes and sha256. The ward of a station is decided by a standard-library
point-in-polygon over the N03 ward polygons, so `build` (and the drift test
that re-runs it in CI) needs no geospatial dependency.

`etl/land_prices.py` (real-data plan PR 5) expects the raw zip unzipped under
`etl/_downloads/ksj_L01-26_13/`; the fixture README under
`backend/tests/fixtures/land_prices/` records its URL, size and sha256. Per ward
and use the snapshot carries the simple mean price over every point and the
simple mean 対前年変動率 over the 継続 points, with their counts.

`etl/zoning.py` (real-data plan PR 6) expects `A55-24_13000_SHP.zip` and
`A55_R6_datalist.xlsx` under `etl/_downloads/ksj_A55-24_13/`; the fixture README
under `backend/tests/fixtures/zoning/` records their URLs, sizes and sha256.
`extract` reads the 23 ward youto layers with pyshp, clips each polygon to its
N03 ward polygon (PR 4's committed excerpt) with shapely and writes one CSV row
per polygon with its area and clipped area on 平面直角座標系第IX系 — projected by
the script's own standard-library formula, checked against pyproj — plus the
千代田区 / 江戸川区 geometry as GeoJSON and the per-ward 時点 table from the
xlsx. `build` and the drift test need only the standard library.
