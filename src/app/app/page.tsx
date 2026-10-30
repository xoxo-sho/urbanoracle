"use client";

import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  sampleLandPriceSummary,
  sampleDisasterRisks,
  samplePopulationTrends,
  sampleTransportTrends,
  sampleZoning,
  sampleWardProfiles,
} from "@/data/sample";
import type {
  DataLayer,
  DemographicsData,
  DisasterRisk,
  TransportStation,
  DataCategory,
} from "@/types";
import MapLegend from "@/components/map/MapLegend";
import { Map, TrendingUp, Users, Shield } from "lucide-react";
import SampleNote, { SampleTag } from "@/components/dashboard/SampleNote";
import { FAILED_TEXT, isPending, pendingText } from "@/components/dashboard/DataState";
import {
  BUNDLED_UNVERIFIED_NOTE,
  CHOROPLETH_NOTE,
  SAMPLE_NOTICE,
  SOURCES,
} from "@/lib/sources";
import {
  ESTAT_API_CREDIT,
  ESTAT_EDITED,
  ESTAT_SOURCE,
  GSI_PALE_PROCESSED,
  GSI_TILE_LIST_URL,
  GSI_TILES_NAME,
  WARD_BOUNDARY_CREDIT,
} from "@/lib/credits";
import { useGatedData } from "@/lib/use-gated-data";
import { TOKYO_WARD_NAMES } from "@/lib/wards";
import VerificationBanner from "@/components/auth/VerificationBanner";
import SignOutButton from "@/components/auth/SignOutButton";
import { NO_DATA, byValueDesc, hasValue } from "@/lib/format";

const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center rounded-sm bg-secondary/30 border border-border/50">
      <div className="flex flex-col items-center gap-3">
        <Map className="h-6 w-6 text-primary/60 animate-pulse" />
        <p className="text-xs text-muted-foreground">地図を読み込み中...</p>
      </div>
    </div>
  ),
});

// Map tab values to layer IDs for map choropleth
const TAB_TO_LAYER: Record<string, DataCategory> = {
  "land-price": "land-price",
  demographics: "demographics",
  disaster: "disaster-risk",
  transport: "transportation",
  zoning: "zoning",
};

const RIDERSHIP_FIELD = "dailyPassengers";
const GROWTH_FIELD = "growthRate";

