import type { DemographicsData } from "@/types";
import { fetchWithFallback } from "./client";
import { sampleDemographics } from "@/data/sample";

const TOKYO_WARDS: Record<string, { name: string; area: number }> = {
  "13101": { name: "千代田区", area: 11.66 },
  "13102": { name: "中央区", area: 10.21 },
  "13103": { name: "港区", area: 20.37 },
  "13104": { name: "新宿区", area: 18.22 },
  "13105": { name: "文京区", area: 11.29 },
  "13106": { name: "台東区", area: 10.11 },
  "13107": { name: "墨田区", area: 13.77 },
  "13108": { name: "江東区", area: 40.16 },
  "13109": { name: "品川区", area: 22.84 },
  "13110": { name: "目黒区", area: 14.67 },
  "13111": { name: "大田区", area: 60.83 },
  "13112": { name: "世田谷区", area: 58.05 },
  "13113": { name: "渋谷区", area: 15.11 },
  "13114": { name: "中野区", area: 15.59 },
  "13115": { name: "杉並区", area: 34.06 },
  "13116": { name: "豊島区", area: 13.01 },
  "13117": { name: "北区", area: 20.61 },
  "13118": { name: "荒川区", area: 10.16 },
  "13119": { name: "板橋区", area: 32.22 },
  "13120": { name: "練馬区", area: 48.08 },
  "13121": { name: "足立区", area: 53.25 },
  "13122": { name: "葛飾区", area: 34.80 },
  "13123": { name: "江戸川区", area: 49.90 },
};

interface EStatValue {
  "@tab": string;
  "@cat01": string;
  "@cat02": string;
  "@area": string;
  "@time": string;
  "@unit": string;
  $: string;
}

interface EStatResponse {
  GET_STATS_DATA: {
    RESULT: { STATUS: number };
    STATISTICAL_DATA: {
      DATA_INF: {
        VALUE: EStatValue[];
      };
    };
  };
}

function findValue(
  values: EStatValue[],
  area: string,
  tab: string,
  cat01: string,
  cat02: string = "100"
): number {
  const v = values.find(
    (v) =>
      v["@area"] === area &&
      v["@tab"] === tab &&
      v["@cat01"] === cat01 &&
      v["@cat02"] === cat02
  );
  return v ? parseFloat(v.$) : 0;
}

export async function fetchDemographicsFromEStat(): Promise<DemographicsData[]> {
  const apiKey = process.env.ESTAT_API_KEY;
  if (!apiKey) throw new Error("ESTAT_API_KEY not set");

  const areaCodes = Object.keys(TOKYO_WARDS).join(",");

  // Table 0003448299: Age 3-group population by municipality (2020 census)
  const url = `https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData?appId=${apiKey}&statsDataId=0003448299&cdArea=${areaCodes}&limit=10000`;

  const res = await fetch(url, { next: { revalidate: 86400 * 30 } });
  if (!res.ok) throw new Error(`e-Stat API error: ${res.status}`);

  const data: EStatResponse = await res.json();
  if (data.GET_STATS_DATA.RESULT.STATUS !== 0) {
    throw new Error("e-Stat returned error status");
  }

  const values = data.GET_STATS_DATA.STATISTICAL_DATA.DATA_INF.VALUE;

  const results: DemographicsData[] = [];

  for (const [code, ward] of Object.entries(TOKYO_WARDS)) {
    const totalPop = findValue(values, code, "020", "100"); // total population
    if (totalPop === 0) continue;

    const youngPop = findValue(values, code, "020", "110"); // 0-14
    const workingPop = findValue(values, code, "020", "120"); // 15-64
    const elderlyPop = findValue(values, code, "020", "130"); // 65+

    // Use percentage from API if available, otherwise calculate
    let youngPct = findValue(values, code, "105", "110");
    let workingPct = 0;
    let elderlyPct = findValue(values, code, "105", "130");

    if (youngPct === 0 && totalPop > 0) {
      youngPct = Math.round((youngPop / totalPop) * 100);
      elderlyPct = Math.round((elderlyPop / totalPop) * 100);
    } else {
      youngPct = Math.round(youngPct);
      elderlyPct = Math.round(elderlyPct);
    }
    workingPct = 100 - youngPct - elderlyPct;

    results.push({
      region: ward.name,
      population: totalPop,
      density: Math.round(totalPop / ward.area),
      growthRate: 0, // Census doesn't include growth rate directly
      ageGroups: {
        young: youngPct,
        working: workingPct,
        elderly: elderlyPct,
      },
    });
  }

  return results;
}

export async function getDemographics() {
  return fetchWithFallback(fetchDemographicsFromEStat, sampleDemographics);
}
