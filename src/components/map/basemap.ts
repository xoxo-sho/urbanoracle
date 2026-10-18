import type maplibregl from "maplibre-gl";
import { GSI_PALE_PROCESSED, GSI_TILE_LIST_URL, GSI_TILES_NAME } from "@/lib/credits";

/**
 * The basemap: 地理院タイル 淡色地図 (国土地理院). Real-time use in a web app
 * needs no application, only the credit: 「地理院タイル」 with a link to the
 * tile list page (地理院タイル一覧).
 *
 * The dark theme inverts the pale tiles in the renderer. That changes the
 * tiles' appearance, so it is processing under the 国土地理院 content terms
 * and the attribution adds the 「…を加工して作成」 statement.
 */

export const GSI_PALE_TILES = "https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png";

const GSI_LINK = `<a href="${GSI_TILE_LIST_URL}" target="_blank" rel="noopener noreferrer">${GSI_TILES_NAME}</a>`;

export function basemapAttribution(dark: boolean): string {
  return dark ? `${GSI_LINK} ／ ${GSI_PALE_PROCESSED}` : GSI_LINK;
}

const DARK_PAINT = {
  "raster-brightness-min": 1,
  "raster-brightness-max": 0.12,
  "raster-hue-rotate": 180,
  "raster-saturation": -0.6,
  "raster-contrast": 0.1,
} as const;

export function basemapStyle(dark: boolean): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {
      gsi: {
        type: "raster",
        tiles: [GSI_PALE_TILES],
        tileSize: 256,
        minzoom: 2,
        maxzoom: 18,
        attribution: basemapAttribution(dark),
      },
    },
    layers: [{ id: "gsi-pale", type: "raster", source: "gsi", paint: dark ? DARK_PAINT : {} }],
  };
}
