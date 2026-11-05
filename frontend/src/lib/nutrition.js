import { uid } from './format.js'

export const DEFAULT_NUTRITION_GOALS = Object.freeze({
  kcal: 2200,
  protein: 160,
  carbs: 220,
  fat: 70,
})

export const MEAL_TYPES = Object.freeze(['breakfast', 'lunch', 'dinner', 'snacks'])

export const FOOD_NAME_MAX = 120
export const SERVING_MAX = 60
export const NUTRITION_NUM_MAX = 50000

const ISO = /^\d{4}-\d{2}-\d{2}$/
const isMap = v => !!v && typeof v === 'object' && !Array.isArray(v)
const round1 = n => Math.round(n * 10) / 10
const round2 = n => Math.round(n * 100) / 100
const pad2 = n => String(n).padStart(2, '0')

/** DST-safe calendar day arithmetic at local noon. */
export function shiftISO(dateISO, deltaDays = 0) {
  if (!ISO.test(String(dateISO || ''))) return ''
  const d = new Date(dateISO + 'T12:00:00')
  if (Number.isNaN(d.getTime())) return ''
  d.setDate(d.getDate() + Math.trunc(Number(deltaDays) || 0))
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function cleanKcal(v, fallback = 0) {
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) return fallback
  return Math.round(Math.min(n, NUTRITION_NUM_MAX))
}

export function cleanMacro(v, fallback = 0) {
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) return fallback
  return round1(Math.min(n, NUTRITION_NUM_MAX))
}

function cleanGoalNum(v, fallback) {
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.round(Math.min(n, NUTRITION_NUM_MAX))
}

/** Standard Atwater estimate: 4 kcal/g protein, 4 kcal/g carbs, 9 kcal/g fat. */
export function kcalFromMacros(protein, carbs, fat) {
  return Math.round(cleanMacro(protein) * 4 + cleanMacro(carbs) * 4 + cleanMacro(fat) * 9)
}

/** Calorie and percentage breakdown for protein, carbs, and fat targets/intake. */
export function macroBreakdown(protein, carbs, fat) {
  const pG = cleanMacro(protein)
  const cG = cleanMacro(carbs)
  const fG = cleanMacro(fat)
  const proteinKcal = Math.round(pG * 4)
  const carbsKcal = Math.round(cG * 4)
  const fatKcal = Math.round(fG * 9)
  const kcal = proteinKcal + carbsKcal + fatKcal
  if (!(kcal > 0)) {
    return {
      kcal: 0,
      proteinKcal: 0,
      carbsKcal: 0,
      fatKcal: 0,
      proteinPct: 0,
      carbsPct: 0,
      fatPct: 0,
      shares: { protein: 0, carbs: 0, fat: 0 },
    }
  }
  const raw = [
    (proteinKcal / kcal) * 100,
    (carbsKcal / kcal) * 100,
    (fatKcal / kcal) * 100,
  ]
  const floors = raw.map(x => Math.floor(x))
  let rem = 100 - (floors[0] + floors[1] + floors[2])
  const order = [0, 1, 2].sort((a, b) => (raw[b] - floors[b]) - (raw[a] - floors[a]))
  for (let i = 0; i < order.length && rem > 0; i++, rem--) {
    floors[order[i]] += 1
  }
  return {
    kcal,
    proteinKcal,
    carbsKcal,
    fatKcal,
    proteinPct: floors[0],
    carbsPct: floors[1],
    fatPct: floors[2],
    shares: {
      protein: proteinKcal / kcal,
      carbs: carbsKcal / kcal,
      fat: fatKcal / kcal,
    },
  }
}

/** Scales a 1x food's calories and macros by `qty` servings/multiplier. */
export function scaleFoodMacros(base, qty = 1) {
  const qRaw = Number(qty)
  const q = Number.isFinite(qRaw) && qRaw > 0 ? round2(Math.min(qRaw, 1000)) : 1
  return {
    qty: q,
    kcal: cleanKcal((Number(base?.kcal) || 0) * q),
    protein: cleanMacro((Number(base?.protein) || 0) * q),
    carbs: cleanMacro((Number(base?.carbs) || 0) * q),
    fat: cleanMacro((Number(base?.fat) || 0) * q),
  }
}

