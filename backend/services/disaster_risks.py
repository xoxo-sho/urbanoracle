"""Ward-level disaster risk summary.

This endpoint has no upstream: it returns the curated sample dataset. The
Next route advertised ``isLive: true`` for exactly the same static payload,
which told the client the data was live when it never was. It reports
``isLive: false`` here — the flag now means what it says.

The actual hazard overlays are GSI raster tiles that MapLibre loads directly
in the browser (flood / tsunami / landslide); they never pass through this
API.
"""

from services import sample_data


def load_disaster_risks() -> list[dict]:
    return sample_data.disaster_risks()
