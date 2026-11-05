// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./api.js', () => ({ api: vi.fn(), setRemoteAuth: vi.fn() }))

import * as ServerStamps from '../../../api/sync-stamps.js'
import { DEF, restoredStateFor, useStore } from '../store/useStore.js'
import { mergeStates, resetIdsOf, sinceReset, stampChange } from './sync-merge.js'
import {
  DEFAULT_NUTRITION_GOALS,
  MEAL_TYPES,
  addMealEntry,
  copyDayEntries,
  copyMealEntries,
  customFoodsOf,
  dayTotals,
  hasNutritionData,
  kcalFromMacros,
  macroBreakdown,
  mealTotals,
  nutritionDay,
  nutritionGoalsOf,
  nutritionHistoryWindow,
  recentFoodsFromLogs,
  removeCustomFood,
  removeMealEntry,
  restoreCustomFood,
  restoreMealEntry,
  scaleFoodMacros,
  setNutritionGoals,
  shiftISO,
  sortedCustomFoods,
  updateMealEntry,
  upsertCustomFood,
} from './nutrition.js'

const clone = v => JSON.parse(JSON.stringify(v))

beforeEach(() => {
  localStorage.clear()
  useStore.setState({ S: { ...clone(DEF), _ts: 1 }, user: null, ready: true })
})

afterEach(() => {
  localStorage.clear()
})