/** Normalized daily calorie & macro targets from state `S` (tolerant of missing/partial keys). */
export function nutritionGoalsOf(S) {
  const raw = isMap(S?.nutritionGoals) ? S.nutritionGoals : {}
  return {
    kcal: cleanGoalNum(raw.kcal, DEFAULT_NUTRITION_GOALS.kcal),
    protein: cleanGoalNum(raw.protein, DEFAULT_NUTRITION_GOALS.protein),
    carbs: cleanGoalNum(raw.carbs, DEFAULT_NUTRITION_GOALS.carbs),
    fat: cleanGoalNum(raw.fat, DEFAULT_NUTRITION_GOALS.fat),
  }
}

export function emptyMeals() {
  return { breakfast: [], lunch: [], dinner: [], snacks: [] }
}

/** Normalized meal entry, or null if malformed / completely blank. */
export function normalizeMealEntry(raw) {
  if (!isMap(raw)) return null
  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, FOOD_NAME_MAX) : ''
  const serving = typeof raw.serving === 'string' ? raw.serving.trim().slice(0, SERVING_MAX) : ''
  const kcal = cleanKcal(raw.kcal)
  const protein = cleanMacro(raw.protein)
  const carbs = cleanMacro(raw.carbs)
  const fat = cleanMacro(raw.fat)
  if (!name && kcal === 0 && protein === 0 && carbs === 0 && fat === 0) return null
  const q = Number(raw.qty)
  const qty = Number.isFinite(q) && q > 0 ? round2(Math.min(q, 1000)) : 1
  const id = raw.id != null && String(raw.id).trim() ? String(raw.id).trim() : uid()
  const out = { id, name, serving, qty, kcal, protein, carbs, fat }
  if (typeof raw.foodId === 'string' && raw.foodId.trim()) out.foodId = raw.foodId.trim()
  if (Number.isFinite(Number(raw.at)) && Number(raw.at) > 0) out.at = Math.round(Number(raw.at))
  return out
}

/** Normalized day record `{ meals: { breakfast, lunch, dinner, snacks }, _ts }` for `dateISO`. */
export function nutritionDay(S, dateISO) {
  const logs = isMap(S?.nutritionLogs) ? S.nutritionLogs : {}
  const raw = ISO.test(String(dateISO || '')) && isMap(logs[dateISO]) ? logs[dateISO] : null
  const meals = emptyMeals()
  if (raw && isMap(raw.meals)) {
    for (const m of MEAL_TYPES) {
      if (!Array.isArray(raw.meals[m])) continue
      meals[m] = raw.meals[m].map(normalizeMealEntry).filter(Boolean)
    }
  }
  return { meals, _ts: Number(raw?._ts) || 0 }
}

/** Whether a day record (`{ meals }`) carries at least one logged food item. */
export function hasLoggedMeals(day) {
  if (!isMap(day?.meals)) return false
  return MEAL_TYPES.some(m => Array.isArray(day.meals[m]) && day.meals[m].some(e => normalizeMealEntry(e) != null))
}

/** Whether state `S` holds any custom foods or logged nutrition entries (for `useStore` `hasData`). */
export function hasNutritionData(S) {
  if (!isMap(S)) return false
  if (Array.isArray(S.customFoods) && S.customFoods.length > 0) return true
  if (!isMap(S.nutritionLogs)) return false
  return Object.values(S.nutritionLogs).some(hasLoggedMeals)
}

/** Summed `{ kcal, protein, carbs, fat }` for one meal's entries array. */
export function mealTotals(entries) {
  let kcal = 0, protein = 0, carbs = 0, fat = 0
  for (const raw of Array.isArray(entries) ? entries : []) {
    const it = normalizeMealEntry(raw)
    if (!it) continue
    kcal += it.kcal
    protein += it.protein
    carbs += it.carbs
    fat += it.fat
  }
  return {
    kcal: Math.round(kcal),
    protein: round1(protein),
    carbs: round1(carbs),
    fat: round1(fat),
  }
}

/** Summed `{ kcal, protein, carbs, fat }` across all four meals of a day record. */
export function dayTotals(day) {
  let kcal = 0, protein = 0, carbs = 0, fat = 0
  const meals = isMap(day?.meals) ? day.meals : {}
  for (const m of MEAL_TYPES) {
    const sub = mealTotals(meals[m])
    kcal += sub.kcal
    protein += sub.protein
    carbs += sub.carbs
    fat += sub.fat
  }
  return {
    kcal: Math.round(kcal),
    protein: round1(protein),
    carbs: round1(carbs),
    fat: round1(fat),
  }
}

