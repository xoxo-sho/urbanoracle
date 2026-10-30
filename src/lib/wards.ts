/**
 * The 23 特別区 of Tokyo in 全国地方公共団体コード order (総務省,
 * https://www.soumu.go.jp/denshijiti/code.html — 特別区 codes 13101–13123).
 *
 * Reference facts, not data: the ward selector offers them whether or not the
 * figures for a ward have arrived, so a reader can pick a ward while the
 * census call is loading or has failed. The same codes key TOKYO_WARDS in
 * backend/services/demographics.py and are the e-Stat area codes.
 */
export interface Ward {
  readonly code: string;
  readonly name: string;
}

export const TOKYO_WARDS: readonly Ward[] = [
  { code: "13101", name: "千代田区" },
  { code: "13102", name: "中央区" },
  { code: "13103", name: "港区" },
  { code: "13104", name: "新宿区" },
  { code: "13105", name: "文京区" },
  { code: "13106", name: "台東区" },
  { code: "13107", name: "墨田区" },
  { code: "13108", name: "江東区" },
  { code: "13109", name: "品川区" },
  { code: "13110", name: "目黒区" },
  { code: "13111", name: "大田区" },
  { code: "13112", name: "世田谷区" },
  { code: "13113", name: "渋谷区" },
  { code: "13114", name: "中野区" },
  { code: "13115", name: "杉並区" },
  { code: "13116", name: "豊島区" },
  { code: "13117", name: "北区" },
  { code: "13118", name: "荒川区" },
  { code: "13119", name: "板橋区" },
  { code: "13120", name: "練馬区" },
  { code: "13121", name: "足立区" },
  { code: "13122", name: "葛飾区" },
  { code: "13123", name: "江戸川区" },
];

export const TOKYO_WARD_NAMES: readonly string[] = TOKYO_WARDS.map((w) => w.name);
