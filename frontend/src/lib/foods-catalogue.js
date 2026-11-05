/**
 * Built-in curated foods catalogue for instant offline search and standard staples.
 * Values normalized to canonical per100g: { kcal, protein, carbs, fat }.
 */

import defaultFoods from "./default_foods.json";

export const BUILTIN_FOODS = Object.freeze(defaultFoods);

export function searchBuiltinFoods(query, lang = "tr", limit = 16) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return BUILTIN_FOODS.slice(0, limit);
  const qNorm = q
    .replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u")
    .replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c");

  const queryTokens = qNorm.split(/\s+/).filter(Boolean);
  const wantsRaw = queryTokens.some(t => t === "cig" || t === "raw");

  const scored = [];
  for (const item of BUILTIN_FOODS) {
    const nameTr = item.name.toLowerCase();
    const nameEn = (item.nameEn || "").toLowerCase();
    const nameNorm = nameTr
      .replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u")
      .replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c");
    const nameEnNorm = nameEn
      .replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u")
      .replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c");

    const allTags = (item.tags || []).map(t => t.toLowerCase()
      .replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u")
      .replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c")
    );
    const isItemRaw = nameNorm.includes("cig") || nameEnNorm.includes("raw") || allTags.includes("cig") || allTags.includes("raw");

    let score = 0;
    if (nameNorm === qNorm || nameEnNorm === qNorm) {
      score += 200;
    } else if (nameNorm.startsWith(qNorm) || nameEnNorm.startsWith(qNorm)) {
      score += 120;
    } else if (nameNorm.includes(qNorm) || nameEnNorm.includes(qNorm)) {
      score += 80;
    }

    const tokensMatched = queryTokens.filter(t => 
      nameNorm.includes(t) || nameEnNorm.includes(t) || allTags.some(tag => tag.includes(t))
    ).length;

    if (tokensMatched === queryTokens.length) {
      score += 100;
    } else if (tokensMatched > 0) {
      score += 25 * tokensMatched;
    }

    // Significant boost if user asked for raw/cig items specifically
    if (wantsRaw && isItemRaw) {
      score += 150;
    }

    if (score > 0) scored.push({ item, score });
  }

  scored.sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name));
  return scored.slice(0, limit).map(s => s.item);
}
