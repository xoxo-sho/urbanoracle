"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import LayerSelector from "@/components/dashboard/LayerSelector";
import StatsBar from "@/components/dashboard/StatsBar";
import WardSelector from "@/components/dashboard/WardSelector";
import LandPriceChart from "@/components/dashboard/LandPriceChart";
import DemographicsChart from "@/components/dashboard/DemographicsChart";
import DisasterRiskPanel from "@/components/dashboard/DisasterRiskPanel";
import TransportPanel from "@/components/dashboard/TransportPanel";
import WardRadar from "@/components/dashboard/WardRadar";
import WardTable from "@/components/dashboard/WardTable";
import ThemeToggle from "@/components/dashboard/ThemeToggle";
import {
  dataLayers,
  sampleLandPrices,
  sampleLandPriceSummary,
  sampleDemographics,
  sampleDisasterRisks,
  sampleTransportStations,
  samplePopulationTrends,
  sampleTransportTrends,
  sampleZoning,
  sampleWardProfiles,
} from "@/data/sample";
import type {
  DataLayer,
  LandPricePoint,
  DemographicsData,
  DisasterRisk,
  TransportStation,
} from "@/types";
import { Map, TrendingUp, Users, Shield } from "lucide-react";

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
          setState({ data: result.data, isLoading: false, isLive: result.isLive });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ data: fallback, isLoading: false, isLive: false });
        }
      });
    return () => { cancelled = true; };
  }, [endpoint, fallback]);

  return state;
}

