"use client";

import { useEffect, useRef } from "react";
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
  return 14 + ratio * 10; // 14px to 24px
}

export default function MapView({ landPrices }: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    const prices = landPrices.map((p) => p.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          "carto-dark": {
            type: "raster",
            tiles: [
              "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
              "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
              "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
            ],
            tileSize: 256,
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
          },
        },
        layers: [
          {
            id: "carto-dark",
            type: "raster",
            source: "carto-dark",
          },
        ],
      },
      center: [139.745, 35.678],
      zoom: 12.5,
      pitch: 0,
      maxPitch: 60,
    });

    map.current.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "bottom-right"
    );

    for (const point of landPrices) {
      const size = priceToSize(point.price, minPrice, maxPrice);

      // Outer pulse ring
      const pulse = document.createElement("div");
      pulse.style.cssText = `
        position: absolute;
        width: ${size + 8}px;
        height: ${size + 8}px;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        border-radius: 50%;
        background: oklch(0.7 0.2 25 / 20%);
        animation: pulseRing 2.5s cubic-bezier(0, 0, 0.2, 1) infinite;
      `;

      // Main marker
      const el = document.createElement("div");
      el.style.cssText = `
        position: relative;
        width: ${size}px;
        height: ${size}px;
        cursor: pointer;
      `;
      el.appendChild(pulse);

      const dot = document.createElement("div");
      dot.style.cssText = `
        position: relative;
        width: 100%;
        height: 100%;
        background: radial-gradient(circle at 35% 35%, oklch(0.8 0.18 25), oklch(0.6 0.22 25));
        border: 2px solid oklch(0.85 0.12 25 / 60%);
        border-radius: 50%;
        box-shadow: 0 0 16px oklch(0.65 0.22 25 / 40%), inset 0 1px 2px oklch(1 0 0 / 20%);
        transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease;
        z-index: 1;
      `;
      el.appendChild(dot);

      el.addEventListener("mouseenter", () => {
        dot.style.transform = "scale(1.3)";
        dot.style.boxShadow = "0 0 24px oklch(0.65 0.22 25 / 60%), inset 0 1px 2px oklch(1 0 0 / 20%)";
      });
      el.addEventListener("mouseleave", () => {
        dot.style.transform = "scale(1)";
        dot.style.boxShadow = "0 0 16px oklch(0.65 0.22 25 / 40%), inset 0 1px 2px oklch(1 0 0 / 20%)";
      });

      new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([point.lng, point.lat])
        .setPopup(
          new maplibregl.Popup({ offset: size / 2 + 8, closeButton: false }).setHTML(`
            <div style="font-family: var(--font-geist-sans, system-ui); line-height: 1.6;">
              <div style="font-size: 11px; color: oklch(0.55 0 0); letter-spacing: 0.05em; text-transform: uppercase;">${point.landUse} / ${point.year}</div>
              <div style="font-size: 13px; font-weight: 600; margin: 4px 0 2px;">${point.address.replace("東京都", "")}</div>
              <div style="font-size: 18px; font-weight: 700; color: oklch(0.8 0.18 25); letter-spacing: -0.02em;">${formatPrice(point.price)}<span style="font-size: 12px; font-weight: 400; color: oklch(0.55 0 0);"> 円/m²</span></div>
            </div>
          `)
        )
        .addTo(map.current!);
    }

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, [landPrices]);

  return <div ref={mapContainer} className="absolute inset-0" />;
}
