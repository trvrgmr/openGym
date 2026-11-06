import {
  nutritionGoalsOf,
  nutritionDay,
  dayTotals,
  hasLoggedMeals,
  macroBreakdown,
  nutritionHistoryWindow,
  shiftISO,
} from './nutrition.js'
import { isoOf } from './format.js'
import {
  workSetsDone,
  sessionVolume,
  workoutVolume,
  lastBW,
  effectiveRoutineIds,
  countsBodyweight,
} from './history.js'
import { bodyweightFor } from './bw-load.js'
import { bestSetOf } from './onerm.js'
import { EXIDX } from './exercises.js'
import { muscleGroupsOf } from './muscles.js'

const round1 = n => Math.round(n * 10) / 10
const round2 = n => Math.round(n * 100) / 100

/**
 * Classifies an exercise into a fundamental movement pattern.
 */
export function movementPatternOf(ex) {
  if (!ex) return 'other'
  const name = String(ex.n || ex.name || '').toLowerCase()
  const tg = String(ex.tg || '').toLowerCase()
  const bp = String(ex.bp || '').toLowerCase()

  if (/\bsquat\b|leg press|hack squat|\blunge\b|step[- ]?up/.test(name) || tg === 'quads' || tg === 'quadriceps') {
    return 'squat'
  }
  if (/\bdeadlift\b|\brdl\b|good morning|hip thrust|hyperextension/.test(name) || tg === 'hamstrings' || tg === 'hamstring' || tg === 'glutes' || tg === 'gluteal') {
    return 'hinge'
  }
  if (/\bbench\b|chest press|push[- ]?up|\bdip\b/.test(name) || tg === 'pectorals' || tg === 'chest' || bp === 'chest') {
    return 'horizontal_push'
  }
  if (/overhead press|shoulder press|military press|arnold press|pike push/.test(name) || (bp === 'shoulders' && !/lateral|rear|fly/i.test(name))) {
    return 'vertical_push'
  }
  if (/\brow\b/.test(name)) {
    return 'horizontal_pull'
  }
  if (/pull[- ]?up|chin[- ]?up|lat pull|pulldown/.test(name) || tg === 'lats') {
    return 'vertical_pull'
  }
  if (bp === 'waist' || tg === 'abs' || tg === 'obliques' || /\bplank\b|crunch/.test(name)) {
    return 'core'
  }
  if (bp === 'upper arms' || tg === 'biceps' || tg === 'triceps') {
    return 'arms'
  }
  if (bp === 'shoulders' || tg === 'delts' || tg === 'deltoids') {
    return 'shoulders'
  }
  if (bp === 'lower legs' || tg === 'calves') {
    return 'calves'
  }
  return 'other'
}

/**
 * Calculates volume of one exercise entry within a session.
 */
function entryVolumeOf(e, w, S) {
  if (!e || !Array.isArray(e.sets) || !e.sets.length) return 0
  const bodyweight = countsBodyweight(S) ? bodyweightFor(w, S) : 0
  return Math.max(0, Number(workoutVolume({ entries: [e] }, { warmups: false, bodyweight })) || 0)
}

/**
 * Normalizes Date or epoch timestamp to local date string and epoch ms.
 */
function parseTime(now) {
  const epoch = typeof now === 'number' && Number.isFinite(now)
    ? now
    : (now instanceof Date && Number.isFinite(now.getTime()) ? now.getTime() : Date.now())
  const d = new Date(epoch)
  const todayISO = isoOf(d)
  return { epoch, todayISO }
}

/**
 * Resolves bodyweight in kg from state using lastBW(S).
 */
function bodyweightKgOf(S) {
  const entry = Array.isArray(S?.bodyweight) && S.bodyweight.length ? lastBW(S) : null
  const w = Number(entry?.w)
  if (!Number.isFinite(w) || w <= 0) return null
  return S?.unit === 'lb' ? round1(w * 0.45359237) : round1(w)
}

/**
 * Builds Today's Snapshot: calories, macros, workout status, and missing logs flags.
 */
