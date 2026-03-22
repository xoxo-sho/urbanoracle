"use client";

import { useState, useEffect } from "react";
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
import type {
  DataLayer,
  LandPricePoint,
  DemographicsData,
  DisasterRisk,
  TransportStation,
} from "@/types";
import { Map } from "lucide-react";

const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center rounded-2xl bg-secondary/30 border border-border/50">
      <div className="flex flex-col items-center gap-3">
        <Map className="h-6 w-6 text-primary/60 animate-pulse" />
        <p className="text-xs text-muted-foreground">地図を読み込み中...</p>
      </div>
    </div>
  ),
});

interface DataState<T> {
  data: T;
  isLoading: boolean;
  isLive: boolean;
}

function useApiData<T>(endpoint: string, fallback: T): DataState<T> {
  const [state, setState] = useState<DataState<T>>({
    data: fallback,
    isLoading: true,
    isLive: false,
  });

  useEffect(() => {
    let cancelled = false;
    fetch(endpoint)
      .then((res) => res.json())
      .then((result: { data: T; isLive: boolean }) => {
        if (!cancelled) {
          setState({
            data: result.data,
            isLoading: false,
            isLive: result.isLive,
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ data: fallback, isLoading: false, isLive: false });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [endpoint, fallback]);

  return state;
}

export default function Home() {
  const [layers, setLayers] = useState<DataLayer[]>(dataLayers);

  const landPrices = useApiData<LandPricePoint[]>(
    "/api/land-prices",
    sampleLandPrices
  );
  const demographics = useApiData<DemographicsData[]>(
    "/api/demographics",
    sampleDemographics
  );
  const disasterRisks = useApiData<DisasterRisk[]>(
    "/api/disaster-risks",
    sampleDisasterRisks
  );
  const transport = useApiData<TransportStation[]>(
    "/api/transport",
    sampleTransportStations
  );

  const toggleLayer = (id: string) => {
    setLayers((prev) =>
      prev.map((l) => (l.id === id ? { ...l, enabled: !l.enabled } : l))
    );
  };

  const totalPoints = landPrices.data.length;
  const totalWards = demographics.data.length;
  const totalRisks = disasterRisks.data.length;
  const totalStations = transport.data.length;

  return (
    <div className="flex h-screen flex-col overflow-hidden" style={{ height: "100dvh" }}>
      {/* Header */}
      <header className="shrink-0 border-b border-border/50 bg-card/50 backdrop-blur-sm px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/15">
                <Map className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h1 className="text-base font-bold tracking-tight leading-none">
                  Urban<span className="text-primary">Oracle</span>
                </h1>
                <p className="text-[10px] text-muted-foreground mt-0.5">都市データダッシュボード</p>
              </div>
            </div>
            <div className="h-6 w-px bg-border/50" />
            <LayerSelector layers={layers} onToggle={toggleLayer} />
          </div>
          <StatsBar
            landPriceCount={totalPoints}
            demographicsCount={totalWards}
            disasterRiskCount={totalRisks}
            transportCount={totalStations}
          />
        </div>
      </header>

      {/* Main content — dashboard grid */}
      <main className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-12 gap-4 h-full">
          {/* Left column: Map + Transport */}
          <div className="col-span-12 lg:col-span-5 flex flex-col gap-4">
            {/* Map section */}
            <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-card/30" style={{ minHeight: "380px", flex: "1 1 380px" }}>
              <MapView landPrices={landPrices.data} />
              {/* Layer indicator overlay */}
              <div className="absolute top-3 left-3 z-10">
                <div className="glass rounded-lg px-2.5 py-1 text-[10px] font-medium text-muted-foreground flex items-center gap-1.5">
                  地価データ: {totalPoints}地点
                  {!landPrices.isLive && !landPrices.isLoading && (
                    <span className="text-amber-400">(sample)</span>
                  )}
                </div>
              </div>
            </div>

            {/* Transport — below map */}
            <div className="shrink-0 animate-fade-in-up" style={{ animationDelay: "0.15s", opacity: 0 }}>
              {transport.isLoading ? (
                <LoadingSkeleton height={200} />
              ) : (
                <TransportPanel stations={transport.data} />
              )}
            </div>
          </div>

          {/* Right column: Tabs (Demographics + Disaster) */}
          <div className="col-span-12 lg:col-span-7 flex flex-col animate-fade-in-up" style={{ animationDelay: "0.05s", opacity: 0 }}>
            <Tabs defaultValue="demographics" className="flex flex-col h-full">
              <TabsList className="shrink-0 w-full bg-white/5 rounded-xl p-1">
                <TabsTrigger value="demographics" className="flex-1 cursor-pointer rounded-lg text-xs">
                  人口統計
                </TabsTrigger>
                <TabsTrigger value="disaster" className="flex-1 cursor-pointer rounded-lg text-xs">
                  災害リスク
                </TabsTrigger>
              </TabsList>

              <TabsContent value="demographics" className="mt-4 flex-1 overflow-y-auto">
                {demographics.isLoading ? (
                  <LoadingSkeleton height={400} />
                ) : (
                  <DemographicsChart data={demographics.data} />
                )}
              </TabsContent>

              <TabsContent value="disaster" className="mt-4 flex-1 overflow-y-auto">
                {disasterRisks.isLoading ? (
                  <LoadingSkeleton height={300} />
                ) : (
                  <DisasterRiskPanel risks={disasterRisks.data} />
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>
    </div>
  );
}

function LoadingSkeleton({ height }: { height: number }) {
  return (
    <div
      className="rounded-2xl border border-border/50 bg-secondary/20 shimmer"
      style={{ height }}
    />
  );
}