describe('lib/nutrition pure domain helpers', () => {
  it('normalizes nutrition goals with tolerant fallbacks', () => {
    expect(nutritionGoalsOf(null)).toEqual(DEFAULT_NUTRITION_GOALS)
    expect(nutritionGoalsOf({})).toEqual(DEFAULT_NUTRITION_GOALS)
    expect(nutritionGoalsOf({ nutritionGoals: { kcal: 2650, protein: -10, carbs: '280', fat: NaN } })).toEqual({
      kcal: 2650,
      protein: DEFAULT_NUTRITION_GOALS.protein,
      carbs: 280,
      fat: DEFAULT_NUTRITION_GOALS.fat,
    })
  })

  it('computes kcalFromMacros, macroBreakdown, and scaleFoodMacros accurately', () => {
    expect(kcalFromMacros(30, 50, 10)).toBe(410)
    expect(kcalFromMacros(-5, 'bad', 0)).toBe(0)

    const bd = macroBreakdown(180, 250, 70)
    // 720 + 1000 + 630 = 2350 kcal
    expect(bd.kcal).toBe(2350)
    expect(bd.proteinKcal).toBe(720)
    expect(bd.carbsKcal).toBe(1000)
    expect(bd.fatKcal).toBe(630)
    expect(bd.proteinPct + bd.carbsPct + bd.fatPct).toBe(100)
    expect(macroBreakdown(0, 0, 0)).toMatchObject({ kcal: 0, proteinPct: 0, carbsPct: 0, fatPct: 0 })

    expect(scaleFoodMacros({ kcal: 155, protein: 13, carbs: 1.2, fat: 11 }, 1.5)).toEqual({
      qty: 1.5,
      kcal: 233,
      protein: 19.5,
      carbs: 1.8,
      fat: 16.5,
    })
  })

  it('shifts ISO dates cleanly and builds a 7-day history window', () => {
    expect(shiftISO('2026-11-01', -1)).toBe('2026-10-31')
    expect(shiftISO('2026-12-31', 1)).toBe('2027-01-01')
    expect(shiftISO('bad-date', 1)).toBe('')

    const s = {}
    setNutritionGoals(s, { kcal: 2000 })
    addMealEntry(s, '2026-11-03', 'lunch', { name: 'Bowl', kcal: 1850 }, 100)
    addMealEntry(s, '2026-11-05', 'dinner', { name: 'Feast', kcal: 2300 }, 200)

    const win = nutritionHistoryWindow(s, '2026-11-05', 7)
    expect(win).toHaveLength(7)
    expect(win[0].date).toBe('2026-10-30')
    expect(win[6].date).toBe('2026-11-05')
    expect(win[0]).toMatchObject({ kcal: 0, logged: false, over: false })
    expect(win.find(d => d.date === '2026-11-03')).toMatchObject({ kcal: 1850, logged: true, over: false })
    expect(win[6]).toMatchObject({ kcal: 2300, logged: true, over: true })
  })

  it('copies individual meals and full days with fresh IDs without mutating source logs', () => {
    const s = {}
    const orig1 = addMealEntry(s, '2026-11-04', 'breakfast', { name: 'Oats', kcal: 350, protein: 14 }, 100)
    const orig2 = addMealEntry(s, '2026-11-04', 'dinner', { name: 'Salmon', kcal: 520, protein: 42 }, 200)

    const mealCopied = copyMealEntries(s, '2026-11-04', '2026-11-05', 'breakfast', 300)
    expect(mealCopied).toHaveLength(1)
    expect(mealCopied[0].id).not.toBe(orig1.id)
    expect(nutritionDay(s, '2026-11-05').meals.breakfast[0]).toMatchObject({ name: 'Oats', kcal: 350 })
    expect(nutritionDay(s, '2026-11-05').meals.dinner).toHaveLength(0)

    const dayCopied = copyDayEntries(s, '2026-11-04', '2026-11-06', 400)
    expect(dayCopied.count).toBe(2)
    expect(dayTotals(nutritionDay(s, '2026-11-06')).kcal).toBe(870)
    expect(dayCopied.entriesByMeal.dinner[0].id).not.toBe(orig2.id)
  })

  it('normalizes day logs and computes meal & day totals cleanly', () => {
    expect(MEAL_TYPES).toEqual(['breakfast', 'lunch', 'dinner', 'snacks'])
    const empty = nutritionDay({}, '2026-11-05')
    expect(empty).toEqual({
      meals: { breakfast: [], lunch: [], dinner: [], snacks: [] },
      _ts: 0,
    })
    expect(dayTotals(empty)).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0 })

    const s = {}
    const e1 = addMealEntry(s, '2026-11-05', 'breakfast', {
      name: '  Oats & milk ',
      serving: '150 g',
      kcal: 320.4,
      protein: 16.24,
      carbs: 48.1,
      fat: 7.05,
    }, 1000)
    const e2 = addMealEntry(s, '2026-11-05', 'lunch', {
      name: 'Chicken & rice',
      serving: '300 g',
      kcal: 540,
      protein: 48,
      carbs: 62,
      fat: 9,
    }, 1005)

    expect(e1.name).toBe('Oats & milk')
    expect(e1.kcal).toBe(320)
    expect(e1.protein).toBe(16.2)
    expect(e2.id).toBeTruthy()

    const day = nutritionDay(s, '2026-11-05')
    expect(mealTotals(day.meals.breakfast)).toEqual({ kcal: 320, protein: 16.2, carbs: 48.1, fat: 7.1 })
    expect(dayTotals(day)).toEqual({ kcal: 860, protein: 64.2, carbs: 110.1, fat: 16.1 })
    expect(hasNutritionData(s)).toBe(true)
  })

  it('updates, moves, removes, and restores meal entries cleanly', () => {
    const s = {}
    const first = addMealEntry(s, '2026-11-05', 'lunch', { name: 'Soup', kcal: 120 }, 900)
    const added = addMealEntry(s, '2026-11-05', 'lunch', {
      name: 'Greek yogurt',
      serving: '200 g',
      kcal: 190,
      protein: 20,
      carbs: 9,
      fat: 4,
    }, 1000)

    const moved = updateMealEntry(s, '2026-11-05', 'lunch', added.id, {
      meal: 'snacks',
      qty: 1.5,
      kcal: 285,
      protein: 30,
    }, 2000)

    expect(moved.kcal).toBe(285)
    expect(moved.qty).toBe(1.5)
    expect(nutritionDay(s, '2026-11-05').meals.lunch.map(x => x.id)).toEqual([first.id])
    expect(nutritionDay(s, '2026-11-05').meals.snacks).toHaveLength(1)

    const removed = removeMealEntry(s, '2026-11-05', 'snacks', added.id, 3000)
    removeMealEntry(s, '2026-11-05', 'lunch', first.id, 3001)
    expect(removed?.id).toBe(added.id)
    const afterDay = nutritionDay(s, '2026-11-05')
    expect(dayTotals(afterDay).kcal).toBe(0)
    expect(afterDay._ts).toBe(3001)
    expect(hasNutritionData(s)).toBe(false)

    restoreMealEntry(s, '2026-11-05', 'snacks', removed, 0, 3500)
    expect(nutritionDay(s, '2026-11-05').meals.snacks[0]).toMatchObject({ id: added.id, kcal: 285 })
  })

  it('sorts favourites first, restores deleted custom foods, and deduplicates recent foods', () => {
    const s = {}
    const plain = upsertCustomFood(s, { name: 'Apple', serving: '1 pc', kcal: 95, carbs: 25, fav: false }, 100)
    const fav = upsertCustomFood(s, {
      name: 'Whey Isolate',
      serving: '1 scoop (30 g)',
      kcal: 120,
      protein: 25,
      carbs: 2,
      fat: 1,
      fav: true,
    }, 50)
    expect(sortedCustomFoods(s).map(f => f.id)).toEqual([fav.id, plain.id])

    upsertCustomFood(s, { id: fav.id, kcal: 125 }, 200)
    expect(customFoodsOf(s).find(f => f.id === fav.id)).toMatchObject({ name: 'Whey Isolate', kcal: 125, fav: true })

    addMealEntry(s, '2026-11-04', 'Breakfast', { name: 'Banana', serving: '1 medium', kcal: 105, protein: 1.3, carbs: 27, fat: 0.4 }, 300)
    addMealEntry(s, '2026-11-05', 'snacks', { name: 'Whey Isolate', serving: '1 scoop (30 g)', qty: 2, kcal: 250, protein: 50, carbs: 4, fat: 2, foodId: fav.id }, 400)
    addMealEntry(s, '2026-11-05', 'breakfast', { name: 'banana', serving: '1 medium', kcal: 105, protein: 1.3, carbs: 27, fat: 0.4 }, 350)

    const recent = recentFoodsFromLogs(s, 10)
    expect(recent).toHaveLength(2)
    expect(recent[0]).toMatchObject({ name: 'Whey Isolate', kcal: 125, protein: 25, foodId: fav.id })
    expect(recent[1]).toMatchObject({ name: 'banana', kcal: 105 })

    const removed = removeCustomFood(s, fav.id)
    expect(removed?.id).toBe(fav.id)
    expect(customFoodsOf(s).map(f => f.id)).toEqual([plain.id])
    restoreCustomFood(s, removed, 0)
    expect(customFoodsOf(s).map(f => f.id)).toEqual([fav.id, plain.id])
  })
})

