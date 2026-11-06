import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { effectiveRoutines, effectiveRoutineIds, nextTrainingDay, lastBW, setsDoneActive } from '../lib/history.js'
import { streakInfo } from '../lib/streak.js'
import { StreakFlame, StreakMeta, StreakParty } from '../components/Streak.jsx'
import { fmtNum, fmtDate, todayISO, isoOf, weekStartOf, weekDayOffset, DAYS, DAYN } from '../lib/format.js'
import { t, tn, dateLocale } from '../lib/i18n.js'
import { bwSheet, goalSheet, dayOverrideSheet, calendarSheet, startFlow, starterPlanSheet, bwDeltaColor, weighInsSheet } from '../sheets.jsx'
import LineChart from '../components/LineChart.jsx'
import Icon from '../components/Icon.jsx'
import CardHead from '../components/CardHead.jsx'
import QueueRow from '../components/QueueRow.jsx'
import MiniBodyMap from '../components/MiniBodyMap.jsx'
import { queueOf, queueView, weekTally, pinState } from '../lib/queue.js'
import { workoutsLeft } from '../lib/week-left.js'
import { WeeklySetsHomeLine } from '../components/WeeklySets.jsx'
import { RecapHomeCard } from '../components/Recap.jsx'
import { scheduleModeOf } from '../lib/rotation.js'
import { useConnectionTrouble } from '../components/SyncBanner.jsx'
import { Button } from '../components/ui.jsx'
import { tappable } from '../lib/use-sheet-keyboard.js'
import { glyphOf } from '../lib/glyphs.js'
import { dayNoteOf } from '../lib/day-notes.js'
import { weighInAt } from '../lib/bodyweight.js'
import WeightRate from '../components/WeightRate.jsx'
import { programmeChip } from '../lib/programmes.js'
import { SeasonDeco } from '../components/Seasonal.jsx'
import { WrappedHomeCard } from '../components/WrappedEntry.jsx'
import RecoveryHint from '../components/RecoveryHint.jsx'
import { ChallengesCard } from '../components/Challenges.jsx'
import { isOn } from '../lib/modules.js'
import { nutritionDay, hasLoggedMeals, dayTotals, dietConsistencyScore } from '../lib/nutrition.js'
import { useCoachGate } from '../lib/use-coach-gate.js'
import { useUI } from '../store/useUI.js'
import NutritionFoodSheet from '../components/NutritionFoodSheet.jsx'
import NutritionGoalsSheet from '../components/NutritionGoalsSheet.jsx'
import NutritionHistorySheet from '../components/NutritionHistorySheet.jsx'