export default function Home() {
  const [activeTab, setActiveTab] = useState("land-price");
  const [selectedWard, setSelectedWard] = useState<string | null>(null);

  // The two live endpoints have no fallback: while loading or failed their
  // surfaces say so (real-data plan PR 1). /disaster-risks has no upstream yet
  // (PR 7): the server serves the curated sample set and the surface keeps
  // its SAMPLE label, so until PR 7 the same set stands in while that one
  // request is loading or failed.
  const demographics = useGatedData<DemographicsData[]>("/api/v1/demographics");
  const disasterRisks = useGatedData<DisasterRisk[]>("/api/v1/disaster-risks");
  const transport = useGatedData<TransportStation[]>("/api/v1/transport");

  const demographicsRows = useMemo(() => demographics.data ?? [], [demographics.data]);
  const risks = useMemo(() => disasterRisks.data ?? sampleDisasterRisks, [disasterRisks.data]);
  const stations = useMemo(() => transport.data ?? [], [transport.data]);
  // ODPT did not answer: the stations are real, their ridership is 取得失敗.
  const ridershipUnavailable = transport.unavailable.includes(RIDERSHIP_FIELD);
  // The e-Stat growth table did not answer: population, density and age are
  // live, every growth figure is 取得失敗.
  const growthUnavailable = demographics.unavailable.includes(GROWTH_FIELD);

  // Build layers state from active tab — only the active tab's layer is enabled
  const layers: DataLayer[] = useMemo(() => {
    const activeLayerId = TAB_TO_LAYER[activeTab];
    return dataLayers.map((l) => ({ ...l, enabled: l.id === activeLayerId }));
  }, [activeTab]);

  // Filtered data based on selectedWard
  const filteredDemographics = useMemo(() => {
    if (!selectedWard) return demographicsRows;
    return demographicsRows.filter((d) => d.region === selectedWard);
  }, [selectedWard, demographicsRows]);

  const filteredRisks = useMemo(() => {
    if (!selectedWard) return risks;
    return risks.filter((r) => r.region === selectedWard);
  }, [selectedWard, risks]);

  const filteredStations = useMemo(() => {
    if (!selectedWard) return stations;
    return stations.filter((s) => s.ward === selectedWard);
  }, [selectedWard, stations]);

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
  const metricsDemo = selectedWard ? filteredDemographics : demographicsRows;
  const metricsRisks = selectedWard ? filteredRisks : risks;
  const metricsStations = selectedWard ? filteredStations : stations;

  // Only wards with a published growth rate can rank; a null must not sort
  // as if it were 0, which would beat every genuinely negative ward.
  const topGrowth = [...metricsDemo]
    .filter((d) => hasValue(d.growthRate))
    .sort((a, b) => byValueDesc(a.growthRate, b.growthRate))[0];
  const highRiskCount = metricsRisks.filter((r) => r.level >= 4).length;
  // Sum only the stations ODPT actually covers. Treating null as 0 would
  // report a total that silently excludes JR without saying so.
  const passengerValues = metricsStations.map((s) => s.dailyPassengers).filter(hasValue);
  const totalPassengers = passengerValues.reduce((sum, v) => sum + v, 0);
  const passengersKnown = passengerValues.length > 0;

  // Each tile shows exactly one of: 読み込み中, 取得失敗, the figure, or
  // データなし when the answer arrived but holds no figure for this selection.
  const growthTile = isPending(demographics.status)
    ? pendingText(demographics.status)
    : growthUnavailable
      ? FAILED_TEXT
      : topGrowth && hasValue(topGrowth.growthRate)
        ? `${topGrowth.growthRate > 0 ? "+" : ""}${topGrowth.growthRate.toFixed(1)}%`
        : NO_DATA;
  const passengersTile = isPending(transport.status)
    ? pendingText(transport.status)
    : ridershipUnavailable
      ? FAILED_TEXT
      : passengersKnown
        ? <>{(totalPassengers / 10000).toFixed(0)}<span className="text-sm font-normal">万</span></>
        : NO_DATA;

  return (
    <div className="flex h-screen flex-col overflow-hidden" style={{ height: "100dvh" }}>
      {/* Header */}
      <VerificationBanner />
      <header className="shrink-0 border-b border-border/50 bg-card px-4 md:px-6 py-2 md:py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 md:gap-4 min-w-0">
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex h-7 w-7 md:h-8 md:w-8 items-center justify-center rounded-sm bg-primary/15">
                <Map className="h-3.5 w-3.5 md:h-4 md:w-4 text-primary" />
              </div>
              <h1 className="text-sm md:text-base font-bold tracking-tight leading-none">
                Urban<span className="text-primary">Oracle</span>
              </h1>
            </div>
            <div className="h-5 w-px bg-border/50 hidden sm:block" />
            <WardSelector
              wards={TOKYO_WARD_NAMES}
              selectedWard={selectedWard}
              onSelect={setSelectedWard}
            />
          </div>
          <div className="flex shrink-0 items-center gap-2 md:gap-3">
            <SignOutButton />
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto p-3 md:p-4">
        <div className="grid grid-cols-12 gap-3 md:gap-4 min-h-full">
          {/* Left column: Map + Key Metrics */}
          <div className="col-span-12 lg:col-span-5 flex flex-col gap-3">
            {/* Map */}
            <div className="relative overflow-hidden rounded-sm border border-border/50 bg-card/30" style={{ minHeight: "240px", flex: "1 1 280px" }}>
              <MapView
                selectedWard={selectedWard}
                onSelectWard={setSelectedWard}
                layers={layers}
                stations={stations}
                transportIsLive={transport.status === "ok"}
              />
              <div className="absolute top-3 left-3 z-10">
                <div className="map-overlay rounded-sm px-2.5 py-1 text-[10px] font-medium text-muted-foreground flex items-center gap-1.5">
                  {selectedWard ?? "全エリア"}
                </div>
              </div>
              <MapLegend
                layers={layers}
                transportStatus={transport.status}
                ridershipUnavailable={ridershipUnavailable}
              />
            </div>

            {/* 3 Key Metrics */}
            <div className="grid grid-cols-3 gap-2 animate-fade-in-up" style={{ animationDelay: "0.1s", opacity: 0 }}>
              <div className="key-metric">
                <TrendingUp className="h-4 w-4 text-up-text" />
                <span className="text-xl font-bold tabular-nums">{growthTile}</span>
                <span className="text-[9px] text-muted-foreground text-center leading-tight">
                  {selectedWard ? "成長率" : "成長率1位"}
                  {!selectedWard && topGrowth && <><br />{topGrowth.region}</>}
                </span>
              </div>
              <div className="key-metric">
                <Shield className="h-4 w-4 text-down-text" />
                <span className="text-xl font-bold tabular-nums">{highRiskCount}</span>
                <span className="text-[9px] text-muted-foreground text-center leading-tight">高リスク<br />{selectedWard ? "該当" : "地域"}</span>
                {!disasterRisks.isLive && <SampleTag />}
              </div>
              <div className="key-metric">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-xl font-bold tabular-nums">{passengersTile}</span>
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
              <TabsList className="shrink-0 w-full bg-secondary/50 rounded-sm p-1">
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
                    demographics={demographicsRows}
                    selectedWard={selectedWard}
                  />
                  {!selectedWard && (
                    <WardTable
                      demographics={demographicsRows}
                      landPrices={sampleLandPriceSummary}
                      onSelectWard={setSelectedWard}
                      status={demographics.status}
                      unavailable={demographics.unavailable}
                    />
                  )}
                </div>
              </TabsContent>

              {/* Demographics */}
              <TabsContent value="demographics" className="mt-4 flex-1 overflow-y-auto">
                <DemographicsChart
                  data={selectedWard ? filteredDemographics : demographicsRows}
                  allData={demographicsRows}
                  populationTrends={samplePopulationTrends}
                  selectedWard={selectedWard}
                  status={demographics.status}
                  unavailable={demographics.unavailable}
                />
              </TabsContent>

              {/* Disaster */}
              <TabsContent value="disaster" className="mt-4 flex-1 overflow-y-auto">
                <DisasterRiskPanel
                  risks={selectedWard ? filteredRisks : risks}
                  zoning={sampleZoning}
                  selectedWard={selectedWard}
                />
              </TabsContent>

              {/* Transport */}
              <TabsContent value="transport" className="mt-4 flex-1 overflow-y-auto">
                <TransportPanel
                  stations={selectedWard ? filteredStations : stations}
                  trends={sampleTransportTrends}
                  selectedWard={selectedWard}
                  status={transport.status}
                  unavailable={transport.unavailable}
                  fetchedAt={transport.fetchedAt}
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
                    <SampleNote note="単位: 面積 %" />
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
                    <SampleNote note="単位: %" />
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* データ出典 / Data sources — per-surface truth, two groups (design-spec-v1 §9),
            plus the credits the providers prescribe (RECON 2026-10-data-terms §7.1).
            The two live surfaces are listed under 実データ when their endpoint
            answered in full; while loading, failed or partial they are listed in
            neither group — nothing is on screen to attribute, and the surface
            itself says 読み込み中 / 取得失敗. In the scrolling content, at a
            legible size, never collapsed. */}
        <footer className="mt-4 border-t border-border/50 pt-3 pb-2 text-[11px] leading-relaxed text-muted-foreground">
          <h2 className="mb-2 text-[11px] font-semibold tracking-widest text-foreground">データ出典 / Data sources</h2>
          <div className="grid gap-x-8 gap-y-2 md:grid-cols-2">
            <div data-provenance="live">
              <span className="font-medium text-foreground">実データ</span>
              <ul className="space-y-1">
                {demographics.data !== null && (
                  <li>
                    {growthUnavailable
                      ? `人口・密度・年齢構成（人口タブ・区別テーブル）: ${ESTAT_SOURCE} 2020年国勢調査`
                      : `人口・密度・増減・年齢構成（人口タブ・区別テーブル・成長率指標）: ${ESTAT_SOURCE} 2020年国勢調査・2025年速報`}
                    {" ／ "}{ESTAT_EDITED}
                  </li>
                )}
                <li data-credit="estat-api">{ESTAT_API_CREDIT}</li>
                {transport.status === "ok" && (
                  <li>
                    駅別乗降客数（交通タブ・乗降客指標・地図の駅バブル）: {SOURCES.odpt.label} — 取得日時・注意事項・お問い合わせ先・東京都交通局データのクレジットは交通タブに表示
                  </li>
                )}
                <li>地図のハザード重ね（浸水・津波・土砂）: {SOURCES.hazard.label} タイル</li>
                <li>{WARD_BOUNDARY_CREDIT}</li>
                <li>
                  地図タイル: <a href={GSI_TILE_LIST_URL} target="_blank" rel="noopener noreferrer" className="underline">{GSI_TILES_NAME}</a>（淡色地図）
                  ／ ダーク表示: {GSI_PALE_PROCESSED}
                </li>
              </ul>
            </div>
            <div data-provenance="sample" className="sample-block">
              <span className="font-semibold">{SAMPLE_NOTICE}</span>
              <ul>
                <li>区別平均地価・密度 vs 地価・区別テーブルの地価列</li>
                <li>人口推移</li>
                <li>災害種別・リスク一覧・高リスク指標</li>
                <li>用途地域</li>
                <li>乗降客数推移</li>
                <li>区別総合比較</li>
                <li>地図の塗り分け: {CHOROPLETH_NOTE}</li>
              </ul>
            </div>
          </div>
          <p className="mt-1">駅の位置・路線: {BUNDLED_UNVERIFIED_NOTE}</p>
        </footer>
      </main>

    </div>
  );
}
