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
```

`etl/stations.py` (real-data plan PR 4) expects the raw zips unzipped under
`etl/_downloads/ksj_S12-25/` and `etl/_downloads/ksj_N03-20260101_13/`; the
fixture README under `backend/tests/fixtures/stations/` records their URLs,
sizes and sha256. The ward of a station is decided by a standard-library
point-in-polygon over the N03 ward polygons, so `build` (and the drift test
that re-runs it in CI) needs no geospatial dependency.
