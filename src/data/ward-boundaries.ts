// GeoJSON FeatureCollection for all 23 Tokyo wards
// Properties include demographics, land prices, and disaster risk data
// In production, replace polygon coordinates with actual 国土数値情報 data

export interface WardFeatureProperties {
  name: string;
  population: number;
  density: number;
  growthRate: number;
  elderly: number;
  avgLandPrice: number;
  priceChange: number;
  maxRiskLevel: number;
  riskTypes: string;
}

export type WardFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Polygon, WardFeatureProperties>;

// Ward data: [name, center_lng, center_lat, population, density, growthRate, elderly%, avgPrice, priceChange%, maxRisk, riskTypes, polygon_coords]
const WARD_DATA: Array<{
  name: string;
  center: [number, number];
  bbox: [[number, number], [number, number]];
  pop: number;
  density: number;
  growth: number;
  elderly: number;
  price: number;
  priceChg: number;
  risk: number;
  riskTypes: string;
  coords: [number, number][];
}> = [
  { name: "千代田区", center: [139.7536, 35.6940], bbox: [[139.730, 35.672], [139.781, 35.705]], pop: 67927, density: 5830, growth: 2.1, elderly: 21, price: 5300000, priceChg: 4.2, risk: 0, riskTypes: "", coords: [[139.738,35.675],[139.773,35.673],[139.780,35.690],[139.775,35.702],[139.750,35.704],[139.732,35.695],[139.738,35.675]] },
  { name: "中央区", center: [139.7727, 35.6706], bbox: [[139.756, 35.650], [139.792, 35.688]], pop: 174073, density: 17110, growth: 3.5, elderly: 17, price: 4800000, priceChg: 3.8, risk: 0, riskTypes: "", coords: [[139.758,35.662],[139.785,35.652],[139.791,35.670],[139.787,35.685],[139.768,35.687],[139.758,35.678],[139.758,35.662]] },
  { name: "港区", center: [139.7514, 35.6581], bbox: [[139.720, 35.630], [139.770, 35.678]], pop: 260486, density: 12770, growth: 1.8, elderly: 21, price: 3850000, priceChg: 3.1, risk: 0, riskTypes: "", coords: [[139.725,35.645],[139.758,35.632],[139.769,35.648],[139.768,35.670],[139.750,35.677],[139.728,35.668],[139.725,35.645]] },
  { name: "新宿区", center: [139.7035, 35.6938], bbox: [[139.683, 35.681], [139.729, 35.716]], pop: 349385, density: 19100, growth: 0.5, elderly: 22, price: 4120000, priceChg: 2.5, risk: 0, riskTypes: "", coords: [[139.686,35.685],[139.718,35.682],[139.727,35.695],[139.725,35.713],[139.705,35.715],[139.687,35.702],[139.686,35.685]] },
  { name: "文京区", center: [139.7520, 35.7080], bbox: [[139.731, 35.700], [139.768, 35.728]], pop: 240069, density: 21260, growth: 1.3, elderly: 21, price: 1150000, priceChg: 1.8, risk: 0, riskTypes: "", coords: [[139.734,35.703],[139.760,35.701],[139.766,35.715],[139.758,35.726],[139.740,35.727],[139.733,35.715],[139.734,35.703]] },
  { name: "台東区", center: [139.7800, 35.7120], bbox: [[139.765, 35.700], [139.796, 35.731]], pop: 211444, density: 20910, growth: 0.9, elderly: 24, price: 1080000, priceChg: 2.1, risk: 4, riskTypes: "earthquake", coords: [[139.768,35.705],[139.790,35.702],[139.794,35.718],[139.788,35.729],[139.772,35.728],[139.767,35.715],[139.768,35.705]] },
  { name: "墨田区", center: [139.8010, 35.7100], bbox: [[139.788, 35.692], [139.822, 35.735]], pop: 275082, density: 19980, growth: 0.7, elderly: 24, price: 620000, priceChg: 1.5, risk: 5, riskTypes: "earthquake", coords: [[139.791,35.695],[139.815,35.693],[139.820,35.710],[139.818,35.732],[139.800,35.734],[139.790,35.715],[139.791,35.695]] },
  { name: "江東区", center: [139.8170, 35.6730], bbox: [[139.780, 35.630], [139.852, 35.705]], pop: 524310, density: 13050, growth: 2.4, elderly: 20, price: 620000, priceChg: 3.2, risk: 5, riskTypes: "flood", coords: [[139.785,35.655],[139.820,35.632],[139.848,35.655],[139.845,35.690],[139.820,35.702],[139.790,35.695],[139.785,35.655]] },
  { name: "品川区", center: [139.7300, 35.6090], bbox: [[139.705, 35.585], [139.755, 35.635]], pop: 422488, density: 18500, growth: 1.1, elderly: 21, price: 980000, priceChg: 1.6, risk: 2, riskTypes: "tsunami", coords: [[139.710,35.590],[139.740,35.587],[139.752,35.610],[139.748,35.632],[139.725,35.634],[139.708,35.618],[139.710,35.590]] },
  { name: "目黒区", center: [139.6980, 35.6413], bbox: [[139.675, 35.620], [139.715, 35.662]], pop: 287750, density: 19540, growth: 0.6, elderly: 22, price: 1050000, priceChg: 1.2, risk: 0, riskTypes: "", coords: [[139.678,35.625],[139.705,35.622],[139.713,35.640],[139.710,35.658],[139.690,35.660],[139.677,35.645],[139.678,35.625]] },
  { name: "大田区", center: [139.7160, 35.5610], bbox: [[139.670, 35.520], [139.755, 35.595]], pop: 748081, density: 12300, growth: 0.2, elderly: 25, price: 520000, priceChg: 0.5, risk: 0, riskTypes: "", coords: [[139.675,35.535],[139.720,35.522],[139.750,35.550],[139.748,35.585],[139.720,35.593],[139.682,35.575],[139.675,35.535]] },
  { name: "世田谷区", center: [139.6530, 35.6461], bbox: [[139.598, 35.610], [139.686, 35.670]], pop: 939099, density: 16200, growth: 0.8, elderly: 23, price: 680000, priceChg: 0.8, risk: 3, riskTypes: "landslide", coords: [[139.602,35.620],[139.650,35.612],[139.683,35.630],[139.682,35.660],[139.655,35.668],[139.610,35.655],[139.602,35.620]] },
  { name: "渋谷区", center: [139.6982, 35.6640], bbox: [[139.682, 35.650], [139.720, 35.683]], pop: 243883, density: 16020, growth: 1.2, elderly: 20, price: 2950000, priceChg: 2.8, risk: 0, riskTypes: "", coords: [[139.685,35.653],[139.710,35.652],[139.718,35.665],[139.715,35.680],[139.698,35.681],[139.684,35.670],[139.685,35.653]] },
  { name: "中野区", center: [139.6640, 35.7077], bbox: [[139.645, 35.695], [139.687, 35.723]], pop: 344880, density: 22120, growth: 0.4, elderly: 23, price: 680000, priceChg: 0.9, risk: 0, riskTypes: "", coords: [[139.648,35.698],[139.675,35.696],[139.685,35.708],[139.682,35.720],[139.662,35.722],[139.647,35.710],[139.648,35.698]] },
  { name: "杉並区", center: [139.6366, 35.6994], bbox: [[139.598, 35.680], [139.668, 35.720]], pop: 591108, density: 17360, growth: 0.3, elderly: 24, price: 580000, priceChg: 0.6, risk: 0, riskTypes: "", coords: [[139.602,35.685],[139.640,35.682],[139.665,35.695],[139.664,35.715],[139.638,35.718],[139.605,35.705],[139.602,35.685]] },
  { name: "豊島区", center: [139.7161, 35.7263], bbox: [[139.698, 35.713], [139.738, 35.743]], pop: 301599, density: 23200, growth: 0.3, elderly: 24, price: 1280000, priceChg: 1.5, risk: 0, riskTypes: "", coords: [[139.701,35.716],[139.728,35.714],[139.736,35.728],[139.731,35.740],[139.713,35.742],[139.700,35.730],[139.701,35.716]] },
  { name: "北区", center: [139.7340, 35.7527], bbox: [[139.705, 35.735], [139.765, 35.785]], pop: 355213, density: 17230, growth: -0.2, elderly: 27, price: 520000, priceChg: 0.4, risk: 3, riskTypes: "earthquake,landslide", coords: [[139.710,35.740],[139.745,35.737],[139.762,35.753],[139.758,35.780],[139.735,35.783],[139.708,35.765],[139.710,35.740]] },
  { name: "荒川区", center: [139.7834, 35.7360], bbox: [[139.763, 35.722], [139.805, 35.753]], pop: 217475, density: 21400, growth: 0.1, elderly: 25, price: 520000, priceChg: 0.5, risk: 4, riskTypes: "earthquake", coords: [[139.766,35.725],[139.790,35.723],[139.802,35.735],[139.798,35.750],[139.780,35.752],[139.765,35.740],[139.766,35.725]] },
  { name: "板橋区", center: [139.6810, 35.7510], bbox: [[139.640, 35.730], [139.720, 35.785]], pop: 584483, density: 18140, growth: 0.1, elderly: 24, price: 480000, priceChg: 0.4, risk: 0, riskTypes: "", coords: [[139.645,35.735],[139.685,35.732],[139.715,35.748],[139.710,35.780],[139.680,35.783],[139.643,35.760],[139.645,35.735]] },
  { name: "練馬区", center: [139.6520, 35.7350], bbox: [[139.595, 35.715], [139.695, 35.765]], pop: 752608, density: 15650, growth: 0.4, elderly: 24, price: 420000, priceChg: 0.3, risk: 0, riskTypes: "", coords: [[139.600,35.720],[139.650,35.717],[139.690,35.730],[139.688,35.758],[139.650,35.763],[139.605,35.745],[139.600,35.720]] },
  { name: "足立区", center: [139.8040, 35.7750], bbox: [[139.755, 35.745], [139.853, 35.810]], pop: 695043, density: 13060, growth: -0.3, elderly: 27, price: 310000, priceChg: 0.3, risk: 4, riskTypes: "flood", coords: [[139.760,35.750],[139.810,35.747],[139.848,35.770],[139.845,35.805],[139.810,35.808],[139.765,35.785],[139.760,35.750]] },
  { name: "葛飾区", center: [139.8477, 35.7438], bbox: [[139.820, 35.720], [139.885, 35.775]], pop: 464526, density: 13360, growth: -0.1, elderly: 25, price: 290000, priceChg: 0.2, risk: 4, riskTypes: "flood", coords: [[139.823,35.725],[139.860,35.722],[139.882,35.740],[139.878,35.770],[139.850,35.773],[139.825,35.755],[139.823,35.725]] },
  { name: "江戸川区", center: [139.8680, 35.7068], bbox: [[139.835, 35.650], [139.910, 35.745]], pop: 697932, density: 13990, growth: -0.2, elderly: 23, price: 320000, priceChg: 0.1, risk: 3, riskTypes: "flood,tsunami", coords: [[139.838,35.660],[139.875,35.652],[139.905,35.680],[139.903,35.735],[139.870,35.743],[139.840,35.720],[139.838,35.660]] },
];

