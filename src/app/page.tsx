"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import LayerSelector from "@/components/dashboard/LayerSelector";
import StatsBar from "@/components/dashboard/StatsBar";
import DemographicsChart from "@/components/dashboard/DemographicsChart";
import DisasterRiskPanel from "@/components/dashboard/DisasterRiskPanel";
import TransportPanel from "@/components/dashboard/TransportPanel";
import {
  dataLayers,
  sampleLandPrices,
  sampleDemographics,
  sampleDisasterRisks,
  sampleTransportStations,
} from "@/data/sample";
import type { DataLayer } from "@/types";
import { Map, PanelRightOpen, PanelRightClose } from "lucide-react";

const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="relative">
          <Map className="h-8 w-8 text-primary/60" />
          <div className="absolute inset-0 shimmer rounded-full" />
        </div>
        <p className="text-xs text-muted-foreground">Loading map...</p>
      </div>
    </div>
  ),
});

export default function Home() {
  const [layers, setLayers] = useState<DataLayer[]>(dataLayers);
  const [panelOpen, setPanelOpen] = useState(true);

  const toggleLayer = (id: string) => {
    setLayers((prev) =>
      prev.map((l) => (l.id === id ? { ...l, enabled: !l.enabled } : l))
    );
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      {/* Full-screen map — the hero */}
      <MapView landPrices={sampleLandPrices} />

      {/* Floating top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 p-4">
        {/* Logo + Layer selector */}
        <div className="pointer-events-auto flex items-center gap-3 animate-fade-in-up">
          <div className="glass-strong flex items-center gap-2.5 rounded-2xl px-4 py-2.5 shadow-lg shadow-black/20">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/20">
              <Map className="h-4 w-4 text-primary" />
            </div>
            <div className="leading-none">
              <span className="text-sm font-bold tracking-tight">Urban</span>
              <span className="text-sm font-bold tracking-tight text-primary">Oracle</span>
            </div>
          </div>
          <div className="glass-strong rounded-2xl px-3 py-2 shadow-lg shadow-black/20">
            <LayerSelector layers={layers} onToggle={toggleLayer} />
          </div>
        </div>

        {/* Stats bar */}
        <div className="pointer-events-auto animate-fade-in-up" style={{ animationDelay: "0.1s", opacity: 0 }}>
          <StatsBar />
        </div>
      </div>

      {/* Panel toggle button */}
      <button
        onClick={() => setPanelOpen(!panelOpen)}
        className="pointer-events-auto absolute right-4 bottom-4 z-10 glass-strong flex h-10 w-10 items-center justify-center rounded-xl shadow-lg shadow-black/20 transition-all hover:bg-white/10 cursor-pointer lg:hidden"
      >
        {panelOpen ? (
          <PanelRightClose className="h-4 w-4" />
        ) : (
          <PanelRightOpen className="h-4 w-4" />
        )}
      </button>

      {/* Floating side panel */}
      <div
        className={`absolute top-4 right-4 bottom-4 z-10 w-[400px] transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          panelOpen
            ? "translate-x-0 opacity-100"
            : "translate-x-[calc(100%+16px)] opacity-0"
        }`}
      >
        <div className="glass-strong side-panel flex h-full flex-col overflow-hidden rounded-2xl shadow-2xl shadow-black/30">
          {/* Panel header */}
          <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              データパネル
            </h2>
            <button
              onClick={() => setPanelOpen(false)}
              className="hidden lg:flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-white/8 cursor-pointer"
            >
              <PanelRightClose className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>

          {/* Tab content area */}
          <div className="flex-1 overflow-y-auto p-4">
            <Tabs defaultValue="demographics">
              <TabsList className="w-full bg-white/5 rounded-xl p-1">
                <TabsTrigger value="demographics" className="flex-1 cursor-pointer rounded-lg text-xs">
                  人口統計
                </TabsTrigger>
                <TabsTrigger value="disaster" className="flex-1 cursor-pointer rounded-lg text-xs">
                  災害リスク
                </TabsTrigger>
                <TabsTrigger value="transport" className="flex-1 cursor-pointer rounded-lg text-xs">
                  交通
                </TabsTrigger>
              </TabsList>

              <TabsContent value="demographics" className="mt-4 animate-fade-in-up">
                <DemographicsChart data={sampleDemographics} />
              </TabsContent>

              <TabsContent value="disaster" className="mt-4 animate-fade-in-up">
                <DisasterRiskPanel risks={sampleDisasterRisks} />
              </TabsContent>

              <TabsContent value="transport" className="mt-4 animate-fade-in-up">
                <TransportPanel stations={sampleTransportStations} />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      {/* Bottom-left: map attribution overlay fade */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/30 to-transparent" />
    </div>
  );
}