/** Chronological daily intake window ending on `endISO` (default 7 days). */
export function nutritionHistoryWindow(S, endISO, days = 7) {
  if (!ISO.test(String(endISO || ''))) return []
  const count = Math.max(1, Math.min(365, Math.trunc(Number(days) || 7)))
  const goals = nutritionGoalsOf(S)
  const out = []
  for (let i = count - 1; i >= 0; i--) {
    const date = shiftISO(endISO, -i)
    const day = nutritionDay(S, date)
    const tot = dayTotals(day)
    const logged = hasLoggedMeals(day)
    out.push({
      date,
      kcal: tot.kcal,
      protein: tot.protein,
      carbs: tot.carbs,
      fat: tot.fat,
      goalKcal: goals.kcal,
      ratio: goals.kcal > 0 ? round2(tot.kcal / goals.kcal) : 0,
      over: goals.kcal > 0 && tot.kcal > goals.kcal,
      logged,
    })
  }
  return out
}

/** Normalized custom food entry, or null if invalid / unnamed. */
export function normalizeCustomFood(raw) {
  if (!isMap(raw)) return null
  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, FOOD_NAME_MAX) : ''
  if (!name) return null
  const serving = typeof raw.serving === 'string' ? raw.serving.trim().slice(0, SERVING_MAX) : ''
  const id = raw.id != null && String(raw.id).trim() ? String(raw.id).trim() : uid()
  return {
    id,
    name,
    serving,
    kcal: cleanKcal(raw.kcal),
    protein: cleanMacro(raw.protein),
    carbs: cleanMacro(raw.carbs),
    fat: cleanMacro(raw.fat),
    fav: Boolean(raw.fav),
    _ts: Number(raw._ts) || 0,
  }
}

/** Clean list of saved custom foods from state `S`. */
export function customFoodsOf(S) {
  if (!Array.isArray(S?.customFoods)) return []
  return S.customFoods.map(normalizeCustomFood).filter(Boolean)
}

/** Saved custom foods sorted with favourites pinned first, then newest `_ts` first. */
export function sortedCustomFoods(S) {
  return [...customFoodsOf(S)].sort((a, b) => (Number(b.fav) - Number(a.fav)) || ((b._ts || 0) - (a._ts || 0)))
}

/** Updates `s.nutritionGoals` in a store draft `s` and returns the normalized goals. */
export function setNutritionGoals(s, patch) {
  if (!isMap(s)) return DEFAULT_NUTRITION_GOALS
  const cur = nutritionGoalsOf(s)
  const next = nutritionGoalsOf({ nutritionGoals: { ...cur, ...(isMap(patch) ? patch : {}) } })
  s.nutritionGoals = next
  return next
}

/** Appends a normalized meal entry to `s.nutritionLogs[dateISO].meals[meal]`, stamped `now`. */
export function addMealEntry(s, dateISO, meal, item, now = Date.now()) {
  if (!isMap(s) || !ISO.test(String(dateISO || ''))) return null
  const mealKey = MEAL_TYPES.includes(meal) ? meal : 'snacks'
  const entry = normalizeMealEntry({ ...item, id: item?.id || uid(), at: item?.at || now })
  if (!entry) return null
  if (!isMap(s.nutritionLogs)) s.nutritionLogs = {}
  const day = nutritionDay(s, dateISO)
  day.meals[mealKey].push(entry)
  day._ts = Math.max(Number(now) || 0, day._ts + 1)
  s.nutritionLogs[dateISO] = day
  return entry
}

/** Copies all entries of `meal` from `fromISO` into `toISO` with fresh IDs; returns added entries. */
export function copyMealEntries(s, fromISO, toISO, meal, now = Date.now()) {
  if (!isMap(s) || !ISO.test(String(fromISO || '')) || !ISO.test(String(toISO || '')) || fromISO === toISO) return []
  if (!MEAL_TYPES.includes(meal)) return []
  const srcDay = nutritionDay(s, fromISO)
  const srcItems = srcDay.meals[meal]
  if (!srcItems.length) return []
  if (!isMap(s.nutritionLogs)) s.nutritionLogs = {}
  const dstDay = nutritionDay(s, toISO)
  const added = []
  for (let i = 0; i < srcItems.length; i++) {
    const clone = normalizeMealEntry({ ...srcItems[i], id: uid(), at: (Number(now) || Date.now()) + i })
    if (!clone) continue
    dstDay.meals[meal].push(clone)
    added.push(clone)
  }
  if (!added.length) return []
  dstDay._ts = Math.max(Number(now) || 0, dstDay._ts + 1)
  s.nutritionLogs[toISO] = dstDay
  return added
}

