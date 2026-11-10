"use client";

import { useEffect, useRef, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { DataLayer, DemographicsData, DisasterWard, FieldSources, LandPriceWard, TransportStation } from "@/types";
import type { DataStatus } from "@/lib/use-gated-data";
import { loadWardGeoJSON, getWardCenter, buildStationGeoJSON } from "@/data/ward-boundaries";
import { mapPalette } from "@/lib/palette";
import type { WardFeatureCollection } from "@/data/ward-boundaries";
import { basemapStyle } from "@/components/map/basemap";
import { WARD_BOUNDARY_CREDIT } from "@/lib/credits";
import { SOURCES } from "@/lib/sources";
import { LAND_USE_LABEL, manPrice, type LandUse } from "@/lib/land-price";
import { FAILED_TEXT, LOADING_TEXT } from "@/components/dashboard/DataState";
import { NO_DATA } from "@/lib/format";
import { HAZARD_RASTERS } from "@/components/map/hazard-rasters";
import { censusTooltip } from "@/lib/census-map";

interface MapViewProps {
  selectedWard: string | null;
  onSelectWard: (ward: string | null) => void;
  layers: DataLayer[];
  stations: TransportStation[];
  /**
   * State of the /transport answer behind `stations`: the bubbles are credited
   * to the 国土数値情報 snapshot only when the answer arrived in full.
   */
  transportStatus?: DataStatus;
  /**
   * The 地価 choropleth (real-data plan PR 5): the /land-prices payload, the
   * use the page's switch chose, the three ramp stops derived from that use's
   * figures (the legend prints the same array), and the answer's state for
   * the hover tooltip.
   */
  landPrices?: LandPriceWard[];
  landUse?: LandUse;
  landPriceStops?: number[] | null;
  landPriceStatus?: DataStatus;
  /**
   * The 災害 choropleth (real-data plan PR 7): the /disaster-risks payload —
   * each ward's share of 町丁目 at 総合危険度 rank 5 — its state, and the three
   * stops derived from the data (the legend prints the same array).
   */
  disaster?: DisasterWard[];
  disasterStatus?: DataStatus;
  disasterStops?: number[] | null;
  /**
   * The 人口 choropleth and the tooltip's 人口 / 密度 (real-data plan PR 8): the
   * /demographics payload, its state and `sources` (the census year the
   * tooltip names), and the three density stops derived from the data (the
   * legend prints the same array).
   */
  census?: DemographicsData[];
  censusStatus?: DataStatus;
  censusSources?: FieldSources;
  censusStops?: number[] | null;
}

function isDarkMode(): boolean {
  return document.documentElement.classList.contains("dark");
}

const DEFAULT_CENTER: [number, number] = [139.745, 35.695];
const DEFAULT_ZOOM = 11.2;
const TOKYO_BOUNDS: [[number, number], [number, number]] = [[139.55, 35.50], [139.95, 35.85]];

function flyToWard(m: maplibregl.Map, wardName: string) {
  const center = getWardCenter(wardName);
  if (center) {
    m.flyTo({ center, zoom: 13.5, duration: 800 });
  }
}

function isLayerEnabled(layers: DataLayer[], id: string): boolean {
  return layers.find((l) => l.id === id)?.enabled ?? false;
}

export default function MapView({
  selectedWard,
  onSelectWard,
  layers,
  stations,
  transportStatus = "loading",
  landPrices = [],
  landUse = "residential",
  landPriceStops = null,
  landPriceStatus = "loading",
  disaster = [],
  disasterStatus = "loading",
  disasterStops = null,
  census = [],
  censusStatus = "loading",
  censusSources = {},
  censusStops = null,
}: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const popup = useRef<maplibregl.Popup | null>(null);
  const hoveredWard = useRef<number | null>(null);
  const initialized = useRef(false);
  const wardGeoJSON = useRef<WardFeatureCollection | null>(null);
  // The map's own handlers are registered once, at mount, so they read the
  // selection through refs: a value captured in them would stay the first
  // render's (null), and a second click on the selected ward would select it
  // again instead of clearing it.
  const selectedWardRef = useRef(selectedWard);
  const onSelectWardRef = useRef(onSelectWard);
  useEffect(() => {
    selectedWardRef.current = selectedWard;
    onSelectWardRef.current = onSelectWard;
  }, [selectedWard, onSelectWard]);

  const setupLayers = useCallback((m: maplibregl.Map) => {
    // MapLibre paint expressions cannot read CSS variables, so the semantic
    // palette is resolved to literals for the active mode.
    const c = mapPalette(isDarkMode());
    // Remove existing custom layers/sources
    const hazardIds = HAZARD_RASTERS.map((r) => r.id);
    const layerIds = ["ward-fill", "ward-line", "ward-highlight-line", "station-circles", "station-labels", ...hazardIds];
    for (const id of layerIds) {
      if (m.getLayer(id)) m.removeLayer(id);
    }
    const sourceIds = ["wards", "stations", ...hazardIds];
    for (const id of sourceIds) {
      if (m.getSource(id)) m.removeSource(id);
    }

    if (!wardGeoJSON.current) return;

    // The 地価 figure of each ward for the chosen use, merged into the feature
    // at layer time: the fill reads `landPrice`, the hover tooltip
    // `landPriceText`. A ward the payload does not cover carries no
    // `landPrice` and keeps the empty fill.
    const figures = new Map(landPrices.map((w) => [w.region, w[landUse]]));
    // The 災害 figure of each ward (real-data plan PR 7): its share of 町丁目 at
    // 総合危険度 rank 5, merged as `rank5Share`; a ward the payload does not
    // cover keeps the empty fill.
    const rank5 = new Map(disaster.map((w) => [w.region, w.earthquake.rank5Share]));
    // The census record of each ward (real-data plan PR 8): its density for the
    // fill, and the tooltip's two lines with unit and year (or the answer's state).
    const censusRows = new Map(census.map((w) => [w.region, w]));
    const landPriceText = (name: string): string => {
      const f = figures.get(name);
      if (f) return `${manPrice(f.meanPrice)}/m²（${LAND_USE_LABEL[landUse]} n=${f.n}）`;
      if (landPriceStatus === "loading") return LOADING_TEXT;
      if (landPriceStatus === "unavailable") return FAILED_TEXT;
      return NO_DATA;
    };
    const wards: WardFeatureCollection = {
      ...wardGeoJSON.current,
      features: wardGeoJSON.current.features.map((f) => {
        const figure = figures.get(f.properties.name);
        const row = censusRows.get(f.properties.name);
        const tip = censusTooltip(row, censusSources, censusStatus);
        return {
          ...f,
          properties: {
            ...f.properties,
            ...(figure ? { landPrice: figure.meanPrice } : {}),
            ...(rank5.has(f.properties.name) ? { rank5Share: rank5.get(f.properties.name) } : {}),
            ...(row && typeof row.density === "number" ? { density: row.density } : {}),
            populationText: tip.population,
            densityText: tip.density,
            landPriceText: landPriceText(f.properties.name),
          },
        };
      }),
    };

    // Add ward polygons source from real GeoJSON
    m.addSource("wards", { type: "geojson", data: wards, promoteId: "name", attribution: WARD_BOUNDARY_CREDIT });

    // Determine which property to color by
    const landEnabled = isLayerEnabled(layers, "land-price");
    const demoEnabled = isLayerEnabled(layers, "demographics");
    const riskEnabled = isLayerEnabled(layers, "disaster-risk");

    let fillColor: maplibregl.ExpressionSpecification | string;
    if (landEnabled) {
      // Stops from the data for the chosen use (the legend prints the same
      // three); no fill until the 地価 payload is on screen.
      const stops = landPriceStatus === "ok" && landPriceStops && landPriceStops.length === 3 ? landPriceStops : null;
      fillColor = stops
        ? (["case",
            ["has", "landPrice"],
            ["interpolate", ["linear"], ["get", "landPrice"],
              stops[0], c.upFill,
              stops[1], c.upStrong,
              stops[2], c.upText,
            ],
            c.emptyFill,
          ] as maplibregl.ExpressionSpecification)
        : c.emptyFill;
    } else if (demoEnabled) {
      // Stops from the census densities (the legend prints the same three); no
      // fill until the census payload is on screen.
      const stops = (censusStatus === "ok" || censusStatus === "partial") && censusStops && censusStops.length === 3 ? censusStops : null;
      fillColor = stops
        ? (["case",
            ["has", "density"],
            ["interpolate", ["linear"], ["get", "density"],
              stops[0], c.neutral3,
              stops[1], c.neutral2,
              stops[2], c.neutral1,
            ],
            c.emptyFill,
          ] as maplibregl.ExpressionSpecification)
        : c.emptyFill;
    } else if (riskEnabled) {
      // Stops from the data (the legend prints the same three); no fill until
      // the 災害 payload is on screen.
      const stops = disasterStatus === "ok" && disasterStops && disasterStops.length === 3 ? disasterStops : null;
      fillColor = stops
        ? (["case",
            ["has", "rank5Share"],
            ["interpolate", ["linear"], ["get", "rank5Share"],
              stops[0], c.downFill,
              stops[1], c.downStrong,
              stops[2], c.downText,
            ],
            c.emptyFill,
          ] as maplibregl.ExpressionSpecification)
        : c.emptyFill;
    } else {
      fillColor = c.emptyFill;
    }

    // Choropleth fill layer
    m.addLayer({
      id: "ward-fill",
      type: "fill",
      source: "wards",
      paint: {
        "fill-color": fillColor,
        "fill-opacity": [
          "case",
          ["boolean", ["feature-state", "hover"], false], 0.5,
          selectedWard
            ? ["case", ["==", ["get", "name"], selectedWard], 0.4, 0.15]
            : 0.3,
        ],
      },
    });

    // Ward boundary lines
    m.addLayer({
      id: "ward-line",
      type: "line",
      source: "wards",
      paint: {
        "line-color": c.hairline,
        "line-width": [
          "case",
          selectedWard
            ? ["==", ["get", "name"], selectedWard]
            : false,
          3,
          0.8,
        ],
      },
    });

    // Selected ward highlight
    if (selectedWard) {
      m.addLayer({
        id: "ward-highlight-line",
        type: "line",
        source: "wards",
        filter: ["==", ["get", "name"], selectedWard],
        paint: {
          "line-color": c.upText,
          "line-width": 3,
          "line-opacity": 0.9,
        },
      });
    }

    // Station bubbles (when transportation layer is enabled)
    if (isLayerEnabled(layers, "transportation") && stations.length > 0) {
      m.addSource("stations", {
        type: "geojson",
        data: buildStationGeoJSON(stations),
        ...(transportStatus === "ok" ? { attribution: `乗降客数: ${SOURCES.ksj.label}` } : {}),
      });

      m.addLayer({
        id: "station-circles",
        type: "circle",
        source: "stations",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["get", "passengers"], 100000, 6, 800000, 22],
          "circle-color": c.upStrong,
          "circle-opacity": 0.7,
          "circle-stroke-color": c.upText,
          "circle-stroke-width": 1.5,
          "circle-stroke-opacity": 0.9,
        },
      });

      m.addLayer({
        id: "station-labels",
        type: "symbol",
        source: "stations",
        layout: {
          "text-field": ["get", "name"],
          "text-size": 12,
          "text-offset": [0, -1.8],
          "text-anchor": "bottom",
        },
        paint: {
          "text-color": c.inkOnMap,
          "text-halo-color": c.haloOnMap,
          "text-halo-width": 1.5,
        },
      });
    }

    // Hazard map tile overlays (disaster-risk layer): the ハザードマップポータルサイト
    // sets that render in the 23 wards (hazard-rasters.ts), each with its 出典.
    if (isLayerEnabled(layers, "disaster-risk")) {
      for (const raster of HAZARD_RASTERS) {
        m.addSource(raster.id, {
          type: "raster",
          tiles: [raster.tiles],
          tileSize: 256,
          attribution: raster.attribution,
        });
        m.addLayer({
          id: raster.id,
          type: "raster",
          source: raster.id,
          paint: { "raster-opacity": raster.opacity },
        });
      }
    }
  }, [layers, selectedWard, stations, transportStatus, landPrices, landUse, landPriceStops, landPriceStatus, disaster, disasterStatus, disasterStops, census, censusStatus, censusSources, censusStops]);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;
    let cancelled = false;

    try {
      map.current = new maplibregl.Map({
        container: mapContainer.current,
        style: basemapStyle(isDarkMode()),
        // Added below as an expanded control: the credits must not collapse
        // behind an (i) button on a narrow map.
        attributionControl: false,
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        maxBounds: TOKYO_BOUNDS,
      });
    } catch {
      // WebGL not available (e.g. headless browser in tests)
      return;
    }

    const m = map.current;
    popup.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });

    // Top-right: the legend card owns the bottom-left and the zoom buttons the
    // bottom-right, and a tall card would push a bottom control out of view.
    m.addControl(new maplibregl.AttributionControl({ compact: false }), "top-right");
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

    m.on("load", () => {
      m.resize();
      loadWardGeoJSON().then((data) => {
        if (cancelled || !map.current) return;
        wardGeoJSON.current = data;
        setupLayers(m);
        initialized.current = true;
        if (selectedWardRef.current) flyToWard(m, selectedWardRef.current);
      });
    });

    // Hover: highlight ward polygon
    m.on("mousemove", "ward-fill", (e) => {
      if (!e.features || e.features.length === 0) return;
      m.getCanvas().style.cursor = "pointer";

      const feature = e.features[0];
      const name = feature.properties?.name ?? "";

      // Update hover state
      if (hoveredWard.current !== null) {
        m.setFeatureState({ source: "wards", id: hoveredWard.current }, { hover: false });
      }
      hoveredWard.current = feature.id as number;
      m.setFeatureState({ source: "wards", id: hoveredWard.current }, { hover: true });

      // Show tooltip
      const props = feature.properties;
      if (props && popup.current) {
        // Each line was built from its payload at layer time, with unit and year.
        const text = (v: unknown) => (typeof v === "string" && v ? v : NO_DATA);
        const pop = text(props.populationText);
        const density = text(props.densityText);
        const price = text(props.landPriceText);

        // dxa-ui: the tooltip font is the CSS token directly — this is DOM (a
        // MapLibre popup html string → element), not canvas, so var() resolves.
        // The old value named Geist only, and this tooltip renders 人口 / 地価 /
        // 密度 and ward names.
        popup.current
          .setLngLat(e.lngLat)
          .setHTML(`
            <div style="font-family:var(--dxa-font-sans);line-height:1.5;">
              <div style="font-size:13px;font-weight:700;color:var(--foreground);margin-bottom:4px;">${name}</div>
              <div style="font-size:11px;color:var(--muted-foreground);display:grid;grid-template-columns:auto 1fr;gap:2px 8px;">
                <span>人口</span><span style="text-align:right;color:var(--foreground);">${pop}</span>
                <span>密度</span><span style="text-align:right;color:var(--foreground);">${density}</span>
                <span>地価</span><span style="text-align:right;color:var(--foreground);">${price}</span>
              </div>
            </div>
          `)
          .addTo(m);
      }
    });

    m.on("mouseleave", "ward-fill", () => {
      m.getCanvas().style.cursor = "";
      if (hoveredWard.current !== null) {
        m.setFeatureState({ source: "wards", id: hoveredWard.current }, { hover: false });
        hoveredWard.current = null;
      }
      popup.current?.remove();
    });

    // Click: select a ward; a click on the selected ward clears the selection.
    m.on("click", "ward-fill", (e) => {
      if (!e.features || e.features.length === 0) return;
      const name = e.features[0].properties?.name;
      if (name) {
        onSelectWardRef.current(selectedWardRef.current === name ? null : name);
      }
    });

    // Station hover tooltip
    m.on("mouseenter", "station-circles", (e) => {
      if (!e.features || e.features.length === 0) return;
      m.getCanvas().style.cursor = "pointer";
      const props = e.features[0].properties;
      if (props && popup.current) {
        popup.current
          .setLngLat(e.lngLat)
          .setHTML(`
            <div style="font-family:var(--dxa-font-sans);">
              <div style="font-size:13px;font-weight:700;color:var(--foreground);">${props.name}</div>
              <div style="font-size:12px;color:var(--up-text);font-weight:600;">${(Number(props.passengers) / 10000).toFixed(1)}万人/日</div>
            </div>
          `)
          .addTo(m);
      }
    });

    m.on("mouseleave", "station-circles", () => {
      m.getCanvas().style.cursor = "";
      popup.current?.remove();
    });

    const ro = new ResizeObserver(() => m.resize());
    ro.observe(mapContainer.current);

    // Theme watcher
    const observer = new MutationObserver(() => {
      if (cancelled || !map.current) return;
      m.setStyle(basemapStyle(isDarkMode()));
      m.once("styledata", () => {
        if (cancelled || !map.current || !initialized.current) return;
        if (!wardGeoJSON.current) {
          loadWardGeoJSON().then((data) => {
            if (cancelled || !map.current) return;
            wardGeoJSON.current = data;
            setupLayers(m);
          });
        } else {
          setupLayers(m);
        }
      });
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    return () => {
      cancelled = true;
      observer.disconnect();
      ro.disconnect();
      popup.current?.remove();
      m.remove();
      map.current = null;
      initialized.current = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // React to layer/ward/station changes
  useEffect(() => {
    if (!map.current || !initialized.current) return;
    const m = map.current;

    if (!m.isStyleLoaded()) {
      m.once("styledata", () => setupLayers(m));
    } else {
      setupLayers(m);
    }

    // Fly to ward or reset
    if (selectedWard) {
      flyToWard(m, selectedWard);
    } else {
      m.flyTo({ center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM, duration: 800 });
    }
  }, [selectedWard, layers, stations, landPrices, landUse, landPriceStops, landPriceStatus, setupLayers]);

  return <div ref={mapContainer} className="absolute inset-0 rounded-sm" style={{ width: "100%", height: "100%" }} />;
}
