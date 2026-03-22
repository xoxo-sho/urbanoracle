"use client";

import { useEffect, useRef, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { LandPricePoint } from "@/types";

interface MapViewProps {
  landPrices: LandPricePoint[];
}

function formatPrice(price: number): string {
  if (price >= 1_000_000) return `${(price / 1_000_000).toFixed(1)}百万`;
  if (price >= 10_000) return `${(price / 10_000).toFixed(0)}万`;
  return price.toLocaleString();
}

function priceToSize(price: number, min: number, max: number): number {
  const ratio = (price - min) / (max - min || 1);
  return 12 + ratio * 8;
}

function isDarkMode(): boolean {
  return document.documentElement.classList.contains("dark");
}

function getTileStyle(dark: boolean): maplibregl.StyleSpecification {
  const tiles = dark
    ? [
        "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
        "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
      ]
    : [
        "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
        "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
      ];

  return {
    version: 8,
    sources: {
      carto: { type: "raster", tiles, tileSize: 256,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
      },
    },
    layers: [{ id: "carto", type: "raster", source: "carto" }],
  };
}

export default function MapView({ landPrices }: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);

  const addMarkers = useCallback((m: maplibregl.Map) => {
    // Clear existing
    for (const marker of markers.current) marker.remove();
    markers.current = [];

    const prices = landPrices.map((p) => p.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);

    for (const point of landPrices) {
      const size = priceToSize(point.price, minPrice, maxPrice);

      const el = document.createElement("div");
      el.style.cssText = `position:relative;width:${size}px;height:${size}px;cursor:pointer;`;

      const dot = document.createElement("div");
      dot.style.cssText = `
        width:100%;height:100%;
        background:radial-gradient(circle at 35% 35%, oklch(0.8 0.18 25), oklch(0.55 0.22 25));
        border:2px solid oklch(0.85 0.12 25 / 50%);
        border-radius:50%;
        box-shadow:0 0 10px oklch(0.6 0.22 25 / 30%);
        transition:transform 0.2s cubic-bezier(0.16,1,0.3,1);
      `;
      el.appendChild(dot);

      el.addEventListener("mouseenter", () => { dot.style.transform = "scale(1.3)"; });
      el.addEventListener("mouseleave", () => { dot.style.transform = "scale(1)"; });

      const marker = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([point.lng, point.lat])
        .setPopup(
          new maplibregl.Popup({ offset: size / 2 + 6, closeButton: false }).setHTML(`
            <div style="font-family:var(--font-geist-sans,system-ui);line-height:1.6;">
              <div style="font-size:10px;color:var(--muted-foreground);letter-spacing:0.05em;text-transform:uppercase;">${point.landUse} / ${point.year}</div>
              <div style="font-size:12px;font-weight:600;margin:3px 0 1px;color:var(--foreground);">${point.address.replace("東京都", "")}</div>
              <div style="font-size:16px;font-weight:700;color:oklch(0.6 0.22 25);">${formatPrice(point.price)}<span style="font-size:11px;font-weight:400;color:var(--muted-foreground);"> 円/m²</span></div>
            </div>
          `)
        )
        .addTo(m);

      markers.current.push(marker);
    }
  }, [landPrices]);

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    const dark = isDarkMode();
    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: getTileStyle(dark),
      center: [139.745, 35.678],
      zoom: 11.8,
    });

    map.current.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

    map.current.on("load", () => {
      map.current?.resize();
      addMarkers(map.current!);
    });

    const ro = new ResizeObserver(() => map.current?.resize());
    ro.observe(mapContainer.current);

    // Watch for theme changes
    const observer = new MutationObserver(() => {
      const nowDark = isDarkMode();
      map.current?.setStyle(getTileStyle(nowDark));
      // Re-add markers after style change
      map.current?.once("styledata", () => addMarkers(map.current!));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    return () => {
      observer.disconnect();
      ro.disconnect();
      map.current?.remove();
      map.current = null;
    };
  }, [addMarkers]);

  return (
    <div ref={mapContainer} className="absolute inset-0 rounded-2xl" style={{ width: "100%", height: "100%" }} />
  );
}