/** Copies all four meals from `fromISO` into `toISO` with fresh IDs; returns `{ count, entriesByMeal }`. */
export function copyDayEntries(s, fromISO, toISO, now = Date.now()) {
  const entriesByMeal = emptyMeals()
  if (!isMap(s) || !ISO.test(String(fromISO || '')) || !ISO.test(String(toISO || '')) || fromISO === toISO) {
    return { count: 0, entriesByMeal }
  }
  const srcDay = nutritionDay(s, fromISO)
  if (!hasLoggedMeals(srcDay)) return { count: 0, entriesByMeal }
  if (!isMap(s.nutritionLogs)) s.nutritionLogs = {}
  const dstDay = nutritionDay(s, toISO)
  let count = 0
  for (const meal of MEAL_TYPES) {
    for (const item of srcDay.meals[meal]) {
      const clone = normalizeMealEntry({ ...item, id: uid(), at: (Number(now) || Date.now()) + count })
      if (!clone) continue
      dstDay.meals[meal].push(clone)
      entriesByMeal[meal].push(clone)
      count += 1
    }
  }
  if (count > 0) {
    dstDay._ts = Math.max(Number(now) || 0, dstDay._ts + 1)
    s.nutritionLogs[toISO] = dstDay
  }
  return { count, entriesByMeal }
}

/** Re-inserts a removed meal entry at `index` (for Undo), stamped `now`. */
export function restoreMealEntry(s, dateISO, meal, entry, index = -1, now = Date.now()) {
  if (!isMap(s) || !ISO.test(String(dateISO || ''))) return null
  const mealKey = MEAL_TYPES.includes(meal) ? meal : 'snacks'
  const clean = normalizeMealEntry(entry)
  if (!clean) return null
  if (!isMap(s.nutritionLogs)) s.nutritionLogs = {}
  const day = nutritionDay(s, dateISO)
  if (day.meals[mealKey].some(x => x.id === clean.id)) return clean
  const list = day.meals[mealKey]
  if (Number.isInteger(index) && index >= 0 && index <= list.length) list.splice(index, 0, clean)
  else list.push(clean)
  day._ts = Math.max(Number(now) || 0, day._ts + 1)
  s.nutritionLogs[dateISO] = day
  return clean
}

/**
 * Updates an existing meal entry in `s.nutritionLogs[dateISO]` (and moves it if `patch.meal` is
 * another valid meal key), stamped `now`. Returns the updated entry, or null if not found.
 */
export function updateMealEntry(s, dateISO, meal, entryId, patch, now = Date.now()) {
  if (!isMap(s) || !ISO.test(String(dateISO || '')) || entryId == null || !isMap(patch)) return null
  if (!isMap(s.nutritionLogs)) return null
  const day = nutritionDay(s, dateISO)
  const id = String(entryId)
  const searchMeals = MEAL_TYPES.includes(meal) ? [meal, ...MEAL_TYPES.filter(m => m !== meal)] : MEAL_TYPES
  for (const fromMeal of searchMeals) {
    const idx = day.meals[fromMeal].findIndex(x => x.id === id)
    if (idx < 0) continue
    const cur = day.meals[fromMeal][idx]
    const targetMeal = MEAL_TYPES.includes(patch.meal) ? patch.meal : fromMeal
    const { meal: _omitMeal, ...rest } = patch
    const updated = normalizeMealEntry({ ...cur, ...rest, id: cur.id })
    if (!updated) return null
    if (targetMeal === fromMeal) {
      day.meals[fromMeal][idx] = updated
    } else {
      day.meals[fromMeal].splice(idx, 1)
      day.meals[targetMeal].push(updated)
    }
    day._ts = Math.max(Number(now) || 0, day._ts + 1)
    s.nutritionLogs[dateISO] = day
    return updated
  }
  return null
}

/**
 * Removes `entryId` from `s.nutritionLogs[dateISO]`. Keeps a stamped `{ meals, _ts: now }` record
 * even when the day becomes empty so multi-device `mergeStampedMap` propagates the removal.
 */
export function removeMealEntry(s, dateISO, meal, entryId, now = Date.now()) {
  if (!isMap(s) || !ISO.test(String(dateISO || '')) || entryId == null) return null
  if (!isMap(s.nutritionLogs) || !isMap(s.nutritionLogs[dateISO])) return null
  const day = nutritionDay(s, dateISO)
  const id = String(entryId)
  const searchMeals = MEAL_TYPES.includes(meal) ? [meal, ...MEAL_TYPES.filter(m => m !== meal)] : MEAL_TYPES
  for (const m of searchMeals) {
    const idx = day.meals[m].findIndex(x => x.id === id)
    if (idx < 0) continue
    const [removed] = day.meals[m].splice(idx, 1)
    day._ts = Math.max(Number(now) || 0, day._ts + 1)
    s.nutritionLogs[dateISO] = day
    return removed
  }
  return null
}