export function buildTodaySnapshot(S, now) {
  const { epoch, todayISO } = parseTime(now)
  const goals = nutritionGoalsOf(S)
  const rawGoals = S && typeof S.nutritionGoals === 'object' && S.nutritionGoals !== null ? S.nutritionGoals : {}
  const day = nutritionDay(S, todayISO)
  const totals = dayTotals(day)
  const loggedMeals = hasLoggedMeals(day)

  const kcal = totals.kcal
  const targetKcal = Number(rawGoals.kcal) === 0 ? 0 : goals.kcal
  const deltaKcal = kcal - targetKcal

  const breakdown = macroBreakdown(totals.protein, totals.carbs, totals.fat)

  const targetProtein = Number(rawGoals.protein) === 0 ? 0 : goals.protein
  const targetCarbs = Number(rawGoals.carbs) === 0 ? 0 : goals.carbs
  const targetFat = Number(rawGoals.fat) === 0 ? 0 : goals.fat

  const proteinPctOfTarget = targetProtein > 0 ? Math.round((totals.protein / targetProtein) * 100) : 0
  const carbsPctOfTarget = targetCarbs > 0 ? Math.round((totals.carbs / targetCarbs) * 100) : 0
  const fatPctOfTarget = targetFat > 0 ? Math.round((totals.fat / targetFat) * 100) : 0

  // Completed workouts today
  const allWorkouts = Array.isArray(S?.workouts) ? S.workouts : []
  const completedToday = allWorkouts.filter(w => w?.d === todayISO)
  const completedSessions = completedToday.map(w => ({
    id: w.id || null,
    name: w.name || (w.routineId && S?.routines ? S.routines.find(r => r.id === w.routineId)?.name : null) || 'Workout',
    workSets: workSetsDone(w),
    totalVolume: sessionVolume(w, S),
    durationMinutes: w.duration
      ? Math.max(0, Math.round(w.duration / 60000))
      : (w.start && w.end ? Math.max(0, Math.round((w.end - w.start) / 60000)) : null),
  }))

  // Active workout running now
  const a = S?.active
  const hasActive = Boolean(
    a && a.editingWorkoutId == null && Array.isArray(a.entries) && a.entries.length > 0
  )
  const activeSession = hasActive ? {
    name: a.name || null,
    minutes: a.start ? Math.max(0, Math.round((epoch - a.start) / 60000)) : 0,
    workSets: workSetsDone(a),
    totalVolume: workoutVolume(a),
    entriesCount: (a.entries || []).length,
  } : null

  // Is today a workout day
  let plannedRoutines = []
  if (S?.dayPlan && S?.week && Array.isArray(S?.routines)) {
    try {
      if (typeof effectiveRoutineIds === 'function') {
        plannedRoutines = effectiveRoutineIds(S, todayISO, todayISO)
      }
    } catch {
      plannedRoutines = []
    }
  }
  const isWorkoutDay = completedSessions.length > 0 || hasActive || (Array.isArray(plannedRoutines) && plannedRoutines.length > 0)

  const hasLoggedWorkouts = completedSessions.length > 0 || hasActive
  const missingLogs = {
    meals: !loggedMeals,
    workouts: !hasLoggedWorkouts,
  }

  return {
    date: todayISO,
    kcal,
    targetKcal,
    deltaKcal,
    protein: totals.protein,
    targetProtein,
    proteinPctOfTarget,
    carbs: totals.carbs,
    targetCarbs,
    carbsPctOfTarget,
    fat: totals.fat,
    targetFat,
    fatPctOfTarget,
    proteinKcalPct: breakdown.proteinPct,
    carbsKcalPct: breakdown.carbsPct,
    fatKcalPct: breakdown.fatPct,
    isWorkoutDay,
    completedSessions,
    activeSession,
    hasLoggedMeals: loggedMeals,
    hasLoggedWorkouts,
    missingLogs,
  }
}

/**
 * Builds rolling window summary (7-day or 14-day) covering nutrition, training volume,
 * muscle/movement breakdowns, and e1RM progressions.
 */