export function buildWardGeoJSON(): WardFeatureCollection {
  return {
    type: "FeatureCollection",
    features: WARD_DATA.map((w, i) => ({
      type: "Feature" as const,
      id: i,
      properties: {
        name: w.name,
        population: w.pop,
        density: w.density,
        growthRate: w.growth,
        elderly: w.elderly,
        avgLandPrice: w.price,
        priceChange: w.priceChg,
        maxRiskLevel: w.risk,
        riskTypes: w.riskTypes,
      },
      geometry: {
        type: "Polygon" as const,
        coordinates: [w.coords],
      },
    })),
  };
}

export function getWardBounds(wardName: string): [[number, number], [number, number]] | null {
  const ward = WARD_DATA.find((w) => w.name === wardName);
  return ward ? ward.bbox : null;
}

export function getWardCenter(wardName: string): [number, number] | null {
  const ward = WARD_DATA.find((w) => w.name === wardName);
  return ward ? ward.center : null;
}

// Station data as GeoJSON for bubble layer
export function buildStationGeoJSON(stations: Array<{ name: string; lat: number; lng: number; dailyPassengers: number; ward?: string }>): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: stations.map((s) => ({
      type: "Feature" as const,
      properties: {
        name: s.name,
        passengers: s.dailyPassengers,
        ward: s.ward ?? "",
      },
      geometry: {
        type: "Point" as const,
        coordinates: [s.lng, s.lat],
      },
    })),
  };
}