describe('useStore persistence & sync-merge integration', () => {
  it('persists nutrition state to localStorage without touching workouts, routines, or bodyweight', () => {
    vi.useFakeTimers()
    try {
      const existingWorkout = { id: 'w1', d: '2026-11-04', start: 100, end: 200, entries: [{ id: '0025', sets: [{ w: 100, r: 5, done: true }] }] }
      useStore.getState().update(s => {
        s.workouts = [existingWorkout]
        s.bodyweight = [{ d: '2026-11-04', w: 80.5, t: 150 }]
      })

      useStore.getState().update(s => {
        setNutritionGoals(s, { kcal: 2500, protein: 180 })
        const food = upsertCustomFood(s, { name: 'Skyr', serving: '200 g', kcal: 130, protein: 22, carbs: 8, fat: 0.5 })
        addMealEntry(s, '2026-11-05', 'breakfast', { ...food, foodId: food.id })
      })

      vi.advanceTimersByTime(500)
      const savedRaw = JSON.parse(localStorage.getItem('gym_state_v1'))
      expect(savedRaw.nutritionGoals).toEqual({ kcal: 2500, protein: 180, carbs: 220, fat: 70 })
      expect(savedRaw.customFoods).toHaveLength(1)
      expect(dayTotals(savedRaw.nutritionLogs['2026-11-05']).kcal).toBe(130)
      expect(savedRaw.workouts).toEqual([existingWorkout])
      expect(savedRaw.bodyweight).toHaveLength(1)

      const nutritionOnlyLocal = { ...clone(DEF), _ts: 500, customFoods: [{ id: 'cf1', name: 'Oats', kcal: 300, _ts: 500 }] }
      expect(restoredStateFor(nutritionOnlyLocal, { ...clone(DEF), _ts: 100 }, true)).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('merges nutritionGoals, nutritionLogs across days, and customFoods with deletion tombstones & server parity', () => {
    const T = 1_800_000_000_000
    const change = (prev, wall, mut) => {
      const next = clone(prev)
      mut(next)
      next._ts = stampChange(prev, next, wall)
      return next
    }

    const base = change(clone(DEF), T, s => {
      upsertCustomFood(s, { id: 'f1', name: 'Oats', serving: '100 g', kcal: 370, protein: 13, carbs: 60, fat: 7 }, T)
      upsertCustomFood(s, { id: 'f2', name: 'Whey', serving: '30 g', kcal: 120, protein: 24, carbs: 2, fat: 1 }, T)
      addMealEntry(s, '2026-11-04', 'breakfast', { id: 'e1', name: 'Oats', kcal: 370, protein: 13, carbs: 60, fat: 7 }, T)
    })

    const devA = change(base, T + 1000, s => {
      setNutritionGoals(s, { kcal: 2600 })
      upsertCustomFood(s, { id: 'f1', protein: 14 }, T + 1000)
      removeCustomFood(s, 'f2')
      addMealEntry(s, '2026-11-05', 'lunch', { id: 'e2', name: 'Rice & beef', kcal: 650, protein: 45, carbs: 70, fat: 18 }, T + 1000)
    })

    const devB = change(base, T + 2000, s => {
      upsertCustomFood(s, { id: 'f1', name: 'Rolled Oats' }, T + 2000)
      removeMealEntry(s, '2026-11-04', 'breakfast', 'e1', T + 2000)
      addMealEntry(s, '2026-11-06', 'dinner', { id: 'e3', name: 'Salmon', kcal: 480, protein: 42, carbs: 0, fat: 32 }, T + 2000)
    })

    const serverCopy = clone(devA)
    ServerStamps.stampPut(base, serverCopy, { overRead: true, stamped: true, now: T + 1500 })

    for (const merged of [mergeStates(devB, serverCopy), mergeStates(serverCopy, devB)]) {
      expect(merged.nutritionGoals.kcal).toBe(2600)
      expect(merged.customFoods.map(f => f.id)).toEqual(['f1'])
      expect(merged.customFoods[0]).toMatchObject({ id: 'f1', name: 'Rolled Oats', protein: 14 })
      expect(dayTotals(merged.nutritionLogs['2026-11-04']).kcal).toBe(0)
      expect(dayTotals(merged.nutritionLogs['2026-11-05']).kcal).toBe(650)
      expect(dayTotals(merged.nutritionLogs['2026-11-06']).kcal).toBe(480)
    }

    const ids = resetIdsOf(devA)
    expect(ids.customFoods).toContain('f1')
    expect(ids.nutritionLogs).toContain('2026-11-05')
    const wiped = sinceReset(devA, T + 5000, ids)
    expect(wiped.customFoods).toEqual([])
    expect(wiped.nutritionLogs).toEqual({})
  })
})
