/**
 * External food database lookup client with bounded LRU localStorage cache
 * and fallback cascade: Local Cache -> Open Food Facts -> USDA FoodData Central -> Built-in.
 */

import { cleanKcal, cleanMacro } from "./nutrition.js";
import { searchBuiltinFoods } from "./foods-catalogue.js";

const CACHE_KEY = "gym_food_cache_v1";
const CACHE_MAX = 100;
const USER_AGENT = "OpenGymCustom/1.0";

function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function saveCache(cache) {
  try {
    const keys = Object.keys(cache);
    if (keys.length > CACHE_MAX) {
      const sorted = keys.sort((a, b) => (cache[a]?._at || 0) - (cache[b]?._at || 0));
      for (const k of sorted.slice(0, keys.length - CACHE_MAX)) {
        delete cache[k];
      }
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // quota exceeded or storage disabled
  }
}

export function cacheFoodItem(item) {
  if (!item || !item.name) return;
  const cache = loadCache();
  const key = item.barcode ? `bc:${item.barcode}` : (item.id || `n:${item.name.toLowerCase()}|${item.serving || ""}`);
  cache[key] = { ...item, _at: Date.now() };
  saveCache(cache);
}

export function getCachedFood(key) {
  const cache = loadCache();
  return cache[key] || null;
}

/**
 * Normalizes Open Food Facts product JSON to OpenGym nutrition schema.
 */
export function normalizeOffProduct(p) {
  if (!p) return null;
  const name = p.product_name || p.product_name_tr || p.product_name_en || p.generic_name || "";
  if (!name.trim()) return null;
  const nuts = p.nutriments || {};
  const kcal100 = cleanKcal(nuts["energy-kcal_100g"] ?? (nuts.energy_100g ? nuts.energy_100g / 4.184 : 0));
  const prot100 = cleanMacro(nuts.proteins_100g);
  const carb100 = cleanMacro(nuts.carbohydrates_100g);
  const fat100 = cleanMacro(nuts.fat_100g);

  const servingGrams = Number(p.serving_quantity) || (p.serving_size ? parseFloat(p.serving_size.replace(",", ".")) : 0) || null;
  const servingLabel = p.serving_size ? p.serving_size.trim() : (servingGrams ? `${servingGrams} g` : "100 g");
  const mult = servingGrams && servingGrams > 0 ? servingGrams / 100 : 1;

  return {
    id: "off:" + (p.code || name),
    source: "openfoodfacts",
    barcode: p.code || null,
    name: name.trim(),
    brand: p.brands ? p.brands.split(",")[0].trim() : null,
    serving: servingLabel,
    gramsPerServing: servingGrams || 100,
    per100g: {
      kcal: kcal100,
      protein: prot100,
      carbs: carb100,
      fat: fat100,
    },
    kcal: Math.round(kcal100 * mult),
    protein: cleanMacro(prot100 * mult),
    carbs: cleanMacro(carb100 * mult),
    fat: cleanMacro(fat100 * mult),
  };
}

/**
 * Normalizes USDA FoodData Central item to OpenGym nutrition schema.
 */
export function normalizeUsdaProduct(item) {
  if (!item || !item.description) return null;
  const nutrients = Array.isArray(item.foodNutrients) ? item.foodNutrients : [];
  let kcal = 0, protein = 0, carbs = 0, fat = 0;

  for (const n of nutrients) {
    const name = (n.nutrientName || "").toLowerCase();
    if (name.includes("energy") && (n.unitName === "KCAL" || !kcal)) {
      kcal = Math.round(Number(n.value) || 0);
    } else if (name === "protein") {
      protein = Math.round((Number(n.value) || 0) * 10) / 10;
    } else if (name.includes("carbohydrate")) {
      carbs = Math.round((Number(n.value) || 0) * 10) / 10;
    } else if (name.includes("total lipid") || name === "fat") {
      fat = Math.round((Number(n.value) || 0) * 10) / 10;
    }
  }

  return {
    id: "usda:" + (item.fdcId || item.description),
    source: "usda",
    name: item.description,
    serving: "100 g",
    gramsPerServing: 100,
    per100g: { kcal, protein, carbs, fat },
    kcal,
    protein,
    carbs,
    fat,
  };
}

/**
 * Open Food Facts name search API
 */
export async function searchOpenFoodFacts(query, signal) {
  const q = String(query || "").trim();
  if (!q) return [];
  try {
    const offUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=15&fields=code,product_name,brands,nutriments,serving_size`;
    const res = await fetch(offUrl, {
      headers: { "User-Agent": USER_AGENT },
      signal: signal || AbortSignal.timeout(4000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.products) ? data.products.map(normalizeOffProduct).filter(Boolean) : [];
  } catch {
    return [];
  }
}

/**
 * Open Food Facts barcode API lookup
 */
export async function lookupBarcodeOpenFoodFacts(barcode, signal) {
  const code = String(barcode || "").trim();
  if (!code) return null;
  try {
    const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=code,product_name,brands,nutriments,serving_size`;
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: signal || AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 1 || !data.product) return null;
    return normalizeOffProduct(data.product);
  } catch {
    return null;
  }
}

