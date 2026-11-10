"use client";

import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import WardSelector from "@/components/dashboard/WardSelector";
import LandPriceChart from "@/components/dashboard/LandPriceChart";
import DemographicsChart from "@/components/dashboard/DemographicsChart";
import DisasterRiskPanel from "@/components/dashboard/DisasterRiskPanel";
import TransportPanel from "@/components/dashboard/TransportPanel";
import WardComparison from "@/components/dashboard/WardComparison";
import WardTable from "@/components/dashboard/WardTable";
import ThemeToggle from "@/components/dashboard/ThemeToggle";
import LandUseSwitch from "@/components/dashboard/LandUseSwitch";
import ZoningPanel from "@/components/dashboard/ZoningPanel";
import { dataLayers } from "@/lib/layers";
import type {
  DataLayer,
  DemographicsData,
  DisasterWard,
  GreenWard,
  LandPriceTotal,
  LandPriceWard,
  PopulationTrend,
  TransportStation,
  TransportTotal,
  DataCategory,
  ZoningComposition,
} from "@/types";
import MapLegend from "@/components/map/MapLegend";
import { Map, TrendingUp, Users, Shield } from "lucide-react";
import { FAILED_TEXT, isPending, pendingText } from "@/components/dashboard/DataState";
import {
  ESTAT_API_CREDIT,
  ESTAT_EDITED,
  ESTAT_SOURCE,
  ESTAT_TREND_EDITED,
  GSI_PALE_PROCESSED,
  GSI_TILE_LIST_URL,
  GSI_TILES_NAME,
  HAZARD_PORTAL_SOURCE,
  HAZARD_PORTAL_URL,
  KIKENDO_CREDIT,
  KIKENDO_EDITED,
  KSJ_A31_EDITED,
  KSJ_A33_EDITED,
  KSJ_A40_EDITED,
  KSJ_A55_EDITED,
  KSJ_L01_EDITED,
  KSJ_N03_EDITED,
  KSJ_S12_EDITED,
  KSJ_SOURCE,
  LAND_PRICE_CHANGE_NOTE,
  LAND_PRICE_MEAN_NOTE,
  LAND_PRICE_USES_NOTE,
  MENCHO_EDITED,
  MENCHO_REMARKS,
  MENCHO_SOURCE,
  RIDERSHIP_DEFINITION_NOTE,
  RIDERSHIP_JR_NOTE,
  RIDERSHIP_NOTICE_LEAD,
  RIDERSHIP_NOTICE_MARKER,
  RIDERSHIP_TREND_UNIT_NOTE,
  TAKASHIO_CREDIT,
  TAKASHIO_EDITED,
  TOCHI_CREDIT,
  TOCHI_EDITED,
  TOEI_EDITED,
  WARD_BOUNDARY_CREDIT,
  ZONING_ASOF_NOTE,
  ZONING_DESIGNATED_NOTE,
  ZONING_FAR_NOTE,
  ZONING_SHARE_NOTE,
} from "@/lib/credits";
import {
  censusLine,
  landPriceLine,
  ridershipSource,
  ridershipTrendLine,
  tileSourceLine,
  transportLine,
  transportTileLine,
  trendLine,
  zoningLine,
} from "@/lib/census-sources";
import { landPriceStops, type LandUse } from "@/lib/land-price";
import { K2_LABEL, countOf, disasterView, quakeShortLine, rank5Stops } from "@/lib/disaster";
import { HAZARD_RASTER_NAMES } from "@/components/map/hazard-rasters";
import { buildMeasures } from "@/lib/comparison";
import { densityStops } from "@/lib/census-map";
import { useGatedData } from "@/lib/use-gated-data";
import { A55Notices, OperatorFiguresNotice, S12Notice } from "@/components/dashboard/RequiredCredits";
import { trendView, trendYearsLabel } from "@/lib/ridership-trend";
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
  // One switch for every 地価 surface (real-data plan PR 5): 住宅地 by default.
  const [landUse, setLandUse] = useState<LandUse>("residential");

  // No endpoint has a fallback: while loading or failed their surfaces say so
  // (real-data plan PR 1). The 災害 snapshot (PR 7) is one record per ward —
  // each hazard in its source's own classes — and the 23区 record as `total`;
  // the payload names, per hazard, the survey or edition and its 時点.
  const demographics = useGatedData<DemographicsData[]>("/api/v1/demographics");
  const disasterRisks = useGatedData<DisasterWard[], DisasterWard>("/api/v1/disaster-risks");
  const transport = useGatedData<TransportStation[], TransportTotal>("/api/v1/transport");
  // The 人口推移 snapshot (real-data plan PR 3): its own route, so a census-table
  // failure on /demographics never takes the chart down. Same hook, same states.
  const populationTrends = useGatedData<PopulationTrend[]>("/api/v1/population-trends");
  const trendSources = populationTrends.sources ?? {};
  const trendSource = trendLine(trendSources);
  // The 地価公示 snapshot (real-data plan PR 5): one record per ward with the
  // 住宅地 / 商業地 figures and their counts; the payload names the edition and
  // year every 地価 surface prints.
  // `total` (PR 8): the 23区 figures over every point, for 「23区の中での位置」.
  const landPrices = useGatedData<LandPriceWard[], LandPriceTotal>("/api/v1/land-prices");
  const landPriceRows = useMemo(() => landPrices.data ?? [], [landPrices.data]);
  const landPriceSources = landPrices.sources ?? {};
  const landPriceProvenance = landPriceLine(landPriceSources);
  // The choropleth's stops for the chosen use, from the data; the legend prints the same array.
  const landStops = useMemo(() => landPriceStops(landPriceRows, landUse), [landPriceRows, landUse]);
  // The 用途地域 snapshot (real-data plan PR 6): one composition per ward and the
  // 23区 composition as `total`; the view follows the selected ward. The payload
  // names the edition and tables, and each composition's 時点 sentence is the
  // payload's own (the data list's, or 記載なし).
  const zoning = useGatedData<ZoningComposition[], ZoningComposition>("/api/v1/zoning");
  const zoningRows = useMemo(() => zoning.data ?? [], [zoning.data]);
  const zoningSources = zoning.sources ?? {};
  const zoningProvenance = zoningLine(zoningSources);
  const zoningView = useMemo(
    () => (selectedWard ? (zoningRows.find((r) => r.region === selectedWard) ?? null) : zoning.total),
    [selectedWard, zoningRows, zoning.total]
  );

  const demographicsRows = useMemo(() => demographics.data ?? [], [demographics.data]);
  const disasterRows = useMemo(() => disasterRisks.data ?? [], [disasterRisks.data]);
  const disasterSources = disasterRisks.sources ?? {};
  const disasterInView = useMemo(
    () => disasterView(disasterRows, disasterRisks.total, selectedWard),
    [disasterRows, disasterRisks.total, selectedWard]
  );
  // The 災害 choropleth's stops (real-data plan PR 7): from the wards' share of
  // 町丁目 at 総合危険度 rank 5; the legend prints the same array.
  const disasterStops = useMemo(() => rank5Stops(disasterRows), [disasterRows]);
  const stations = useMemo(() => transport.data ?? [], [transport.data]);
  // The 駅別乗降客数 snapshot (real-data plan PR 4): the payload names, per
  // field, the 国土数値情報 edition and its year; every station note and the
  // K3 line read it. A payload that names none gets no year claimed for it.
  const transportSources = transport.sources ?? {};
  const transportSource = ridershipSource(transportSources);
  const transportProvenance = transportLine(transportSources);
  // 乗降客数推移 (real-data plan PR 4b): the panel series the answer carries
  // beside `data`, for the selected ward or for 東京23区.
  const ridershipTrend = transport.total?.trend ?? null;
  // 東京都交通局's own figures beside S12's (follow-up 3): the notice sentences
  // and the credit the answer carries beside `data`; shown, never summed.
  const operatorFigures = transport.total?.operatorFigures ?? null;
  const ridershipTrendView = transport.status === "ok" ? trendView(ridershipTrend, selectedWard) : null;
  // The e-Stat growth table did not answer: population, density and age are
  // live, every growth figure is 取得失敗.
  const growthUnavailable = demographics.unavailable.includes(GROWTH_FIELD);
  // Per census field, the year and e-Stat table the server says the figures
  // came from (real-data plan PR 2). Every census note on this page is built
  // from it; a payload that names none gets no year claimed for it.
  const censusSources = demographics.sources ?? {};
  const growthSource = growthUnavailable ? undefined : censusSources[GROWTH_FIELD];

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


  const filteredStations = useMemo(() => {
    if (!selectedWard) return stations;
    return stations.filter((s) => s.ward === selectedWard);
  }, [selectedWard, stations]);

  // The 人口 choropleth (real-data plan PR 8): the census densities, stops from
  // the data; the legend prints the same array.
  const censusStops = useMemo(() => densityStops(demographicsRows), [demographicsRows]);

  // 公園等・農用地・森林・原野 (real-data plan PR 8, decision 6): the 都市整備局
  // 土地利用現況調査 令和3年 snapshot, one record per ward and the 23区 as `total`.
  const green = useGatedData<GreenWard[], GreenWard>("/api/v1/green-land-use");

  // 「23区の中での位置」 (decision 7): seven rows, each from its own endpoint
  // and in that endpoint's state.
  // Small (23 wards × 7 rows), so computed each render; the React Compiler memoizes it.
  const measures = buildMeasures({
    census: { status: demographics.status, rows: demographicsRows, unavailable: demographics.unavailable, sources: censusSources },
    land: { status: landPrices.status, rows: landPriceRows, total: landPrices.total, sources: landPriceSources },
    transport: { status: transport.status, stations, sources: transportSources },
    disaster: { status: disasterRisks.status, rows: disasterRows, total: disasterRisks.total, sources: disasterSources },
    green: { status: green.status, rows: green.data ?? [], total: green.total, sources: green.sources ?? {} },
  });

  // Key metrics
  const metricsDemo = selectedWard ? filteredDemographics : demographicsRows;
  const metricsStations = selectedWard ? filteredStations : stations;

  // Only wards with a published growth rate can rank; a null must not sort
  // as if it were 0, which would beat every genuinely negative ward.
  const topGrowth = [...metricsDemo]
    .filter((d) => hasValue(d.growthRate))
    .sort((a, b) => byValueDesc(a.growthRate, b.growthRate))[0];
  // K2 (Architect decision 8): the count of 町丁目 at 総合危険度 rank 5 with its
  // denominator — the survey's own class, no threshold of ours.
  const k2Tile = isPending(disasterRisks.status)
    ? pendingText(disasterRisks.status)
    : disasterInView
      ? countOf(disasterInView.earthquake.rank5, disasterInView.earthquake.n)
      : NO_DATA;
  const k2Source = quakeShortLine(disasterSources);
  // Sum the stations that carry a figure (each is its operators' sum, so the
  // tile equals the 事業者別 total). Treating null as 0 would claim a station
  // the source counts elsewhere carries nobody.
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
                transportStatus={transport.status}
                landPrices={landPriceRows}
                landUse={landUse}
                landPriceStops={landStops}
                landPriceStatus={landPrices.status}
                disaster={disasterRows}
                disasterStatus={disasterRisks.status}
                disasterStops={disasterStops}
                census={demographicsRows}
                censusStatus={demographics.status}
                censusSources={censusSources}
                censusStops={censusStops}
              />
              <div className="absolute top-3 left-3 z-10">
                <div className="map-overlay rounded-sm px-2.5 py-1 text-[10px] font-medium text-muted-foreground flex items-center gap-1.5">
                  {selectedWard ?? "全エリア"}
                </div>
              </div>
              <MapLegend
                layers={layers}
                transportStatus={transport.status}
                transportSources={transportSources}
                landPriceStatus={landPrices.status}
                landPriceSources={landPriceSources}
                landUse={landUse}
                landPriceStops={landStops}
                disasterStatus={disasterRisks.status}
                disasterSources={disasterSources}
                disasterStops={disasterStops}
                censusStatus={demographics.status}
                censusSources={censusSources}
                densityStops={censusStops}
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
                {/* K1's own source line: the table the figure came from, as the payload
                    says — in the dashboard's provenance size (.source-note, 11px), never a
                    smaller ad-hoc one: the 9px caption above it is already logged as unreadable. */}
                {growthSource && !isPending(demographics.status) && (
                  <span data-source={GROWTH_FIELD} title={growthSource.label} className="source-note text-center">
                    {tileSourceLine(growthSource)}
                  </span>
                )}
              </div>
              <div className="key-metric" data-surface="disaster-k2">
                <Shield className="h-4 w-4 text-down-text" />
                <span className="text-xl font-bold tabular-nums">{k2Tile}</span>
                <span className="text-[9px] text-muted-foreground text-center leading-tight">{K2_LABEL}</span>
                {/* K2's own source line (real-data plan PR 7): the survey and its year
                    as the payload names them, in the dashboard's provenance size. */}
                {k2Source && !isPending(disasterRisks.status) && (
                  <span data-source="earthquake" title={disasterSources.earthquake?.label} className="source-note text-center">
                    {k2Source}
                  </span>
                )}
              </div>
              <div className="key-metric">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-xl font-bold tabular-nums">{passengersTile}</span>
                <span className="text-[9px] text-muted-foreground text-center leading-tight">日間<br />乗降客</span>
                {/* K3's own source line (real-data plan PR 4): the year and table the
                    payload names, and what the figure is — each operator's count summed,
                    JR東日本's being 乗車人員 doubled — in the dashboard's provenance size. */}
                {transportSource && !isPending(transport.status) && (
                  <span data-source={RIDERSHIP_FIELD} title={transportSource.label} className="source-note text-center">
                    {transportTileLine(transportSource)}
                    <span className="block">{RIDERSHIP_DEFINITION_NOTE}</span>
                    <span className="block">{RIDERSHIP_JR_NOTE}</span>
                    {/* S12's own notice is the full-width line under the three tiles;
                        the tile only points to it (real-data plan PR 4b). */}
                    <span className="block" data-notice-marker="s12">{RIDERSHIP_NOTICE_MARKER}</span>
                  </span>
                )}
              </div>
            </div>

            {/* S12's own notice on what the operators' figures are, once and whole,
                directly under the three tiles: inside the 日間乗降客 tile it made
                that tile tall and stretched the other two. Shown with the figure,
                never while 読み込み中 or 取得失敗. */}
            {transportSource && !isPending(transport.status) && (
              <div className="shrink-0" data-surface="ridership-notice">
                <S12Notice lead={RIDERSHIP_NOTICE_LEAD} className="source-note" />
                <OperatorFiguresNotice sentences={operatorFigures?.notice} className="source-note" />
              </div>
            )}

            {/* 23区の中での位置 (real-data plan PR 8): in place of the radar */}
            <div className="shrink-0 animate-fade-in-up" style={{ animationDelay: "0.15s", opacity: 0 }}>
              <WardComparison measures={measures} selectedWard={selectedWard} />
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
                  <div className="flex items-center justify-end">
                    <LandUseSwitch value={landUse} onChange={setLandUse} />
                  </div>
                  <LandPriceChart
                    wards={landPriceRows}
                    status={landPrices.status}
                    sources={landPriceSources}
                    landUse={landUse}
                    demographics={demographicsRows}
                    demographicsStatus={demographics.status}
                    demographicsSources={censusSources}
                    selectedWard={selectedWard}
                  />
                  {!selectedWard && (
                    <WardTable
                      demographics={demographicsRows}
                      landPrices={landPriceRows}
                      landUse={landUse}
                      landPriceStatus={landPrices.status}
                      landPriceSources={landPriceSources}
                      onSelectWard={setSelectedWard}
                      status={demographics.status}
                      unavailable={demographics.unavailable}
                      sources={censusSources}
                    />
                  )}
                </div>
              </TabsContent>

              {/* Demographics */}
              <TabsContent value="demographics" className="mt-4 flex-1 overflow-y-auto">
                <DemographicsChart
                  data={selectedWard ? filteredDemographics : demographicsRows}
                  allData={demographicsRows}
                  selectedWard={selectedWard}
                  status={demographics.status}
                  unavailable={demographics.unavailable}
                  sources={censusSources}
                  trends={populationTrends.data}
                  trendStatus={populationTrends.status}
                  trendSources={trendSources}
                />
              </TabsContent>

              {/* Disaster */}
              <TabsContent value="disaster" className="mt-4 flex-1 overflow-y-auto">
                <DisasterRiskPanel
                  disaster={disasterInView}
                  disasterStatus={disasterRisks.status}
                  disasterSources={disasterSources}
                  zoning={zoningView}
                  zoningStatus={zoning.status}
                  zoningSources={zoningSources}
                  selectedWard={selectedWard}
                />
              </TabsContent>

              {/* Transport */}
              <TabsContent value="transport" className="mt-4 flex-1 overflow-y-auto">
                <TransportPanel
                  stations={selectedWard ? filteredStations : stations}
                  trend={ridershipTrend}
                  selectedWard={selectedWard}
                  status={transport.status}
                  sources={transportSources}
                  operatorFigures={operatorFigures}
                />
              </TabsContent>

              {/* Zoning (real-data plan PR 6): the committed A55-24 snapshot, following the selected ward */}
              <TabsContent value="zoning" className="mt-4 flex-1 overflow-y-auto">
                <ZoningPanel composition={zoningView} status={zoning.status} sources={zoningSources} selectedWard={selectedWard} />
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* データ出典 / Data sources — per-surface truth (design-spec-v1 §9), plus
            the credits the providers prescribe (RECON 2026-10-data-terms §7.1).
            One group, 実データ: every surface reads a measured source (real-data
            plan PR 9 deleted the sample group). A surface is listed once its
            endpoint has answered; while loading or failed it is not listed —
            nothing is on screen to attribute, and the surface itself says
            読み込み中 / 取得失敗. In the scrolling content, at a legible size,
            never collapsed. */}
        <footer className="mt-4 border-t border-border/50 pt-3 pb-2 text-[11px] leading-relaxed text-muted-foreground">
          <h2 className="mb-2 text-[11px] font-semibold tracking-widest text-foreground">データ出典 / Data sources</h2>
          <div className="grid gap-y-2">
            <div data-provenance="live">
              <span className="font-medium text-foreground">実データ</span>
              <ul className="space-y-1">
                {demographics.data !== null && (
                  <li data-source="census">
                    {growthUnavailable
                      ? "人口・密度・年齢構成（人口タブ・区別テーブル）"
                      : "人口・密度・増減・年齢構成（人口タブ・区別テーブル・成長率指標）"}
                    : {ESTAT_SOURCE}
                    {censusLine(censusSources) ? ` ／ ${censusLine(censusSources)}` : ""}
                    {" ／ "}{ESTAT_EDITED}
                    <span className="block">
                      密度の分母（区の面積）: {MENCHO_SOURCE} ／ {MENCHO_EDITED} ／ {MENCHO_REMARKS}
                    </span>
                  </li>
                )}
                {populationTrends.data !== null && (
                  <li data-source="population-trend">
                    人口推移（人口タブ）: {ESTAT_SOURCE}
                    {trendSource ? ` ／ ${trendSource}` : ""}
                    {" ／ "}{ESTAT_TREND_EDITED}
                  </li>
                )}
                <li data-credit="estat-api">{ESTAT_API_CREDIT}</li>
                {landPrices.data !== null && (
                  <li data-source="land-prices">
                    地価公示 平均価格・変動率（地価タブ・区別テーブルの地価列・地図の塗り分け）: {KSJ_SOURCE}
                    {landPriceProvenance ? ` ／ ${landPriceProvenance}` : ""}
                    {" ／ "}{KSJ_L01_EDITED}
                    <span className="block">{LAND_PRICE_MEAN_NOTE} ／ {LAND_PRICE_CHANGE_NOTE} ／ {LAND_PRICE_USES_NOTE}</span>
                  </li>
                )}
                {zoning.data !== null && (
                  <li data-source="zoning">
                    用途地域 面積構成・容積率・建蔽率（用途地域タブ・災害タブ）: {KSJ_SOURCE}
                    {zoningProvenance ? ` ／ ${zoningProvenance}` : ""}
                    {" ／ "}{KSJ_A55_EDITED}
                    {" ／ "}{KSJ_N03_EDITED}
                    <span className="block">{ZONING_SHARE_NOTE} ／ {ZONING_DESIGNATED_NOTE} ／ {ZONING_FAR_NOTE} ／ {ZONING_ASOF_NOTE}</span>
                    <A55Notices className="mt-1" />
                  </li>
                )}
                {transport.status === "ok" && (
                  <li data-source="stations">
                    駅別乗降客数・駅の位置（交通タブ・乗降客指標・地図の駅バブル）: {KSJ_SOURCE}
                    {transportProvenance ? ` ／ ${transportProvenance}` : ""}
                    {" ／ "}{KSJ_S12_EDITED}
                    {" ／ "}{KSJ_N03_EDITED}
                    <span className="block">{RIDERSHIP_DEFINITION_NOTE} ／ {RIDERSHIP_JR_NOTE}</span>
                    <S12Notice inline withAddress />
                    <OperatorFiguresNotice inline sentences={operatorFigures?.notice} />
                  </li>
                )}
                {transport.status === "ok" && operatorFigures && (
                  <li data-source="operator-figures">
                    都営地下鉄・日暮里・舎人ライナーの駅別乗降人員（交通タブの駅一覧に併記・合計には不使用）:
                    {transportSources.operatorFigures ? ` ${transportSources.operatorFigures.label}` : ""}
                    <span className="block">{TOEI_EDITED}</span>
                  </li>
                )}
                {ridershipTrendView && (
                  <li data-source="ridership-trend">
                    乗降客数推移（交通タブ）: {KSJ_SOURCE}
                    {" ／ "}{ridershipTrendLine(transportSources, trendYearsLabel(ridershipTrendView.series.map((p) => p.year)))}
                    {" ／ "}{KSJ_S12_EDITED}
                    {" ／ "}{KSJ_N03_EDITED}
                    <span className="block">{RIDERSHIP_TREND_UNIT_NOTE}</span>
                    {(ridershipTrend?.gaps ?? []).map((gap) => (
                      <span key={gap.year} className="block">{gap.text}</span>
                    ))}
                  </li>
                )}
                {disasterRisks.data !== null && (
                  <li data-source="disaster">
                    地震（災害タブ・ランク5の町丁目指標・地図の塗り分け）: {KIKENDO_CREDIT}
                    <span className="block">{KIKENDO_EDITED}</span>
                    <span className="block">
                      洪水・土砂災害・津波（災害タブ）: {KSJ_SOURCE} ／ {KSJ_A31_EDITED} ／ {KSJ_A33_EDITED} ／ {KSJ_A40_EDITED} ／ {KSJ_N03_EDITED}
                    </span>
                    <span className="block" data-credit="takashio">
                      高潮（災害タブ）: {TAKASHIO_CREDIT}
                      {disasterSources.hightide ? `（${disasterSources.hightide.table}）` : ""}
                      <span className="block">{TAKASHIO_EDITED}</span>
                      <span className="block">区の面積（割合の分母）: {KSJ_N03_EDITED}</span>
                    </span>
                  </li>
                )}
                {green.data !== null && (
                  <li data-source="green-land-use">
                    公園等・農用地・森林・原野の面積割合（23区の中での位置）: {TOCHI_CREDIT}
                    <span className="block">{TOCHI_EDITED}</span>
                  </li>
                )}
                <li data-source="hazard-tiles">
                  地図のハザード重ね（{HAZARD_RASTER_NAMES}）: {HAZARD_PORTAL_SOURCE}（{HAZARD_PORTAL_URL}）
                </li>
                <li>{WARD_BOUNDARY_CREDIT}</li>
                <li>
                  地図タイル: <a href={GSI_TILE_LIST_URL} target="_blank" rel="noopener noreferrer" className="underline">{GSI_TILES_NAME}</a>（淡色地図）
                  ／ ダーク表示: {GSI_PALE_PROCESSED}
                </li>
              </ul>
            </div>
          </div>
        </footer>
      </main>

    </div>
  );
}
