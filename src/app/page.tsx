"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  DataCategory,
} from "@/types";
import MapLegend from "@/components/map/MapLegend";
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

// Map tab values to layer IDs for map choropleth
const TAB_TO_LAYER: Record<string, DataCategory> = {
  "land-price": "land-price",
  demographics: "demographics",
  disaster: "disaster-risk",
  transport: "transportation",
  zoning: "zoning",
};

export default function Home() {
  const [activeTab, setActiveTab] = useState("land-price");
  const [selectedWard, setSelectedWard] = useState<string | null>(null);

  const landPrices = useApiData<LandPricePoint[]>("/api/land-prices", sampleLandPrices);
  const demographics = useApiData<DemographicsData[]>("/api/demographics", sampleDemographics);
  const disasterRisks = useApiData<DisasterRisk[]>("/api/disaster-risks", sampleDisasterRisks);
  const transport = useApiData<TransportStation[]>("/api/transport", sampleTransportStations);

  // Build layers state from active tab — only the active tab's layer is enabled
  const layers: DataLayer[] = useMemo(() => {
    const activeLayerId = TAB_TO_LAYER[activeTab];
    return dataLayers.map((l) => ({ ...l, enabled: l.id === activeLayerId }));
  }, [activeTab]);

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

  // Key metrics
  const metricsDemo = selectedWard ? filteredDemographics : demographics.data;
  const metricsRisks = selectedWard ? filteredRisks : disasterRisks.data;
  const metricsStations = selectedWard ? filteredStations : transport.data;

  const topGrowth = [...metricsDemo].sort((a, b) => b.growthRate - a.growthRate)[0];
  const highRiskCount = metricsRisks.filter((r) => r.level >= 4).length;
  const totalPassengers = metricsStations.reduce((sum, s) => sum + s.dailyPassengers, 0);

  return (
    <div className="flex h-screen flex-col overflow-hidden" style={{ height: "100dvh" }}>
      {/* Header */}
      <header className="shrink-0 border-b border-border/50 bg-card/50 backdrop-blur-sm px-4 md:px-6 py-2 md:py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 md:gap-4 min-w-0">
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex h-7 w-7 md:h-8 md:w-8 items-center justify-center rounded-xl bg-primary/15">
                <Map className="h-3.5 w-3.5 md:h-4 md:w-4 text-primary" />
              </div>
              <h1 className="text-sm md:text-base font-bold tracking-tight leading-none">
                Urban<span className="text-primary">Oracle</span>
              </h1>
            </div>
            <div className="h-5 w-px bg-border/50 hidden sm:block" />
            <WardSelector
              wards={demographics.data}
              selectedWard={selectedWard}
              onSelect={setSelectedWard}
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden md:block">
              <StatsBar
                landPriceCount={landPrices.data.length}
                demographicsCount={demographics.data.length}
                disasterRiskCount={disasterRisks.data.length}
                transportCount={transport.data.length}
              />
            </div>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto p-3 md:p-4">
        <div className="grid grid-cols-12 gap-3 md:gap-4 h-full">
          {/* Left column: Map + Key Metrics */}
          <div className="col-span-12 lg:col-span-5 flex flex-col gap-3">
            {/* Map */}
            <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-card/30" style={{ minHeight: "240px", flex: "1 1 280px" }}>
              <MapView
                landPrices={filteredLandPrices}
                selectedWard={selectedWard}
                onSelectWard={setSelectedWard}
                layers={layers}
                stations={transport.data}
              />
              <div className="absolute top-3 left-3 z-10">
                <div className="glass rounded-lg px-2.5 py-1 text-[10px] font-medium text-muted-foreground flex items-center gap-1.5">
                  {selectedWard ?? "全エリア"}
                </div>
              </div>
              <MapLegend layers={layers} />
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
              <WardRadar profiles={filteredProfiles} selectedWard={selectedWard} />
            </div>
          </div>

          {/* Right column: 5 tabs — tab switch controls map choropleth */}
          <div className="col-span-12 lg:col-span-7 flex flex-col animate-fade-in-up" style={{ animationDelay: "0.05s", opacity: 0 }}>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
              <TabsList className="shrink-0 w-full bg-secondary/50 rounded-xl p-1">
                <TabsTrigger value="land-price" className="flex-1 cursor-pointer rounded-lg text-xs">
                  地価
                </TabsTrigger>
                <TabsTrigger value="demographics" className="flex-1 cursor-pointer rounded-lg text-xs">
                  人口
                </TabsTrigger>
                <TabsTrigger value="disaster" className="flex-1 cursor-pointer rounded-lg text-xs">
                  災害
                </TabsTrigger>
                <TabsTrigger value="transport" className="flex-1 cursor-pointer rounded-lg text-xs">
                  交通
                </TabsTrigger>
                <TabsTrigger value="zoning" className="flex-1 cursor-pointer rounded-lg text-xs">
                  用途地域
                </TabsTrigger>
              </TabsList>

              {/* Land Price */}
              <TabsContent value="land-price" className="mt-4 flex-1 overflow-y-auto">
                <div className="space-y-4">
                  <LandPriceChart
                    prices={selectedWard ? filteredPriceSummary : sampleLandPriceSummary}
                    allPrices={sampleLandPriceSummary}
                    demographics={demographics.data}
                    selectedWard={selectedWard}
                  />
                  {!selectedWard && (
                    <WardTable
                      demographics={demographics.data}
                      landPrices={sampleLandPriceSummary}
                      onSelectWard={setSelectedWard}
                    />
                  )}
                </div>
              </TabsContent>

              {/* Demographics */}
              <TabsContent value="demographics" className="mt-4 flex-1 overflow-y-auto">
                <DemographicsChart
                  data={selectedWard ? filteredDemographics : demographics.data}
                  allData={demographics.data}
                  populationTrends={samplePopulationTrends}
                  selectedWard={selectedWard}
                />
              </TabsContent>

              {/* Disaster */}
              <TabsContent value="disaster" className="mt-4 flex-1 overflow-y-auto">
                <DisasterRiskPanel
                  risks={selectedWard ? filteredRisks : disasterRisks.data}
                  zoning={sampleZoning}
                  selectedWard={selectedWard}
                />
              </TabsContent>

              {/* Transport */}
              <TabsContent value="transport" className="mt-4 flex-1 overflow-y-auto">
                <TransportPanel
                  stations={selectedWard ? filteredStations : transport.data}
                  trends={sampleTransportTrends}
                  selectedWard={selectedWard}
                />
              </TabsContent>

              {/* Zoning */}
              <TabsContent value="zoning" className="mt-4 flex-1 overflow-y-auto">
                <div className="space-y-4">
                  <div className="chart-section">
                    <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                      用途地域 面積構成
                    </h4>
                    <div className="flex h-5 rounded-full overflow-hidden">
                      {sampleZoning.map((z) => (
                        <div key={z.id} style={{ width: `${z.areaPct}%`, background: z.color }} title={`${z.label}: ${z.areaPct}%`} />
                      ))}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
                      {sampleZoning.map((z) => (
                        <div key={z.id} className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: z.color }} />
                          <span className="text-[11px] text-muted-foreground truncate flex-1">{z.label}</span>
                          <span className="text-[11px] tabular-nums text-foreground">{z.areaPct}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="chart-section">
                    <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                      容積率・建蔽率
                    </h4>
                    <div className="space-y-2">
                      {sampleZoning.map((z) => (
                        <div key={z.id} className="flex items-center gap-3">
                          <span className="w-16 text-[10px] text-muted-foreground truncate">{z.label.replace("第一種", "一種")}</span>
                          <div className="flex-1 flex items-center gap-2">
                            <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${(z.maxFloorAreaRatio / 800) * 100}%`, background: z.color }} />
                            </div>
                            <span className="text-[10px] tabular-nums w-10 text-right">{z.maxFloorAreaRatio}%</span>
                          </div>
                          <div className="flex-1 flex items-center gap-2">
                            <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                              <div className="h-full rounded-full opacity-60" style={{ width: `${z.maxBuildingCoverage}%`, background: z.color }} />
                            </div>
                            <span className="text-[10px] tabular-nums w-10 text-right">{z.maxBuildingCoverage}%</span>
                          </div>
                        </div>
                      ))}
                      <div className="flex items-center gap-3 text-[9px] text-muted-foreground mt-1">
                        <span className="w-16" />
                        <span className="flex-1 text-center">容積率</span>
                        <span className="flex-1 text-center">建蔽率</span>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>

      {/* Attribution footer */}
      <footer className="shrink-0 border-t border-border/50 px-6 py-2">
        <p className="text-[9px] text-muted-foreground text-center">
          出典: 国土数値情報（国土交通省）、e-Stat（総務省統計局）、不動産情報ライブラリ（国土交通省）、OpenStreetMap contributors、CARTO
        </p>
      </footer>
    </div>
  );
}