/**
 * USDA FoodData Central search API
 */
export async function searchUsda(query, signal) {
  const q = String(query || "").trim();
  if (!q) return [];
  const apiKey = (typeof localStorage !== "undefined" && localStorage.getItem("gym_usda_api_key")) || "DEMO_KEY";
  try {
    // 1. Try local server proxy first
    const proxyUrl = `/api/nutrition/usda?q=${encodeURIComponent(q)}`;
    const res = await fetch(proxyUrl, { signal: signal || AbortSignal.timeout(4000) });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.results) && data.results.length > 0) return data.results;
    }
  } catch {
    // fall through to direct USDA fetch
  }

  // 2. Direct USDA query fallback
  try {
    const usdaUrl = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(q)}&api_key=${encodeURIComponent(apiKey)}&pageSize=10`;
    const res = await fetch(usdaUrl, { signal: signal || AbortSignal.timeout(4000) });
    if (!res.ok) return [];
    const data = await res.json();
    const foods = Array.isArray(data.foods) ? data.foods : [];
    return foods.map(normalizeUsdaProduct).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Looks up a barcode across local cache, custom foods, and Open Food Facts.
 */
export async function lookupBarcode(barcode, customFoods = [], signal) {
  const code = String(barcode || "").trim();
  if (!code) return null;

  // 1. Search customFoods
  const matchedCustom = customFoods.find(f => f && f.barcode === code);
  if (matchedCustom) return { ...matchedCustom, source: "custom" };

  // 2. Search LRU local cache
  const cached = getCachedFood(`bc:${code}`);
  if (cached) return cached;

  // 3. Query Open Food Facts API
  const item = await lookupBarcodeOpenFoodFacts(code, signal);
  if (item) cacheFoodItem(item);
  return item;
}

/**
 * Searches external food libraries (Built-in 100 foods -> Diyetkolik -> USDA -> Open Food Facts).
 */
export async function searchExternalFoods(query, lang = "tr", signal) {
  const q = String(query || "").trim();
  if (!q) return [];

  const results = [];
  const seenNames = new Set();

  const pushUnique = item => {
    if (!item || !item.name) return;
    const key = (item.name + "|" + (item.serving || "")).toLowerCase();
    if (seenNames.has(key)) return;
    seenNames.add(key);
    results.push(item);
  };

  // 1. Instant built-in catalogue matches (0 latency offline)
  const localHits = searchBuiltinFoods(q, lang, 8);
  for (const h of localHits) {
    pushUnique({
      ...h,
      source: "builtin",
      kcal: Math.round(h.per100g.kcal * (h.gramsPerServing / 100)),
      protein: cleanMacro(h.per100g.protein * (h.gramsPerServing / 100)),
      carbs: cleanMacro(h.per100g.carbs * (h.gramsPerServing / 100)),
      fat: cleanMacro(h.per100g.fat * (h.gramsPerServing / 100)),
    });
  }

  // 2. Query Diyetkolik via local server proxy
  const diyetkolikPromise = (async () => {
    try {
      const res = await fetch(`/api/nutrition/diyetkolik?q=${encodeURIComponent(q)}`, {
        signal: signal || AbortSignal.timeout(4000),
      });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.results) ? data.results : [];
    } catch {
      return [];
    }
  })();

  // 3. Query USDA FoodData Central
  const usdaPromise = searchUsda(q, signal);

  // 4. Query Open Food Facts search API in parallel
  const offPromise = searchOpenFoodFacts(q, signal);

  const [dkHits, usdaHits, offHits] = await Promise.all([diyetkolikPromise, usdaPromise, offPromise]);

  // Priority order: Diyetkolik -> USDA -> Built-in -> Open Food Facts
  for (const item of dkHits) {
    cacheFoodItem(item);
    pushUnique(item);
  }
  for (const item of usdaHits) {
    cacheFoodItem(item);
    pushUnique(item);
  }
  for (const item of offHits) {
    cacheFoodItem(item);
    pushUnique(item);
  }

  return results;
}

export const foodApiService = {
  searchOpenFoodFacts,
  lookupBarcodeOpenFoodFacts,
  searchUsda,
  searchExternalFoods,
  lookupBarcode,
  cacheFoodItem,
  getCachedFood,
};
