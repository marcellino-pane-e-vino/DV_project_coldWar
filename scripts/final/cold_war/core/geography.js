import { DATA_URLS } from "./config.js";
const d3 = globalThis.d3;
const topojson = globalThis.topojson;
const cache = new Map();

export function getGwCode(feature) {
  const raw = feature?.properties?.id ?? feature?.id;
  if (raw == null) return null;
  const n = Number(String(raw).replace(/^gw/i, ""));
  return Number.isInteger(n) ? n : null;
}

export async function loadColdWarBasemap(year) {
  const y = Number(year);
  if (!cache.has(y)) {
    cache.set(y, d3.json(DATA_URLS.basemap(y)).then(topology => {
      const object = Object.values(topology.objects || {})[0];
      if (!object) throw new Error(`No TopoJSON object for ${y}`);
      return topojson.feature(topology, object).features;
    }));
  }
  return cache.get(y);
}

export function prefetchColdWarBasemaps(years) {
  return Promise.all(years.map(loadColdWarBasemap));
}