export default function Home() {
  const [layers, setLayers] = useState<DataLayer[]>(dataLayers);
  const [selectedWard, setSelectedWard] = useState<string | null>(null);

  const landPrices = useApiData<LandPricePoint[]>("/api/land-prices", sampleLandPrices);
  const demographics = useApiData<DemographicsData[]>("/api/demographics", sampleDemographics);
  const disasterRisks = useApiData<DisasterRisk[]>("/api/disaster-risks", sampleDisasterRisks);
  const transport = useApiData<TransportStation[]>("/api/transport", sampleTransportStations);

  const toggleLayer = (id: string) => {
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, enabled: !l.enabled } : l)));
  };

  // Filtered data based on selectedWard
  const filteredLandPrices = useMemo(() => {
    if (!selectedWard) return landPrices.data;
    return landPrices.data.filter((p) => p.address.includes(selectedWard.replace("区", "")));
  }, [selectedWard, landPrices.data]);

  const filteredDemographics = useMemo(() => {
    if (!selectedWard) return demographics.data;
    return demographics.data.filter((d) => d.region === selectedWard);
  }, [selectedWard, demographics.data]);

  const filteredRisks = useMemo(() => {
    if (!selectedWard) return disasterRisks.data;
    return disasterRisks.data.filter((r) => r.region === selectedWard);
  }, [selectedWard, disasterRisks.data]);

  const filteredStations = useMemo(() => {
    if (!selectedWard) return transport.data;
    return transport.data.filter((s) => s.ward === selectedWard);
  }, [selectedWard, transport.data]);

  const filteredPriceSummary = useMemo(() => {
    if (!selectedWard) return sampleLandPriceSummary;
    return sampleLandPriceSummary.filter((p) => p.region === selectedWard);
  }, [selectedWard]);

  const filteredProfiles = useMemo(() => {
    if (!selectedWard) return sampleWardProfiles;
    const selected = sampleWardProfiles.find((p) => p.region === selectedWard);
    if (!selected) return sampleWardProfiles;
    // Show selected ward + average for comparison
    const avg = {
      region: "23区平均",
      population: Math.round(sampleWardProfiles.reduce((s, p) => s + p.population, 0) / sampleWardProfiles.length),
      landPrice: Math.round(sampleWardProfiles.reduce((s, p) => s + p.landPrice, 0) / sampleWardProfiles.length),
      accessibility: Math.round(sampleWardProfiles.reduce((s, p) => s + p.accessibility, 0) / sampleWardProfiles.length),
      safety: Math.round(sampleWardProfiles.reduce((s, p) => s + p.safety, 0) / sampleWardProfiles.length),
      greenRatio: Math.round(sampleWardProfiles.reduce((s, p) => s + p.greenRatio, 0) / sampleWardProfiles.length),
    };
    return [selected, avg];
  }, [selectedWard]);

  // Key metrics — responsive to ward selection
  const metricsData = selectedWard ? filteredDemographics : demographics.data;
  const metricsRisks = selectedWard ? filteredRisks : disasterRisks.data;
  const metricsStations = selectedWard ? filteredStations : transport.data;

  const topGrowth = [...metricsData].sort((a, b) => b.growthRate - a.growthRate)[0];
  const highRiskCount = metricsRisks.filter((r) => r.level >= 4).length;
  const totalPassengers = metricsStations.reduce((sum, s) => sum + s.dailyPassengers, 0);

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
            <WardSelector
              wards={demographics.data}
              selectedWard={selectedWard}
              onSelect={setSelectedWard}
            />
            <div className="h-6 w-px bg-border/50" />
            <LayerSelector layers={layers} onToggle={toggleLayer} />
          </div>
          <div className="flex items-center gap-2">
            <StatsBar
              landPriceCount={filteredLandPrices.length}
              demographicsCount={filteredDemographics.length}
              disasterRiskCount={filteredRisks.length}
              transportCount={filteredStations.length}
            />
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-12 gap-4 h-full">
          {/* Left column: Map + Key Metrics */}
          <div className="col-span-12 lg:col-span-5 flex flex-col gap-3">
            {/* Map */}
            <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-card/30" style={{ minHeight: "320px", flex: "1 1 320px" }}>
              <MapView landPrices={filteredLandPrices} selectedWard={selectedWard} />
              <div className="absolute top-3 left-3 z-10">
                <div className="glass rounded-lg px-2.5 py-1 text-[10px] font-medium text-muted-foreground flex items-center gap-1.5">
                  {selectedWard ?? "全エリア"}: {filteredLandPrices.length}地点
                  {!landPrices.isLive && !landPrices.isLoading && (
                    <span className="text-amber-400">sample</span>
                  )}
                </div>
              </div>
            </div>

            {/* 3 Key Metrics */}
            <div className="grid grid-cols-3 gap-2 animate-fade-in-up" style={{ animationDelay: "0.1s", opacity: 0 }}>
              <div className="key-metric">
                <TrendingUp className="h-4 w-4 text-emerald-400" />
                <span className="text-xl font-bold tabular-nums">
                  {topGrowth ? `${topGrowth.growthRate > 0 ? "+" : ""}${topGrowth.growthRate}%` : "—"}
                </span>
                <span className="text-[9px] text-muted-foreground text-center leading-tight">
                  {selectedWard ? "成長率" : "成長率1位"}
                  {!selectedWard && topGrowth && <><br />{topGrowth.region}</>}
                </span>
              </div>
              <div className="key-metric">
                <Shield className="h-4 w-4 text-amber-400" />
                <span className="text-xl font-bold tabular-nums">{highRiskCount}</span>
                <span className="text-[9px] text-muted-foreground text-center leading-tight">高リスク<br />{selectedWard ? "該当" : "地域"}</span>
              </div>
              <div className="key-metric">
                <Users className="h-4 w-4 text-blue-400" />
                <span className="text-xl font-bold tabular-nums">
                  {totalPassengers > 0 ? <>{(totalPassengers / 10000).toFixed(0)}<span className="text-sm font-normal">万</span></> : "—"}
                </span>
                <span className="text-[9px] text-muted-foreground text-center leading-tight">日間<br />乗降客</span>
              </div>
            </div>

            {/* Ward Radar */}
            <div className="shrink-0 animate-fade-in-up" style={{ animationDelay: "0.15s", opacity: 0 }}>
              <WardRadar
                profiles={filteredProfiles}
                selectedWard={selectedWard}
              />
            </div>
          </div>

          {/* Right column: 3 tabs */}
          <div className="col-span-12 lg:col-span-7 flex flex-col animate-fade-in-up" style={{ animationDelay: "0.05s", opacity: 0 }}>
            <Tabs defaultValue="population" className="flex flex-col h-full">
              <TabsList className="shrink-0 w-full bg-secondary/50 rounded-xl p-1">
                <TabsTrigger value="population" className="flex-1 cursor-pointer rounded-lg text-xs">
                  人口・地価
                </TabsTrigger>
                <TabsTrigger value="safety" className="flex-1 cursor-pointer rounded-lg text-xs">
                  災害・安全
                </TabsTrigger>
                <TabsTrigger value="transport" className="flex-1 cursor-pointer rounded-lg text-xs">
                  交通
                </TabsTrigger>
              </TabsList>

              <TabsContent value="population" className="mt-4 flex-1 overflow-y-auto">
                <div className="space-y-4">
                  <DemographicsChart
                    data={selectedWard ? filteredDemographics : demographics.data}
                    allData={demographics.data}
                    populationTrends={samplePopulationTrends}
                    selectedWard={selectedWard}
                  />
                  {!selectedWard && (
                    <WardTable
                      demographics={demographics.data}
                      landPrices={sampleLandPriceSummary}
                      onSelectWard={setSelectedWard}
                    />
                  )}
                  <LandPriceChart
                    prices={selectedWard ? filteredPriceSummary : sampleLandPriceSummary}
                    allPrices={sampleLandPriceSummary}
                    demographics={demographics.data}
                    selectedWard={selectedWard}
                  />
                </div>
              </TabsContent>

              <TabsContent value="safety" className="mt-4 flex-1 overflow-y-auto">
                <DisasterRiskPanel
                  risks={filteredRisks}
                  zoning={sampleZoning}
                  selectedWard={selectedWard}
                />
              </TabsContent>

              <TabsContent value="transport" className="mt-4 flex-1 overflow-y-auto">
                <TransportPanel
                  stations={filteredStations}
                  trends={sampleTransportTrends}
                  selectedWard={selectedWard}
                />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>
    </div>
  );
}