export function buildRollingTrends(S, todayISO, days = 7) {
  const windowDays = Math.max(1, Math.trunc(Number(days) || 7))
  const history = nutritionHistoryWindow(S, todayISO, windowDays)

  const loggedDays = history.filter(d => d.logged)
  const daysLogged = loggedDays.length
  const loggingRate = Math.round((daysLogged / windowDays) * 100)

  const totalKcal = loggedDays.reduce((sum, d) => sum + (d.kcal || 0), 0)
  const totalProtein = loggedDays.reduce((sum, d) => sum + (d.protein || 0), 0)
  const totalCarbs = loggedDays.reduce((sum, d) => sum + (d.carbs || 0), 0)
  const totalFat = loggedDays.reduce((sum, d) => sum + (d.fat || 0), 0)

  const avgDailyKcal = daysLogged > 0 ? Math.round(totalKcal / daysLogged) : 0
  const avgDailyProtein = daysLogged > 0 ? round1(totalProtein / daysLogged) : 0
  const avgDailyCarbs = daysLogged > 0 ? round1(totalCarbs / daysLogged) : 0
  const avgDailyFat = daysLogged > 0 ? round1(totalFat / daysLogged) : 0

  // Adherence: days within +-15% of goal
  const rawGoals = S && typeof S.nutritionGoals === 'object' && S.nutritionGoals !== null ? S.nutritionGoals : {}
  const effectiveGoalKcal = Number(rawGoals.kcal) === 0 ? 0 : (history[0]?.goalKcal || 0)
  const adherentDays = effectiveGoalKcal > 0 ? loggedDays.filter(
    d => d.goalKcal > 0 && Math.abs(d.kcal - d.goalKcal) / d.goalKcal <= 0.15
  ).length : 0
  const adherenceRate = daysLogged > 0 ? Math.round((adherentDays / daysLogged) * 100) : 0

  const bwKg = bodyweightKgOf(S)
  const proteinPerKg = (bwKg && bwKg > 0 && avgDailyProtein > 0)
    ? round2(avgDailyProtein / bwKg)
    : null

  // Training in window
  const startISO = shiftISO(todayISO, -(windowDays - 1))
  const endISO = todayISO
  const allWorkouts = Array.isArray(S?.workouts) ? S.workouts : []
  const workoutsInWindow = allWorkouts.filter(w => w?.d && w.d >= startISO && w.d <= endISO)
  const workoutCount = workoutsInWindow.length
  const frequencyPerWeek = round1((workoutCount / windowDays) * 7)
  const totalVolume = workoutsInWindow.reduce((sum, w) => sum + sessionVolume(w, S), 0)
  const avgVolumePerWorkout = workoutCount > 0 ? Math.round(totalVolume / workoutCount) : 0

  // Volume by muscle group and movement pattern
  const volumeByMuscle = {}
  const volumeByMovementPattern = {}
  const exercisesSeenInWindow = new Set()

  for (const w of workoutsInWindow) {
    for (const e of Array.isArray(w.entries) ? w.entries : []) {
      if (!e?.id) continue
      exercisesSeenInWindow.add(e.id)
      const vol = entryVolumeOf(e, w, S)
      if (vol <= 0) continue

      const ex = EXIDX[e.id] || (Array.isArray(S?.customEx) ? S.customEx.find(c => c && c.id === e.id) : null) || e
      const muscles = muscleGroupsOf(ex)
      const primaryMuscle = muscles[0] || ex?.tg || ex?.bp || 'other'
      volumeByMuscle[primaryMuscle] = (volumeByMuscle[primaryMuscle] || 0) + vol

      const pattern = movementPatternOf(ex)
      volumeByMovementPattern[pattern] = (volumeByMovementPattern[pattern] || 0) + vol
    }
  }

  // Progressions and regressions using onerm.js bestSetOf
  const progressions = []
  const regressions = []

  for (const exId of exercisesSeenInWindow) {
    // Find all sessions in S.workouts where this exercise appears
    const exSessions = []
    for (const w of allWorkouts) {
      if (!Array.isArray(w.entries)) continue
      const matchingEntries = w.entries.filter(e => e?.id === exId)
      for (const entry of matchingEntries) {
        const best = bestSetOf(entry)
        if (best && Number.isFinite(best.est) && best.est > 0) {
          exSessions.push({ date: w.d, best, name: EXIDX[exId]?.n || entry.name || exId })
        }
      }
    }

    if (exSessions.length >= 2) {
      const current = exSessions[exSessions.length - 1]
      const previous = exSessions[exSessions.length - 2]
      const deltaEst = round1(current.best.est - previous.best.est)
      const pctChange = previous.best.est > 0 ? round1((deltaEst / previous.best.est) * 100) : 0

      if (deltaEst > 0) {
        progressions.push({
          exerciseId: exId,
          name: current.name,
          current: current.best.est,
          previous: previous.best.est,
          delta: deltaEst,
          pct: pctChange,
          metric: 'e1RM',
        })
      } else if (deltaEst < 0) {
        regressions.push({
          exerciseId: exId,
          name: current.name,
          current: current.best.est,
          previous: previous.best.est,
          delta: deltaEst,
          pct: pctChange,
          metric: 'e1RM',
        })
      } else if (current.best.w === previous.best.w && current.best.r !== previous.best.r) {
        const repDelta = current.best.r - previous.best.r
        const item = {
          exerciseId: exId,
          name: current.name,
          weight: current.best.w,
          currentReps: current.best.r,
          prevReps: previous.best.r,
          delta: repDelta,
          metric: 'reps',
        }
        if (repDelta > 0) progressions.push(item)
        else regressions.push(item)
      }
    }
  }

  return {
    days: windowDays,
    daysLogged,
    loggingRate,
    avgDailyKcal,
    avgDailyProtein,
    avgDailyCarbs,
    avgDailyFat,
    adherenceRate,
    adherentDays,
    proteinPerKg,
    workoutCount,
    frequencyPerWeek,
    totalVolume,
    avgVolumePerWorkout,
    volumeByMuscle,
    volumeByMovementPattern,
    progressions,
    regressions,
  }
}

