"use client";

import { useEffect, useRef, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { LandPricePoint, DataLayer, TransportStation } from "@/types";
import { loadWardGeoJSON, getWardCenter, buildStationGeoJSON } from "@/data/ward-boundaries";
import { mapPalette } from "@/lib/palette";
import type { WardFeatureCollection } from "@/data/ward-boundaries";

interface MapViewProps {
  landPrices: LandPricePoint[];
  selectedWard: string | null;
  onSelectWard: (ward: string | null) => void;
  layers: DataLayer[];
  stations: TransportStation[];
}

function isDarkMode(): boolean {
  return document.documentElement.classList.contains("dark");
}

function getTileStyle(dark: boolean): maplibregl.StyleSpecification {
  const tiles = dark
    ? ["https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png", "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png"]
    : ["https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png", "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png"];
  return {
    version: 8,
    sources: { carto: { type: "raster", tiles, tileSize: 256, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>' } },
    layers: [{ id: "carto", type: "raster", source: "carto" }],
  };
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

export default function MapView({ selectedWard, onSelectWard, layers, stations }: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const popup = useRef<maplibregl.Popup | null>(null);
  const hoveredWard = useRef<number | null>(null);
  const initialized = useRef(false);
  const wardGeoJSON = useRef<WardFeatureCollection | null>(null);

  const setupLayers = useCallback((m: maplibregl.Map) => {
    // MapLibre paint expressions cannot read CSS variables, so the semantic
    // palette is resolved to literals for the active mode.
    const c = mapPalette(isDarkMode());
    // Remove existing custom layers/sources
    const layerIds = ["ward-fill", "ward-line", "ward-highlight-line", "station-circles", "station-labels", "hazard-flood", "hazard-tsunami", "hazard-landslide"];
    for (const id of layerIds) {
      if (m.getLayer(id)) m.removeLayer(id);
    }
    const sourceIds = ["wards", "stations", "hazard-flood", "hazard-tsunami", "hazard-landslide"];
    for (const id of sourceIds) {
      if (m.getSource(id)) m.removeSource(id);
    }

    if (!wardGeoJSON.current) return;

    // Add ward polygons source from real GeoJSON
    m.addSource("wards", { type: "geojson", data: wardGeoJSON.current, promoteId: "name" });

    // Determine which property to color by
    const landEnabled = isLayerEnabled(layers, "land-price");
    const demoEnabled = isLayerEnabled(layers, "demographics");
    const riskEnabled = isLayerEnabled(layers, "disaster-risk");

    let fillColor: maplibregl.ExpressionSpecification | string;
    if (landEnabled) {
      fillColor = ["interpolate", ["linear"], ["get", "avgLandPrice"],
        300000, c.upFill,
        1000000, c.upUi,
        3000000, c.upStrong,
        5300000, c.upText,
      ] as maplibregl.ExpressionSpecification;
    } else if (demoEnabled) {
      fillColor = ["interpolate", ["linear"], ["get", "density"],
        5000, c.neutral3,
        12000, c.neutral2,
        23000, c.neutral1,
      ] as maplibregl.ExpressionSpecification;
    } else if (riskEnabled) {
      fillColor = ["interpolate", ["linear"], ["get", "maxRiskLevel"],
        0, c.downFill,
        2, c.downUi,
        4, c.downStrong,
        5, c.downText,
      ] as maplibregl.ExpressionSpecification;
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
      m.addSource("stations", { type: "geojson", data: buildStationGeoJSON(stations) });

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
          "text-size": 10,
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

    // Hazard map tile overlays (disaster-risk layer)
    if (isLayerEnabled(layers, "disaster-risk")) {
      // Flood inundation areas (想定最大規模)
      m.addSource("hazard-flood", {
        type: "raster",
        tiles: ["https://disaportaldata.gsi.go.jp/raster/01_flood_l2_shinsuishin_data/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: "ハザードマップポータルサイト（国土交通省）",
      });
      m.addLayer({
        id: "hazard-flood",
        type: "raster",
        source: "hazard-flood",
        paint: { "raster-opacity": 0.5 },
      });

      // Tsunami inundation areas
      m.addSource("hazard-tsunami", {
        type: "raster",
        tiles: ["https://disaportaldata.gsi.go.jp/raster/04_tsunami_newlegend_data/{z}/{x}/{y}.png"],
        tileSize: 256,
      });
      m.addLayer({
        id: "hazard-tsunami",
        type: "raster",
        source: "hazard-tsunami",
        paint: { "raster-opacity": 0.45 },
      });

      // Landslide hazard areas
      m.addSource("hazard-landslide", {
        type: "raster",
        tiles: ["https://disaportaldata.gsi.go.jp/raster/05_dosekiryukeikaikuiki/{z}/{x}/{y}.png"],
        tileSize: 256,
      });
      m.addLayer({
        id: "hazard-landslide",
        type: "raster",
        source: "hazard-landslide",
        paint: { "raster-opacity": 0.45 },
      });
    }
  }, [layers, selectedWard, stations]);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;
    let cancelled = false;

    try {
      map.current = new maplibregl.Map({
        container: mapContainer.current,
        style: getTileStyle(isDarkMode()),
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

    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

    m.on("load", () => {
      m.resize();
      loadWardGeoJSON().then((data) => {
        if (cancelled || !map.current) return;
        wardGeoJSON.current = data;
        setupLayers(m);
        initialized.current = true;
        if (selectedWard) flyToWard(m, selectedWard);
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
        const density = props.density ? Number(props.density).toLocaleString() : "—";
        const price = props.avgLandPrice ? `${(Number(props.avgLandPrice) / 10000).toFixed(0)}万` : "—";
        const pop = props.population ? `${(Number(props.population) / 10000).toFixed(1)}万` : "—";

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
                <span>人口</span><span style="text-align:right;color:var(--foreground);">${pop}人</span>
                <span>密度</span><span style="text-align:right;color:var(--foreground);">${density}/km²</span>
                <span>地価</span><span style="text-align:right;color:var(--foreground);">${price}/m²</span>
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

    // Click: select ward
    m.on("click", "ward-fill", (e) => {
      if (!e.features || e.features.length === 0) return;
      const name = e.features[0].properties?.name;
      if (name) {
        onSelectWard(selectedWard === name ? null : name);
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
      m.setStyle(getTileStyle(isDarkMode()));
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
  }, [selectedWard, layers, stations, setupLayers]);

  return <div ref={mapContainer} className="absolute inset-0 rounded-sm" style={{ width: "100%", height: "100%" }} />;
}