/** Creates or updates a saved food in `s.customFoods` (preserving sync `_f`/`_u` metadata). */
export function upsertCustomFood(s, food, now = Date.now()) {
  if (!isMap(s) || !isMap(food)) return null
  if (!Array.isArray(s.customFoods)) s.customFoods = []
  const wantId = food.id != null && String(food.id).trim() ? String(food.id).trim() : null
  const idx = wantId ? s.customFoods.findIndex(x => x && String(x.id) === wantId) : -1
  if (idx >= 0) {
    const prev = s.customFoods[idx]
    const ts = Math.max(Number(now) || 0, (Number(prev?._ts) || 0) + 1)
    const clean = normalizeCustomFood({ ...prev, ...food, id: prev.id, _ts: ts })
    if (!clean) return null
    const merged = {
      ...(isMap(prev._f) ? { _f: prev._f } : {}),
      ...(isMap(prev._u) ? { _u: prev._u } : {}),
      ...clean,
    }
    s.customFoods[idx] = merged
    return normalizeCustomFood(merged)
  }
  const clean = normalizeCustomFood({ ...food, id: wantId || uid(), _ts: Math.max(Number(now) || 0, 1) })
  if (!clean) return null
  s.customFoods.unshift(clean)
  return clean
}

/** Removes a saved food from `s.customFoods` by id and returns the removed normalized food. */
export function removeCustomFood(s, foodId) {
  if (!isMap(s) || !Array.isArray(s.customFoods) || foodId == null) return null
  const id = String(foodId)
  const idx = s.customFoods.findIndex(x => x && String(x.id) === id)
  if (idx < 0) return null
  const [removed] = s.customFoods.splice(idx, 1)
  return normalizeCustomFood(removed) || removed
}

/** Re-inserts a deleted custom food (preserving its `id` so `stampDeletions` records `-now`). */
export function restoreCustomFood(s, food, index = 0) {
  if (!isMap(s) || !isMap(food)) return null
  if (!Array.isArray(s.customFoods)) s.customFoods = []
  const clean = normalizeCustomFood(food)
  if (!clean) return null
  if (s.customFoods.some(x => x && String(x.id) === clean.id)) return clean
  const raw = {
    ...(isMap(food._f) ? { _f: food._f } : {}),
    ...(isMap(food._u) ? { _u: food._u } : {}),
    ...clean,
  }
  if (Number.isInteger(index) && index >= 0 && index <= s.customFoods.length) s.customFoods.splice(index, 0, raw)
  else s.customFoods.unshift(raw)
  return clean
}

/** Deduplicated recently logged foods across `S.nutritionLogs` (newest date & entry first). */
export function recentFoodsFromLogs(S, limit = 15) {
  if (!isMap(S?.nutritionLogs) || !(limit > 0)) return []
  const dates = Object.keys(S.nutritionLogs).filter(k => ISO.test(k)).sort().reverse()
  const mealOrder = [...MEAL_TYPES].reverse()
  const seen = new Set()
  const out = []
  for (const d of dates) {
    const raw = S.nutritionLogs[d]
    if (!isMap(raw?.meals)) continue
    for (const m of mealOrder) {
      const items = Array.isArray(raw.meals[m]) ? raw.meals[m] : []
      for (let i = items.length - 1; i >= 0; i--) {
        const it = normalizeMealEntry(items[i])
        if (!it || !it.name) continue
        const key = it.foodId ? `id:${it.foodId}` : `n:${it.name.toLowerCase()}|${it.serving.toLowerCase()}`
        if (seen.has(key)) continue
        seen.add(key)
        const baseQty = it.qty > 0 ? it.qty : 1
        out.push({
          name: it.name,
          serving: it.serving,
          kcal: cleanKcal(it.kcal / baseQty),
          protein: cleanMacro(it.protein / baseQty),
          carbs: cleanMacro(it.carbs / baseQty),
          fat: cleanMacro(it.fat / baseQty),
          ...(it.foodId ? { foodId: it.foodId } : {}),
        })
        if (out.length >= limit) return out
      }
    }
  }
  return out
}