/**
 * Correlates nutrition on training days vs rest days and detects under-fueled heavy sessions.
 */
export function buildWorkoutAlignment(S, todayISO, days = 14) {
  const windowDays = Math.max(1, Math.trunc(Number(days) || 14))
  const goals = nutritionGoalsOf(S)
  const allWorkouts = Array.isArray(S?.workouts) ? S.workouts : []

  const trainingDayData = []
  const restDayData = []
  const allWindowWorkouts = []

  for (let i = windowDays - 1; i >= 0; i--) {
    const date = shiftISO(todayISO, -i)
    const workoutsOnDate = allWorkouts.filter(w => w?.d === date)
    const hasWorkout = workoutsOnDate.length > 0
    if (hasWorkout) {
      workoutsOnDate.forEach(w => allWindowWorkouts.push(w))
    }

    const day = nutritionDay(S, date)
    const logged = hasLoggedMeals(day)
    if (!logged) continue

    const totals = dayTotals(day)
    if (hasWorkout) {
      trainingDayData.push({
        date,
        kcal: totals.kcal,
        carbs: totals.carbs,
        workouts: workoutsOnDate,
      })
    } else {
      restDayData.push({
        date,
        kcal: totals.kcal,
        carbs: totals.carbs,
      })
    }
  }

  const trainingDaysCount = trainingDayData.length
  const restDaysCount = restDayData.length

  const avgTrainingKcal = trainingDaysCount > 0
    ? Math.round(trainingDayData.reduce((s, x) => s + x.kcal, 0) / trainingDaysCount)
    : 0
  const avgTrainingCarbs = trainingDaysCount > 0
    ? round1(trainingDayData.reduce((s, x) => s + x.carbs, 0) / trainingDaysCount)
    : 0

  const avgRestKcal = restDaysCount > 0
    ? Math.round(restDayData.reduce((s, x) => s + x.kcal, 0) / restDaysCount)
    : 0
  const avgRestCarbs = restDaysCount > 0
    ? round1(restDayData.reduce((s, x) => s + x.carbs, 0) / restDaysCount)
    : 0

  const kcalDeltaTrainingVsRest = Math.round(avgTrainingKcal - avgRestKcal)
  const carbDeltaTrainingVsRest = round1(avgTrainingCarbs - avgRestCarbs)

  // Identify high-volume training days
  const volumes = allWindowWorkouts.map(w => sessionVolume(w, S)).filter(v => v > 0)
  const avgSessionVol = volumes.length > 0 ? (volumes.reduce((s, v) => s + v, 0) / volumes.length) : 0

  const underfueledSessions = []
  if (goals.kcal > 0) {
    for (const tDay of trainingDayData) {
      const dayVol = tDay.workouts.reduce((s, w) => s + sessionVolume(w, S), 0)
      // High volume day: day's volume meets or exceeds average session volume (and > 0)
      if (dayVol > 0 && dayVol >= avgSessionVol) {
        const deficitPct = round1(((goals.kcal - tDay.kcal) / goals.kcal) * 100)
        if (deficitPct > 20) {
          underfueledSessions.push({
            date: tDay.date,
            volume: dayVol,
            kcal: tDay.kcal,
            targetKcal: goals.kcal,
            deficitPct,
            workoutNames: tDay.workouts.map(w => w.name || 'Workout').join(', '),
          })
        }
      }
    }
  }

  return {
    trainingDaysCount,
    restDaysCount,
    avgTrainingKcal,
    avgTrainingCarbs,
    avgRestKcal,
    avgRestCarbs,
    kcalDeltaTrainingVsRest,
    carbDeltaTrainingVsRest,
    underfueledSessions,
    hasUnderfueledHeavyDays: underfueledSessions.length > 0,
  }
}

