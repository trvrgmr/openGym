import { describe, it, expect } from 'vitest'
import {
  buildUnifiedCoachContext,
  nutritionForCoach,
  buildTodaySnapshot,
  buildRollingTrends,
  buildWorkoutAlignment,
  movementPatternOf,
  formatCoachMarkdown,
  formatCompactJson,
} from './coach-context-builder.js'
import { addMealEntry } from './nutrition.js'

describe('coach-context-builder', () => {
  const TODAY = '2026-11-06'
  const NOW = new Date(`${TODAY}T12:00:00Z`).getTime()

  // Bench press (0025) and Squat (0043)
  const BENCH_ID = '0025'
  const SQUAT_ID = '0043'

  function sampleState(overrides = {}) {
    const S = {
      unit: 'kg',
      nutritionGoals: { kcal: 2200, protein: 160, carbs: 220, fat: 70 },
      nutritionLogs: {},
      bodyweight: [{ d: '2026-11-01', w: 80 }],
      workouts: [],
      routines: [
        { id: 'r1', name: 'Push Day' },
        { id: 'r2', name: 'Leg Day' },
      ],
      ...overrides,
    }
    return S
  }

  describe("Today's Snapshot", () => {
    it('calculates calories, macros, target percentages, and calorie shares', () => {
      const S = sampleState()
      // Breakfast: 500 kcal, 40g P, 50g C, 15g F
      addMealEntry(S, TODAY, 'breakfast', { name: 'Eggs & Oats', kcal: 500, protein: 40, carbs: 50, fat: 15 }, NOW)
      // Lunch: 600 kcal, 45g P, 65g C, 18g F
      addMealEntry(S, TODAY, 'lunch', { name: 'Chicken & Rice', kcal: 600, protein: 45, carbs: 65, fat: 18 }, NOW)

      const snap = buildTodaySnapshot(S, NOW)
      expect(snap.date).toBe(TODAY)
      expect(snap.kcal).toBe(1100)
      expect(snap.targetKcal).toBe(2200)
      expect(snap.deltaKcal).toBe(-1100)

      expect(snap.protein).toBe(85)
      expect(snap.targetProtein).toBe(160)
      expect(snap.proteinPctOfTarget).toBe(53) // 85 / 160 = 53%

      expect(snap.carbs).toBe(115)
      expect(snap.targetCarbs).toBe(220)
      expect(snap.carbsPctOfTarget).toBe(52) // 115 / 220 = 52%

      expect(snap.fat).toBe(33)
      expect(snap.targetFat).toBe(70)
      expect(snap.fatPctOfTarget).toBe(47) // 33 / 70 = 47%

      expect(snap.proteinKcalPct).toBeGreaterThan(0)
      expect(snap.carbsKcalPct).toBeGreaterThan(0)
      expect(snap.fatKcalPct).toBeGreaterThan(0)
      expect(snap.hasLoggedMeals).toBe(true)
    })

    it('detects completed workouts today and active running workouts', () => {
      const S = sampleState({
        workouts: [
          {
            id: 'w1',
            d: TODAY,
            routineId: 'r1',
            name: 'Push Day',
            duration: 45 * 60000,
            entries: [
              {
                id: BENCH_ID,
                sets: [
                  { done: true, w: 80, r: 8 },
                  { done: true, w: 80, r: 8 },
                  { warmup: true, done: true, w: 40, r: 10 },
                ],
              },
            ],
          },
        ],
        active: {
          start: NOW - 20 * 60000,
          name: 'Extra Arms',
          entries: [
            {
              id: '0030',
              sets: [{ done: true, w: 15, r: 12 }],
            },
          ],
        },
      })

      const snap = buildTodaySnapshot(S, NOW)
      expect(snap.isWorkoutDay).toBe(true)
      expect(snap.hasLoggedWorkouts).toBe(true)
      expect(snap.completedSessions).toHaveLength(1)
      expect(snap.completedSessions[0].name).toBe('Push Day')
      expect(snap.completedSessions[0].workSets).toBe(2)
      expect(snap.completedSessions[0].totalVolume).toBe(1280) // 80 * 8 * 2
      expect(snap.completedSessions[0].durationMinutes).toBe(45)

      expect(snap.activeSession).not.toBeNull()
      expect(snap.activeSession.name).toBe('Extra Arms')
      expect(snap.activeSession.minutes).toBe(20)
      expect(snap.activeSession.workSets).toBe(1)
      expect(snap.activeSession.totalVolume).toBe(180) // 15 * 12
    })
  })

  describe('Missing log detection', () => {
    it('flags missing meals when workout is logged without food', () => {
      const S = sampleState({
        workouts: [{ id: 'w1', d: TODAY, name: 'Morning Run', entries: [{ id: '0001', sets: [{ done: true, w: 10, r: 10 }] }] }],
      })
      const snap = buildTodaySnapshot(S, NOW)
      expect(snap.hasLoggedMeals).toBe(false)
      expect(snap.hasLoggedWorkouts).toBe(true)
      expect(snap.missingLogs.meals).toBe(true)
      expect(snap.missingLogs.workouts).toBe(false)
    })

    it('flags missing workouts when meals are logged without training', () => {
      const S = sampleState()
      addMealEntry(S, TODAY, 'dinner', { name: 'Steak', kcal: 700, protein: 60, carbs: 10, fat: 35 }, NOW)
      const snap = buildTodaySnapshot(S, NOW)
      expect(snap.hasLoggedMeals).toBe(true)
      expect(snap.hasLoggedWorkouts).toBe(false)
      expect(snap.missingLogs.meals).toBe(false)
      expect(snap.missingLogs.workouts).toBe(true)
    })

    it('flags both when nothing is logged', () => {
      const S = sampleState()
      const snap = buildTodaySnapshot(S, NOW)
      expect(snap.hasLoggedMeals).toBe(false)
      expect(snap.hasLoggedWorkouts).toBe(false)
      expect(snap.missingLogs.meals).toBe(true)
      expect(snap.missingLogs.workouts).toBe(true)
    })
  })

  describe('Rolling 7-Day & 14-Day Trends', () => {
    it('calculates averages, adherence rate, protein per kg, workout frequency, and volume', () => {
      const S = sampleState({
        bodyweight: [{ d: '2026-11-01', w: 80 }],
        workouts: [
          {
            id: 'w1',
            d: '2026-11-04',
            name: 'Chest',
            entries: [{ id: BENCH_ID, sets: [{ done: true, w: 100, r: 5 }] }],
          },
          {
            id: 'w2',
            d: '2026-11-06',
            name: 'Chest 2',
            entries: [{ id: BENCH_ID, sets: [{ done: true, w: 105, r: 5 }] }],
          },
        ],
      })

      // Log 4 days of food
      addMealEntry(S, '2026-11-03', 'lunch', { name: 'M1', kcal: 2200, protein: 160, carbs: 200, fat: 70 }, NOW)
      addMealEntry(S, '2026-11-04', 'lunch', { name: 'M2', kcal: 2100, protein: 155, carbs: 210, fat: 65 }, NOW)
      addMealEntry(S, '2026-11-05', 'lunch', { name: 'M3', kcal: 2300, protein: 165, carbs: 220, fat: 75 }, NOW)
      addMealEntry(S, '2026-11-06', 'lunch', { name: 'M4', kcal: 1500, protein: 120, carbs: 150, fat: 45 }, NOW)

      const trends7 = buildRollingTrends(S, TODAY, 7)
      expect(trends7.days).toBe(7)
      expect(trends7.daysLogged).toBe(4)
      expect(trends7.loggingRate).toBe(57) // 4 / 7 = 57%
      expect(trends7.avgDailyKcal).toBe(2025) // (2200 + 2100 + 2300 + 1500) / 4
      expect(trends7.avgDailyProtein).toBe(150) // (160 + 155 + 165 + 120) / 4

      // Adherence (+-15% of 2200 is 1870..2530 kcal) -> 3 out of 4 days adherent
      expect(trends7.adherentDays).toBe(3)
      expect(trends7.adherenceRate).toBe(75) // 3 / 4

      // Protein per kg bodyweight (150 g / 80 kg = 1.88 g/kg)
      expect(trends7.proteinPerKg).toBe(1.88)

      // Workout counts and volume
      expect(trends7.workoutCount).toBe(2)
      expect(trends7.totalVolume).toBe(1025) // 100*5 + 105*5 = 500 + 525 = 1025
      expect(trends7.avgVolumePerWorkout).toBe(513)

      // Progressions on Bench Press (100x5 -> 105x5)
      expect(trends7.progressions.length).toBeGreaterThan(0)
      const prog = trends7.progressions.find(p => p.exerciseId === BENCH_ID)
      expect(prog).toBeDefined()
      expect(prog.delta).toBeGreaterThan(0)
      expect(prog.metric).toBe('e1RM')
    })

    it('aggregates volume by muscle group and movement pattern', () => {
      const S = sampleState({
        workouts: [
          {
            id: 'w1',
            d: '2026-11-05',
            name: 'Legs & Chest',
            entries: [
              { id: BENCH_ID, sets: [{ done: true, w: 100, r: 10 }] }, // 1000 vol
              { id: SQUAT_ID, sets: [{ done: true, w: 120, r: 10 }] }, // 1200 vol
            ],
          },
        ],
      })

      const trends = buildRollingTrends(S, TODAY, 7)
      expect(trends.volumeByMovementPattern.horizontal_push).toBe(1000)
      expect(trends.volumeByMovementPattern.squat).toBe(1200)
      expect(Object.keys(trends.volumeByMuscle).length).toBeGreaterThan(0)
    })
  })

  describe('Movement pattern classifier', () => {
    it('accurately identifies common movement patterns', () => {
      expect(movementPatternOf({ n: 'barbell bench press', bp: 'chest', tg: 'pectorals' })).toBe('horizontal_push')
      expect(movementPatternOf({ n: 'dumbbell overhead press', bp: 'shoulders', tg: 'delts' })).toBe('vertical_push')
      expect(movementPatternOf({ n: 'barbell squat', bp: 'upper legs', tg: 'quads' })).toBe('squat')
      expect(movementPatternOf({ n: 'romanian deadlift', bp: 'upper legs', tg: 'hamstrings' })).toBe('hinge')
      expect(movementPatternOf({ n: 'barbell bent over row', bp: 'back', tg: 'upper back' })).toBe('horizontal_pull')
      expect(movementPatternOf({ n: 'lat pulldown', bp: 'back', tg: 'lats' })).toBe('vertical_pull')
      expect(movementPatternOf({ n: 'plank', bp: 'waist', tg: 'abs' })).toBe('core')
      expect(movementPatternOf({ n: 'bicep curl', bp: 'upper arms', tg: 'biceps' })).toBe('arms')
      expect(movementPatternOf(null)).toBe('other')
    })
  })

  describe('Pre/Post-Workout Nutrition Alignment', () => {
    it('compares training days vs rest days calories and carbs', () => {
      const S = sampleState({
        workouts: [
          { id: 'w1', d: '2026-11-04', entries: [{ id: BENCH_ID, sets: [{ done: true, w: 100, r: 5 }] }] },
          { id: 'w2', d: '2026-11-06', entries: [{ id: BENCH_ID, sets: [{ done: true, w: 100, r: 5 }] }] },
        ],
      })
      // Training days (Nov 4 and Nov 6)
      addMealEntry(S, '2026-11-04', 'lunch', { name: 'M1', kcal: 2400, protein: 160, carbs: 260, fat: 70 }, NOW)
      addMealEntry(S, '2026-11-06', 'lunch', { name: 'M2', kcal: 2600, protein: 170, carbs: 280, fat: 75 }, NOW)
      // Rest day (Nov 5)
      addMealEntry(S, '2026-11-05', 'lunch', { name: 'M3', kcal: 1900, protein: 150, carbs: 160, fat: 60 }, NOW)

      const align = buildWorkoutAlignment(S, TODAY, 7)
      expect(align.trainingDaysCount).toBe(2)
      expect(align.restDaysCount).toBe(1)
      expect(align.avgTrainingKcal).toBe(2500) // (2400 + 2600) / 2
      expect(align.avgTrainingCarbs).toBe(270) // (260 + 280) / 2
      expect(align.avgRestKcal).toBe(1900)
      expect(align.avgRestCarbs).toBe(160)
      expect(align.carbDeltaTrainingVsRest).toBe(110) // 270 - 160 = +110g carbs on training days
      expect(align.kcalDeltaTrainingVsRest).toBe(600) // 2500 - 1900 = +600 kcal
      expect(align.hasUnderfueledHeavyDays).toBe(false)
    })

    it('detects under-fueled heavy training sessions', () => {
      const S = sampleState({
        nutritionGoals: { kcal: 2500, protein: 160, carbs: 250, fat: 70 },
        workouts: [
          {
            id: 'w1',
            d: '2026-11-04',
            name: 'Heavy Leg Day',
            entries: [{ id: SQUAT_ID, sets: [{ done: true, w: 150, r: 10 }, { done: true, w: 150, r: 10 }] }], // 3000 vol
          },
          {
            id: 'w2',
            d: '2026-11-05',
            name: 'Light Recovery',
            entries: [{ id: BENCH_ID, sets: [{ done: true, w: 40, r: 10 }] }], // 400 vol
          },
        ],
      })
      // Heavy day only got 1600 kcal (> 20% deficit from 2500 kcal goal, which is 36% deficit)
      addMealEntry(S, '2026-11-04', 'lunch', { name: 'Salad', kcal: 1600, protein: 100, carbs: 120, fat: 40 }, NOW)
      addMealEntry(S, '2026-11-05', 'lunch', { name: 'Normal', kcal: 2400, protein: 150, carbs: 240, fat: 65 }, NOW)

      const align = buildWorkoutAlignment(S, TODAY, 7)
      expect(align.hasUnderfueledHeavyDays).toBe(true)
      expect(align.underfueledSessions).toHaveLength(1)
      expect(align.underfueledSessions[0].date).toBe('2026-11-04')
      expect(align.underfueledSessions[0].deficitPct).toBe(36) // (2500 - 1600) / 2500 = 36%
    })
  })

  describe('Division-by-zero & null safety guards', () => {
    it('handles null, undefined, empty state without throwing', () => {
      const resNull = buildUnifiedCoachContext(null)
      expect(resNull).toBeDefined()
      expect(resNull.raw.today.kcal).toBe(0)
      expect(resNull.raw.today.proteinPctOfTarget).toBe(0)
      expect(resNull.raw.trends.d7.avgDailyKcal).toBe(0)
      expect(resNull.raw.trends.d7.proteinPerKg).toBeNull()
      expect(resNull.raw.alignment.avgTrainingKcal).toBe(0)

      const resEmpty = buildUnifiedCoachContext({})
      expect(resEmpty).toBeDefined()
      expect(resEmpty.raw.today.hasLoggedMeals).toBe(false)
      expect(resEmpty.raw.today.hasLoggedWorkouts).toBe(false)
    })

    it('handles 0 target calories, empty logs, and 0 weight without division-by-zero', () => {
      const S = {
        nutritionGoals: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
        nutritionLogs: {},
        bodyweight: [{ d: TODAY, w: 0 }],
        workouts: [],
      }
      const ctx = buildUnifiedCoachContext(S, NOW)
      expect(ctx.raw.today.deltaKcal).toBe(0)
      expect(ctx.raw.today.proteinPctOfTarget).toBe(0)
      expect(ctx.raw.today.carbsPctOfTarget).toBe(0)
      expect(ctx.raw.today.fatPctOfTarget).toBe(0)
      expect(ctx.raw.trends.d7.adherenceRate).toBe(0)
      expect(ctx.raw.trends.d7.proteinPerKg).toBeNull()
      expect(ctx.raw.trends.d14.proteinPerKg).toBeNull()
      expect(ctx.raw.alignment.hasUnderfueledHeavyDays).toBe(false)
    })
  })

  describe('Compact markdown and JSON formatting', () => {
    it('generates deterministic markdown summary table and valid compact JSON', () => {
      const S = sampleState()
      addMealEntry(S, TODAY, 'lunch', { name: 'Chicken Bowl', kcal: 750, protein: 55, carbs: 70, fat: 20 }, NOW)
      const ctx = buildUnifiedCoachContext(S, NOW)

      expect(ctx.summaryMarkdown).toContain('### Unified Nutrition & Workout Context')
      expect(ctx.summaryMarkdown).toContain(`**Today (${TODAY}):**`)
      expect(ctx.summaryMarkdown).toContain('| Calories |')
      expect(ctx.summaryMarkdown).toContain('Rolling Trends:')
      expect(ctx.summaryMarkdown).toContain('Pre/Post-Workout Nutrition Alignment:')

      expect(typeof ctx.compactJson).toBe('string')
      const parsed = JSON.parse(ctx.compactJson)
      expect(parsed.today.d).toBe(TODAY)
      expect(parsed.today.kcal).toBe(750)
      expect(parsed.trends7d).toBeDefined()
      expect(parsed.trends14d).toBeDefined()
      expect(parsed.alignment).toBeDefined()
    })
  })

  describe('nutritionForCoach export parity', () => {
    it('returns the same payload structure as buildUnifiedCoachContext', () => {
      const S = sampleState()
      const c1 = buildUnifiedCoachContext(S, NOW)
      const c2 = nutritionForCoach(S, NOW)
      expect(c1.summaryMarkdown).toBe(c2.summaryMarkdown)
      expect(c1.compactJson).toBe(c2.compactJson)
      expect(c1.raw.today.date).toBe(c2.raw.today.date)
    })
  })
})
