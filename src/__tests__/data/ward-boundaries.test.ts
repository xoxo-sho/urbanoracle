import { describe, it, expect } from "vitest";
import { getWardCenter, buildStationGeoJSON } from "@/data/ward-boundaries";

describe("Ward boundaries", () => {
  it("returns center for known ward", () => {
    const center = getWardCenter("千代田区");
    expect(center).not.toBeNull();
    expect(center![0]).toBeGreaterThan(139);
    expect(center![1]).toBeGreaterThan(35);
  });

  it("returns null for unknown ward", () => {
    expect(getWardCenter("存在しない区")).toBeNull();
  });

  it("builds station GeoJSON", () => {
    const stations = [
      { name: "新宿駅", lat: 35.69, lng: 139.70, dailyPassengers: 775000 },
    ];
    const geojson = buildStationGeoJSON(stations);
    expect(geojson.type).toBe("FeatureCollection");
    expect(geojson.features).toHaveLength(1);
    expect(geojson.features[0].properties.name).toBe("新宿駅");
    expect(geojson.features[0].geometry.type).toBe("Point");
  });
});