/**
 * Builds deterministic markdown summary for LLM context prompts.
 */
export function formatCoachMarkdown(raw) {
  const { today, trends, alignment } = raw
  const lines = []

  lines.push('### Unified Nutrition & Workout Context')
  lines.push(`**Today (${today.date}):**`)
  lines.push('| Metric | Logged | Target | Delta / % |')
  lines.push('| --- | --- | --- | --- |')
  lines.push(
    `| Calories | ${today.kcal.toLocaleString()} kcal | ${today.targetKcal.toLocaleString()} kcal | ${today.deltaKcal >= 0 ? '+' : ''}${today.deltaKcal} kcal (${today.targetKcal > 0 ? Math.round((today.kcal / today.targetKcal) * 100) : 0}%) |`
  )
  lines.push(
    `| Protein | ${today.protein} g | ${today.targetProtein} g | ${today.proteinPctOfTarget}% (${today.proteinKcalPct}% kcal) |`
  )
  lines.push(
    `| Carbs | ${today.carbs} g | ${today.targetCarbs} g | ${today.carbsPctOfTarget}% (${today.carbsKcalPct}% kcal) |`
  )
  lines.push(
    `| Fat | ${today.fat} g | ${today.targetFat} g | ${today.fatPctOfTarget}% (${today.fatKcalPct}% kcal) |`
  )

  const workoutStr = today.completedSessions.length > 0
    ? today.completedSessions.map(s => `${s.name} (${s.workSets} sets, ${s.totalVolume.toLocaleString()} vol)`).join(' · ')
    : (today.activeSession ? `Active: ${today.activeSession.name || 'In progress'} (${today.activeSession.workSets} sets)` : 'None')
  lines.push(`- **Training Today:** ${workoutStr}`)
  lines.push(
    `- **Log Status:** Meals Logged: ${today.hasLoggedMeals ? 'Yes' : 'NO (0 logged)'} | Workouts Logged: ${today.hasLoggedWorkouts ? 'Yes' : 'NO'}`
  )

  lines.push('\n**Rolling Trends:**')
  lines.push('| Window | Avg Intake | Adherence | Avg Protein | Workouts | Total Volume |')
  lines.push('| --- | --- | --- | --- | --- | --- |')

  const d7 = trends.d7
  const d14 = trends.d14
  const prot7Str = `${d7.avgDailyProtein}g${d7.proteinPerKg ? ` (${d7.proteinPerKg}g/kg)` : ''}`
  const prot14Str = `${d14.avgDailyProtein}g${d14.proteinPerKg ? ` (${d14.proteinPerKg}g/kg)` : ''}`

  lines.push(
    `| 7-Day | ${d7.avgDailyKcal} kcal | ${d7.adherenceRate}% (${d7.daysLogged}/${d7.days}d) | ${prot7Str} | ${d7.workoutCount} (${d7.frequencyPerWeek}/wk) | ${d7.totalVolume.toLocaleString()} |`
  )
  lines.push(
    `| 14-Day | ${d14.avgDailyKcal} kcal | ${d14.adherenceRate}% (${d14.daysLogged}/${d14.days}d) | ${prot14Str} | ${d14.workoutCount} (${d14.frequencyPerWeek}/wk) | ${d14.totalVolume.toLocaleString()} |`
  )

  // Top muscle volumes (7-day)
  const topMuscles = Object.entries(d7.volumeByMuscle)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([m, v]) => `${m} (${v.toLocaleString()})`)
    .join(', ')
  if (topMuscles) {
    lines.push(`- **Top Muscles (7d):** ${topMuscles}`)
  }

  // Progressions
  if (d7.progressions.length > 0) {
    const progStr = d7.progressions.map(p => `${p.name} (+${p.delta} ${p.metric})`).join(', ')
    lines.push(`- **Recent Progressions (7d):** ${progStr}`)
  }

  // Alignment
  lines.push('\n**Pre/Post-Workout Nutrition Alignment:**')
  lines.push(
    `- **Training vs Rest:** Training: ${alignment.avgTrainingKcal} kcal, ${alignment.avgTrainingCarbs}g carbs | Rest: ${alignment.avgRestKcal} kcal, ${alignment.avgRestCarbs}g carbs (Δ ${alignment.carbDeltaTrainingVsRest >= 0 ? '+' : ''}${alignment.carbDeltaTrainingVsRest}g carbs)`
  )
  if (alignment.hasUnderfueledHeavyDays) {
    const underStr = alignment.underfueledSessions
      .map(u => `${u.date} (${u.workoutNames}, deficit -${u.deficitPct}%)`)
      .join(', ')
    lines.push(`- **Under-Fueled Heavy Sessions:** ${underStr}`)
  } else {
    lines.push('- **Under-Fueled Heavy Sessions:** None detected')
  }

  return lines.join('\n')
}