// Home = what to do now + a quick glance. Deep charts & history live in Stats.
export default function Home() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  // The banner switched off and the sync stuck: a dot on the gear (Settings → Show connection status).
  const trouble = useConnectionTrouble()
  const [weekOffset, setWeekOffset] = useState(0)

  const today = new Date()
  // A weekday can hold several routines. `todayRoutines` is the whole day; `routine` is the
  // first, kept for the one-routine glyph. The derived session name joins them (§9).
  const todayRoutines = effectiveRoutines(S, todayISO())
  const routine = todayRoutines[0] || null
  const todayName = todayRoutines.map(r => r.name).join(' + ')
  // A fulfilled pin (a coach session pinned to today and since done) reads as no override.
  const todayOvr = S.dayPlan[todayISO()] !== undefined && pinState(S, S.dayPlan[todayISO()]) !== 'done'
  // An open editor on a saved workout (lib/session-edit.js) holds S.active too, but it is not a
  // session in progress: the row takes you back to it as an edit, the way the tab bar does.
  const editingSaved = !!S.active?.editingWorkoutId
  const bw = lastBW(S)
  const prevBW = S.bodyweight.length > 1 ? S.bodyweight[S.bodyweight.length - 2] : null
  const delta = bw && prevBW ? bw.w - prevBW.w : null

  const ws = weekStartOf(S)
  // The first day of the shown week. Named for the role, not for Monday — which day that is
  // is the setting.
  const wkStart = new Date(today)
  wkStart.setDate(today.getDate() - weekDayOffset(today.getDay(), ws) + weekOffset * 7)
  const doneDays = new Set(S.workouts.map(w => w.d))
  // The last session logged for today, if any — what the row below reports instead of asking
  // you to start the one you already did. Last wins, so a second session names itself. Only once
  // today's plan is covered, though: a freestyle session on a planned day, or the rotation's
  // first session done when its next one is today's too, leaves the row offering what is still
  // to do, as Start and the progress row already do. A queue session is never "covered" by an
  // earlier workout: the queue only names one it does not count as done yet.
  const loggedToday = S.workouts.filter(w => w.d === todayISO())
  const queueIds = queueOf(S)?.ids || []
  const coveredToday = id => !queueIds.includes(id) && loggedToday.some(w => (Array.isArray(w.routineIds) ? w.routineIds : [w.routineId]).includes(id))
  const doneToday = (todayRoutines.every(r => coveredToday(r.id)) && loggedToday.at(-1)) || null
  const strip = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(wkStart); d.setDate(wkStart.getDate() + i)
    const iso = isoOf(d)
    const eff = effectiveRoutineIds(S, iso).length > 0, ovr = S.dayPlan[iso] !== undefined, done = doneDays.has(iso)
    // A day off with a note (#261) reads as excused, not as a plan that went by.
    const dot = done ? ' done' : dayNoteOf(S, iso) ? ' noted' : ovr && eff ? ' ovr' : eff ? ' plan' : ''
    strip.push(<div key={i} className={'wday' + (iso === todayISO() ? ' today' : '')} {...tappable(() => dayOverrideSheet(iso))}>
      <div className="lbl">{t(DAYS[d.getDay()])}</div><div className="num">{d.getDate()}</div><div className={'dot' + dot} /></div>)
  }
  const wkEnd = new Date(wkStart); wkEnd.setDate(wkStart.getDate() + 6)
  const wkLabel = weekOffset === 0 ? t('This week') : `${wkStart.getDate()} ${wkStart.toLocaleDateString(dateLocale(), { month: 'short' })} – ${wkEnd.getDate()} ${wkEnd.toLocaleDateString(dateLocale(), { month: 'short' })}`

  // A coach week (S.queue) read through the same tolerant reader QueueRow uses, so a malformed
  // queue from another client shows the weekday dots, never an empty card.
  const queue = queueView(S, todayISO())
  // This card shows one thing or the other — QueueRow for a live queue, or Rotation chosen with
  // nothing built yet (S.scheduleMode), in which case there is no queue for QueueRow to render and
  // an empty-state card takes its place. Plan does the same in rotation mode: no weekday grid, only
  // the days that add a routine the loop does not have (Plan.jsx, "Also on fixed days").
  const rotating = scheduleModeOf(S) === 'rotation'
  // A planner-written queue (no rotationId) still names its weekday when it hasn't started yet —
  // that copy predates rotation and stays as it is. Our own rotation has no weekday of its own
  // (lib/rotation.js): naming one here — including on the pass's own one-day empty gap (THE
  // ONE-DAY BOUNDARY, rotation.js) or before a first routine is even added — would be the
  // fixed-week model leaking into a schedule that was never weekday-based.
  const liveQ = queueOf(S)
  const plannerQueue = !!queue && !liveQ?.rotationId
  // Ownership, not mere presence of a rotationId: a stale id left over from a rebuilt rotation
  // would otherwise still read as "this app manages it" (lib/rotation.js).
  const managedQueue = !!liveQ && !!S.rotation && liveQ.rotationId === S.rotation.id
  // On a rest day, saying when you train next beats leaving the row as a full stop.
  const next = !S.active && !todayRoutines.length && !(rotating && !plannerQueue) ? nextTrainingDay(S, todayISO()) : null
  // The streak card's fraction: this calendar week's workouts over the weekdays with a plan, or,
  // in a coach week, the queue's sessions and your own days together (lib/queue.js weekTally).
  const tally = weekTally(S, todayISO())
  const { done: doneThisWeek, planned: plannedPerWeek } = tally
  const left = workoutsLeft(S, todayISO())
  // The streak with its best run and freezes (lib/streak.js), read back from the workouts.
  const todayKey = todayISO()
  const streak = useMemo(() => streakInfo(S, todayKey), [S.workouts, S.weekStart, todayKey]) // eslint-disable-line react-hooks/exhaustive-deps
  // Settings → Modules (lib/modules.js): what a module switched off hides here.
  const on = id => isOn(S, id)
  const bwPoints = S.bodyweight.slice(-30).map(b => ({ t: weighInAt(b), y: b.w, d: b.d }))

  // AI Coach readiness & status computed from today's training and nutrition
  const hasWorkoutToday = loggedToday.length > 0 || !!doneToday
  const hasMealsToday = useMemo(() => {
    try {
      return hasLoggedMeals(nutritionDay(S, todayISO()))
    } catch {
      return false
    }
  }, [S.nutritionLogs])
  const hasPlannedWorkout = todayRoutines.length > 0 && !hasWorkoutToday
  const gate = useCoachGate()
  const coachOk = gate.ok
  const openCoach = prompt => {
    if (coachOk) {
      if (prompt) nav("/coach", { state: { prompt } })
      else nav("/coach")
    } else {
      nav("/coach/setup")
    }
  }
  const coachStatusSub = useMemo(() => {
    if (!coachOk) {
      return t("AI Coach setup required · Tap to configure")
    }
    if (hasWorkoutToday && hasMealsToday) {
      return t("Today’s workout and macros logged · Analysis ready")
    }
    if (hasWorkoutToday && !hasMealsToday) {
      return t("Workout logged · Log meals for nutrition analysis")
    }
    if (hasMealsToday && hasPlannedWorkout) {
      return t("Meals logged · Workout pending")
    }
    return t("Weekly performance & calorie correlation ready")
  }, [coachOk, hasWorkoutToday, hasMealsToday, hasPlannedWorkout])

  // 7-day Nutrition adherence & consistency score
  const dietScore = useMemo(() => {
    return dietConsistencyScore(S, todayISO(), 7)
  }, [S.nutritionLogs, S.nutritionGoals])

  const todayNutrKcal = useMemo(() => {
    try {
      return dayTotals(nutritionDay(S, todayISO())).kcal
    } catch {
      return 0
    }
  }, [S.nutritionLogs])

  const tierLabelMap = {
    optimal: t('Optimal'),
    good: t('Good'),
    fair: t('Fair'),
    low: t('Building habit'),
  }
  const tierLabel = tierLabelMap[dietScore.tier] || dietScore.label

  const histScaleMax = Math.max(dietScore.goalKcal * 1.15, ...dietScore.history.map(d => d.kcal), 1)
  const goalLinePct = dietScore.goalKcal > 0
    ? Math.min(100, Math.round((dietScore.goalKcal / histScaleMax) * 1000) / 10)
    : 0

  const openAddFood = () => {
    useUI.getState().openSheet(close => (
      <NutritionFoodSheet dateISO={todayISO()} close={close} />
    ))
  }

  const openNutritionHistory = () => {
    useUI.getState().openSheet(close => (
      <NutritionHistorySheet close={close} onSelectDate={() => nav('/nutrition')} />
    ))
  }

  const openNutritionGoals = () => {
    useUI.getState().openSheet(close => <NutritionGoalsSheet close={close} />)
  }

  // today's session shown right under the week strip
  const onToday = () => { if (S.active) nav('/workout'); else if (todayRoutines.length) startFlow(effectiveRoutineIds(S, todayISO())); else dayOverrideSheet(todayISO()) }
  // A chip on the coach week's progress row starts that one routine, in any order. A session
  // already in progress wins, as on the today row — starting another would overwrite it.
  const progChip = programmeChip(S)
  const onQueueStart = id => { if (S.active) nav('/workout'); else startFlow([id]) }

  return <div className="narrow">
    <div className="hdr">
      <SeasonDeco spot="header-bats" />
      <div><h1>{user ? t('Hi {0}', user.name) : 'openGym'}</h1><div className="sub">{today.toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' })}</div></div>
      <button className="iconbtn" data-tour="settings-gear" onClick={() => nav('/settings')} aria-label={trouble ? t('Settings') + ', ' + t('Connection problem') : t('Settings')}><Icon name="gear" />{trouble && <span className="tab-dot" aria-hidden="true" />}</button>
    </div>

    <div className="card">
      {/* A running programme (lib/programmes.js) wrote this week's plan: where it stands, one tap from its screen. */}
      {progChip && <button type="button" className="chip ichip prog-chip" onClick={() => nav('/plan/programmes')}><Icon name="calendar" /><span>{progChip}</span></button>}
      {/* A coach week runs by order, not by weekday, so its progress row stands in for the
          seven dots (components/QueueRow.jsx). The today row below stays as it is: the queue's
          next session reaches it through effectiveRoutineIds like any planned routine. */}
      {rotating ? (queue ? <QueueRow S={S} today={todayISO()} onStart={onQueueStart} managed={managedQueue} /> : <div className="empty">
        {t('No rotation yet. Add routines to it in Plan.')}
        <div style={{ marginTop: 10 }}><Button size="sm" variant="tinted" onClick={() => nav('/plan')}>{t('Set up in Plan')}</Button></div>
      </div>) : <>
        <div className="row between" style={{ marginBottom: 8 }}>
          <button className="iconbtn" style={{ width: 30, height: 30, fontSize: 'var(--fs-subhead)' }} onClick={() => setWeekOffset(w => w - 1)} aria-label={t('Previous week')}><Icon name="chevronLeft" /></button>
          <div className="small muted" style={{ fontWeight: 500 }}>{wkLabel}</div>
          <button className="iconbtn" style={{ width: 30, height: 30, fontSize: 'var(--fs-subhead)' }} onClick={() => setWeekOffset(w => w + 1)} aria-label={t('Next week')}><Icon name="chevronRight" /></button>
        </div>
        <div className="week">{strip}</div>
      </>}
      {/* The week's plan as a countdown (#753, lib/week-left.js): "2 of 4 left this week". */}
      {left && <div className={'small dim wkleft' + (left.left > 0 ? '' : ' done')}>
        {left.left > 0 ? tn('{0} of {1} left this week', '{0} of {1} left this week', left.left, left.of) : t('All done this week. Nice.')}
      </div>}
      {/* Once today's session is logged the row stops asking for it. The week strip already
          knew (its dot goes 'done'); this row did not, so a finished day kept showing the
          routine name behind a green Start tag and read as still outstanding (issue #4).
          An in-progress session still wins — that one is happening right now. Tapping the
          row keeps working, so a second session in one day is a tap away, just not urged. */}
      <div className="today-row" data-tour="today" {...tappable(onToday)}>
        <div className="row" style={{ gap: 9, minWidth: 0 }}>
          <span className="lrow-i" style={{ background: S.active ? 'var(--orange)' : doneToday ? 'var(--surface-3)' : routine ? 'var(--acc)' : 'var(--surface-3)',
            // the rest day's moon on the grey square: white on #e3e3e8 vanished in the light theme
            ...(!S.active && !doneToday && !routine ? { color: 'var(--label-2)' } : {}) }}>
            <Icon name={S.active ? (editingSaved ? 'pencil' : 'play') : doneToday ? 'checkCircle' : routine ? glyphOf(routine.emoji) : 'moon'}
              style={doneToday && !S.active ? { color: 'var(--green)' } : undefined} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="lbl2">{t('Today')}</div>
            <div className="ttl">{S.active ? (editingSaved ? S.active.name : t('{0} (in progress)', S.active.name))
              : doneToday ? (doneToday.name ? t('{0} (done)', doneToday.name) : t('Workout done'))
              : routine ? todayName : t('Rest day')}{todayOvr && routine && !doneToday ? ' · ' + t('rescheduled') : ''}</div>
            {next && !doneToday && <div className="ss">{t('Next session: {0}, {1}', t(DAYN[next.weekday]), next.routine.name)}</div>}
          </div>
        </div>
        {S.active ? <span className="tag" style={{ color: 'var(--orange)', background: 'color-mix(in srgb,var(--orange) 16%,transparent)' }}>{editingSaved ? t('Edit') : t('Resume')}</span>
          : doneToday ? <span className="tag" style={{ color: 'var(--green)', background: 'color-mix(in srgb,var(--green) 16%,transparent)' }}>{t('Done')}</span>
          : routine ? <span className="row" style={{ gap: 8 }}><MiniBodyMap routines={todayRoutines} body={S.body} /><span className="tag acc">{t('Start')}</span></span>
          : <Icon name="plus" className="chev" />}
      </div>
      {/* The row above starts today's plan in one tap, and so does the Start button in the tab
          bar — which is the whole problem when you want something else. Both jump straight into
          the planned session whenever there is one, so the Start screen (a freestyle session,
          and your other routines) is only reachable on a day with nothing planned. The one other
          way in, "Choose a different workout" on the weigh-in sheet, does not exist when the
          weigh-in is switched off. This is that door, and it starts nothing on its own. */}
      {!S.active && <div style={{ display: 'flex', justifyContent: 'center', marginTop: 4 }}>
        <Button size="sm" variant="ghost" className="dim" icon="swap" onClick={() => nav('/workout')}>
          {t('Choose a different workout')}
        </Button>
      </div>}
      <SeasonDeco spot="home-hero" />
    </div>

    {/* AI Coach Hero Entry Card (lib/coach.js, views/CoachChat.jsx) */}
    {on('coach') && (
      <div className="card tap-host coach-home-card" data-tour="coach-card">
        <CardHead
          icon="sparkles"
          tint="var(--acc)"
          eyebrow={t('AI Coach')}
          title={t('Performance & Nutrition Coach')}
          sub={coachStatusSub}
          open={{ onClick: () => openCoach() }}
          action={
            <Button size="sm" variant="tinted" icon="sparkles" onClick={() => openCoach()}>
              {coachOk ? t('Ask') : t('Set up')}
            </Button>
          }
        />
        <div className="coach-home-pills">
          <button
            type="button"
            className="coach-home-pill"
            onClick={() => openCoach(t('Weekly analysis'))}
          >
            <Icon name="chart" />
            <span>{t('Weekly analysis')}</span>
          </button>
          <button
            type="button"
            className="coach-home-pill"
            onClick={() => openCoach(t('Macro status'))}
          >
            <Icon name="nutrition" />
            <span>{t('Macro status')}</span>
          </button>
          <button
            type="button"
            className="coach-home-pill"
            onClick={() => openCoach(t('Ask Coach'))}
          >
            <Icon name="sparkles" />
            <span>{coachOk ? t('Ask Coach') : t('Set up')}</span>
          </button>
        </div>
      </div>
    )}

    {/* Dedicated Nutrition 7-Day & Consistency Card */}
    {on('nutrition') && (
      <div className="card tap-host home-nutr-card" data-tour="home-nutrition">
        <CardHead
          icon="nutrition"
          tint="var(--green)"
          eyebrow={t('Nutrition')}
          title={t('Diet consistency')}
          sub={`${dietScore.score}/100 · ${tierLabel} · ${fmtNum(todayNutrKcal)} / ${fmtNum(dietScore.goalKcal)} kcal`}
          open={{ onClick: () => nav('/nutrition') }}
          action={
            <Button size="sm" variant="tinted" icon="chevronRight" onClick={() => nav('/nutrition')}>
              {t('Nutrition')}
            </Button>
          }
        />

        <div className="home-nutr-score-row">
          <div className={`home-nutr-score-badge tier-${dietScore.tier}`}>
            <span className="home-nutr-score-val">{dietScore.score}</span>
            <span className="home-nutr-score-unit">/100</span>
          </div>
          <div className="home-nutr-score-meta">
            <div className="home-nutr-score-headline">
              <span className={`home-nutr-tier-dot tier-${dietScore.tier}`} aria-hidden="true" />
              <span className="home-nutr-tier-name">{tierLabel}</span>
              <span className="home-nutr-score-sep">·</span>
              <span className="home-nutr-logged-stat">
                {tn('{0} of {1} day logged', '{0} of {1} days logged', dietScore.loggedDays, dietScore.totalDays)}
              </span>
            </div>
            <div className="home-nutr-score-sub">
              {dietScore.loggedDays > 0
                ? t('7-day average: {0} kcal / day', fmtNum(dietScore.avgKcal))
                : t('Log food daily to track diet consistency')}
            </div>
          </div>
        </div>

        <div className="nutr-hist-grid" role="group" aria-label={t('7-day nutrition history')}>
          {dietScore.history.map(d => {
            const isToday = d.date === todayISO()
            const fillPct = d.kcal > 0 ? Math.min(100, Math.max(6, Math.round((d.kcal / histScaleMax) * 1000) / 10)) : 0
            return (
              <button
                key={d.date}
                type="button"
                className={
                  'nutr-hday' +
                  (isToday ? ' today' : '') +
                  (d.over ? ' over' : '') +
                  (d.logged ? ' has' : '')
                }
                data-hist-date={d.date}
                aria-label={`${fmtDate(d.date, true)}: ${t('{0} of {1} kcal', fmtNum(d.kcal), fmtNum(d.goalKcal))}`}
                onClick={() => nav('/nutrition')}
              >
                <span className="nutr-hval" aria-hidden="true">
                  {d.logged ? fmtNum(d.kcal) : '·'}
                </span>
                <span className="nutr-hbar-t" aria-hidden="true">
                  {goalLinePct > 0 && <span className="nutr-hbar-goal" style={{ bottom: `${goalLinePct}%` }} />}
                  {fillPct > 0 && <span className="nutr-hbar-f" style={{ height: `${fillPct}%` }} />}
                </span>
                <span className="nutr-hdow" aria-hidden="true">{t(DAYS[d.dow])}</span>
                <span className="nutr-hnum" aria-hidden="true">{d.dayNum}</span>
              </button>
            )
          })}
        </div>

        <div className="home-nutr-pills">
          <button
            type="button"
            className="home-nutr-pill"
            onClick={openAddFood}
          >
            <Icon name="plus" />
            <span>{t('Log food')}</span>
          </button>
          <button
            type="button"
            className="home-nutr-pill"
            onClick={openNutritionHistory}
          >
            <Icon name="chart" />
            <span>{t('7-day history')}</span>
          </button>
          <button
            type="button"
            className="home-nutr-pill"
            onClick={openNutritionGoals}
          >
            <Icon name="target" />
            <span>{t('Goals')}</span>
          </button>
        </div>
      </div>
    )}

    {/* Monday: Your week; the 1st: Your month (lib/recap.js). Off in Settings → Look & Home. */}
    <RecapHomeCard S={S} />

    {/* Christmas (lib/seasonal.js): the advent calendar's card, 1 to 24 December, from the theme's chunk. */}
    <SeasonDeco spot="home-advent" />

    {/* December and January: the year in openGym is ready (lib/wrapped.js homeCardYear). */}
    {on('motivation') && <WrappedHomeCard S={S} />}

    {/* What has rested and what is still recovering, kindly (lib/recovery-hint.js). */}
    {on('health') && <RecoveryHint S={S} />}

    {/* This month's three challenges and how far you are (lib/challenges.js). */}
    <ChallengesCard S={S} />

    {/* Jump to the gym check-in cards (QR membership codes). Shown here as a quick tap on
        arrival at the gym; folds away per user via the "Gym check-in" switch in Settings. */}
    {on('checkin') && (
      <div className="card tap-host checkin-card">
        <CardHead icon="qr" tint="var(--blue)" eyebrow={t('At the gym')} title={t('Check in')} open={{ onClick: () => nav('/checkin') }}
          action={<Icon name="chevronRight" className="chev" />} />
      </div>
    )}

    {!S.routines.length && !S.active && (
      <div className="card">
        <CardHead icon="calendar" title={t('Welcome!')} sub={t('Set up your weekly routine to get going, or grab a ready-made starter plan.')} />
        <Button variant="primary" icon="clipboard" onClick={starterPlanSheet}>{t('Load starter plan')}</Button>
        <div style={{ height: 8 }} /><Button onClick={() => nav('/plan')}>{t('Build my own plan')}</Button>
      </div>
    )}

    {on('body') && S.showWeightCard !== false && <div className="card">
      {/* one trailing action, Log; the goal lives with the goal line and the weigh-ins below (P2) */}
      <CardHead icon="scale" tint="var(--teal)" title={t('Body weight')} className="bw-head"
        action={<Button size="sm" icon="plus" onClick={() => bwSheet()}>{t('Log')}</Button>} />
      {bw ? <>
        <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
          <div className="big">{fmtNum(bw.w)} <span className="muted" style={{ fontSize: 'var(--fs-callout)' }}>{S.unit}</span></div>
          {/* only when it actually moved — an unchanged weight used to read as "− 0" */}
          {!!delta && (
            <span className="small row" style={{ gap: 2, fontWeight: 500, color: bwDeltaColor(delta, bw.w) }}>
              <Icon name={delta > 0 ? 'arrowUp' : 'arrowDown'} style={{ fontSize: 'var(--fs-caption)' }} />
              {fmtNum(Math.abs(delta))}
            </span>
          )}
          <span className="dim small" style={{ marginInlineStart: 'auto' }}>{fmtDate(bw.d, true)}</span>
        </div>
        {S.targetW && (
          <div className="small row" style={{ color: 'var(--gold-ink)', marginTop: 4, gap: 5 }}>
            <Icon name="target" style={{ fontSize: 'var(--fs-footnote)' }} />
            <span>{t('Goal')} {fmtNum(S.targetW)} {S.unit} · {Math.abs(S.targetW - bw.w) < 0.05 ? t('reached!') : t(S.targetW > bw.w ? '{0} to gain' : '{0} to lose', fmtNum(Math.abs(S.targetW - bw.w)) + ' ' + S.unit)}</span>
          </div>
        )}
        <div className="chart" style={{ marginTop: 8 }}><LineChart points={bwPoints} h={130} unit={S.unit} goal={S.targetW} /></div>
        {/* the weekly rate and, with one set, how it sits in its corridor (#759) */}
        <WeightRate S={S} />
        {/* every weigh-in, week by week with its average (Discord 'Weight') */}
        <div className="row between" style={{ marginTop: 4 }}>
          <Button size="sm" variant="ghost" icon="target" className="bw-goal" style={S.targetW ? { color: 'var(--gold-ink)' } : undefined} onClick={goalSheet}>{S.targetW ? fmtNum(S.targetW) : t('Goal')}</Button>
          <Button size="sm" variant="ghost" trailingIcon="chevronRight" data-tour="home-weighins" onClick={weighInsSheet}>{t('All weigh-ins')}</Button>
        </div>
      </> : <>
        <div className="muted small">{S.weighIn === false
          ? t('No weigh-ins yet. Log your weight to start the curve.')
          : t("No weigh-ins yet. Log your weight to start the curve (we also ask before every workout).")}</div>
        <Button size="sm" variant="ghost" icon="target" className="bw-goal" style={{ marginTop: 6, ...(S.targetW ? { color: 'var(--gold-ink)' } : {}) }} onClick={goalSheet}>{S.targetW ? fmtNum(S.targetW) : t('Goal')}</Button>
      </>}
    </div>}

    {/* The streak opens its calendar from its text (CardHead open); the weekly-sets line and the
        party banner are buttons of their own beside it, not inside a card that is a button. */}
    {on('motivation') ? <div className="card tap-host streak-card">
      <SeasonDeco spot="home-streak" />
      {/* in season, a Santa hat on the flame (components/Seasonal.jsx) */}
      <CardHead className="streak-head" glyph={<span className="streak-flame-wrap"><StreakFlame lit={streak.current > 0} /><SeasonDeco spot="streak-flame" /></span>}
        title={t('{0} week streak', streak.current)} open={{ onClick: () => calendarSheet(), haspopup: 'dialog' }}
        sub={<>{doneThisWeek}{plannedPerWeek ? ' / ' + plannedPerWeek : ''} {t('this week')} · {tn('{0} workout total', '{0} workouts total', S.workouts.length)}</>}
        action={<Icon name="calendar" className="chev" style={{ fontSize: 'var(--fs-title3)' }} />} />
      {(streak.best > 0 || streak.freezes > 0) && <div className="muted small card-head-indent streak-meta-line"><StreakMeta info={streak} /></div>}
      <StreakParty S={S} info={streak} tally={tally} />
      {/* Settings → Look & Home → Weekly sets on Home (lib/muscle-targets.js): the muscle with
          the most room this week, one tap from the Stats card. */}
      {/* Straight to Stats → Lifts, where the card is, not to the top of Overview (P5 deep link). */}
      {S.homeMuscleSets === true && <WeeklySetsHomeLine S={S} onOpen={() => nav('/stats?section=lifts')} />}
    </div>
      // Motivation off: no streak card, but the weekly sets line it carried keeps a card of its own.
      : S.homeMuscleSets === true && <div className="card wsets-solo"><WeeklySetsHomeLine S={S} onOpen={() => nav('/stats?section=lifts')} /></div>}
  </div>
}