/**
 * Builds compact, token-optimized JSON for LLMs.
 */
export function formatCompactJson(raw) {
  const compact = {
    today: {
      d: raw.today.date,
      kcal: raw.today.kcal,
      targetKcal: raw.today.targetKcal,
      deltaKcal: raw.today.deltaKcal,
      p: raw.today.protein,
      c: raw.today.carbs,
      f: raw.today.fat,
      pPct: raw.today.proteinPctOfTarget,
      cPct: raw.today.carbsPctOfTarget,
      fPct: raw.today.fatPctOfTarget,
      mealsLogged: raw.today.hasLoggedMeals,
      workoutDay: raw.today.isWorkoutDay,
      workoutsLogged: raw.today.hasLoggedWorkouts,
      sessions: raw.today.completedSessions.map(s => ({
        name: s.name,
        sets: s.workSets,
        vol: s.totalVolume,
      })),
    },
    trends7d: {
      daysLogged: raw.trends.d7.daysLogged,
      avgKcal: raw.trends.d7.avgDailyKcal,
      adherence: raw.trends.d7.adherenceRate,
      avgP: raw.trends.d7.avgDailyProtein,
      pPerKg: raw.trends.d7.proteinPerKg,
      workouts: raw.trends.d7.workoutCount,
      freq: raw.trends.d7.frequencyPerWeek,
      vol: raw.trends.d7.totalVolume,
      progressions: raw.trends.d7.progressions.map(p => ({ n: p.name, d: p.delta, m: p.metric })),
    },
    trends14d: {
      daysLogged: raw.trends.d14.daysLogged,
      avgKcal: raw.trends.d14.avgDailyKcal,
      adherence: raw.trends.d14.adherenceRate,
      avgP: raw.trends.d14.avgDailyProtein,
      pPerKg: raw.trends.d14.proteinPerKg,
      workouts: raw.trends.d14.workoutCount,
      vol: raw.trends.d14.totalVolume,
    },
    alignment: {
      trainKcal: raw.alignment.avgTrainingKcal,
      trainCarbs: raw.alignment.avgTrainingCarbs,
      restKcal: raw.alignment.avgRestKcal,
      restCarbs: raw.alignment.avgRestCarbs,
      carbDelta: raw.alignment.carbDeltaTrainingVsRest,
      underfueled: raw.alignment.underfueledSessions.map(u => ({ d: u.date, defPct: u.deficitPct })),
    },
  }
  return JSON.stringify(compact)
}

/**
 * Builds the complete unified coach nutrition and workout telemetry context.
 *
 * @param {object} S Store state
 * @param {number|Date} [now=Date.now()] Reference time
 * @returns {{ raw: object, summaryMarkdown: string, compactJson: string }}
 */
export function buildUnifiedCoachContext(S, now = Date.now()) {
  const safeState = S && typeof S === 'object' ? S : {}
  const { todayISO } = parseTime(now)

  const today = buildTodaySnapshot(safeState, now)
  const d7 = buildRollingTrends(safeState, todayISO, 7)
  const d14 = buildRollingTrends(safeState, todayISO, 14)
  const alignment = buildWorkoutAlignment(safeState, todayISO, 14)

  const raw = {
    today,
    trends: {
      d7,
      d14,
    },
    alignment,
  }

  const summaryMarkdown = formatCoachMarkdown(raw)
  const compactJson = formatCompactJson(raw)

  return {
    raw,
    summaryMarkdown,
    compactJson,
  }
}

/**
 * High-level helper for passing nutrition telemetry to Coach consumers.
 */
export function nutritionForCoach(S, now = Date.now()) {
  return buildUnifiedCoachContext(S, now)
}
