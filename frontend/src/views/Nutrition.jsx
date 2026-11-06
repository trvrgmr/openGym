import { useState } from 'react'
import { DAYS, fmtDate, fmtNum, todayISO } from '../lib/format.js'
import { t, dateLocale } from '../lib/i18n.js'
import {
  MEAL_TYPES,
  copyDayEntries,
  copyMealEntries,
  dayTotals,
  hasLoggedMeals,
  mealTotals,
  nutritionDay,
  nutritionGoalsOf,
  nutritionHistoryWindow,
  removeMealEntry,
  shiftISO,
} from '../lib/nutrition.js'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import Icon from '../components/Icon.jsx'
import CardHead from '../components/CardHead.jsx'
import DateField from '../components/DateField.jsx'
import SwipeRow from '../components/SwipeRow.jsx'
import NutritionFoodSheet, { deleteMealEntryWithUndo } from '../components/NutritionFoodSheet.jsx'
import NutritionCustomFoodsSheet from '../components/NutritionCustomFoodsSheet.jsx'
import NutritionGoalsSheet from '../components/NutritionGoalsSheet.jsx'
import NutritionHistorySheet from '../components/NutritionHistorySheet.jsx'
import { Button } from '../components/ui.jsx'

const pctWidth = (val, goal) => {
  if (!(goal > 0)) return '0%'
  return (Math.max(0, Math.min(1, val / goal)) * 100).toFixed(1).replace(/\.0$/, '') + '%'
}

const RING_R = 46
const RING_C = 2 * Math.PI * RING_R

function entrySubLine(it) {
  const macroLine = t('P {0}g · C {1}g · F {2}g', fmtNum(it.protein), fmtNum(it.carbs), fmtNum(it.fat))
  const hasQty = Number.isFinite(it.qty) && it.qty > 0 && it.qty !== 1
  if (it.serving && hasQty) return `${fmtNum(it.qty)} × ${it.serving} · ${macroLine}`
  if (it.serving) return `${it.serving} · ${macroLine}`
  if (hasQty) return `${fmtNum(it.qty)}× · ${macroLine}`
  return macroLine
}

function relativeDayWord(iso, todayKey) {
  if (iso === todayKey) return t('Today')
  if (iso === shiftISO(todayKey, -1)) return t('Yesterday')
  if (iso === shiftISO(todayKey, 1)) return t('Tomorrow')
  return null
}

export default function Nutrition() {
  const S = useStore(s => s.S)
  const todayKey = todayISO()
  const [selectedDate, setSelectedDate] = useState(todayKey)

  const activeDate = selectedDate || todayKey
  const activeDateObj = new Date(activeDate + 'T12:00:00')
  const relWord = relativeDayWord(activeDate, todayKey)
  const withYear = activeDate.slice(0, 4) !== todayKey.slice(0, 4)
  const formattedSubDate = activeDateObj.toLocaleDateString(dateLocale(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(withYear ? { year: 'numeric' } : {}),
  })

  const goals = nutritionGoalsOf(S)
  const day = nutritionDay(S, activeDate)
  const totals = dayTotals(day)

  const prevDate = shiftISO(activeDate, -1)
  const prevDay = nutritionDay(S, prevDate)
  const prevTotals = dayTotals(prevDay)
  const prevIsYesterday = activeDate === todayKey

  const diff = goals.kcal - totals.kcal
  const isOver = diff < 0
  const remaining = Math.max(0, diff)
  const overKcal = isOver ? Math.abs(diff) : 0
  const calRatio = goals.kcal > 0 ? Math.max(0, Math.min(1, totals.kcal / goals.kcal)) : 0
  const dashOffset = RING_C * (1 - calRatio)

  // Keep the 7-day strip anchored on today when browsing the last 7 days so columns stay put;
  // shift the window when inspecting older history or future dates.
  const minRecent = shiftISO(todayKey, -6)
  const histEnd = activeDate < minRecent || activeDate > todayKey ? activeDate : todayKey
  const historyDays = nutritionHistoryWindow(S, histEnd, 7)
  const loggedHist = historyDays.filter(d => d.logged)
  const avgKcal = loggedHist.length > 0
    ? Math.round(loggedHist.reduce((sum, d) => sum + d.kcal, 0) / loggedHist.length)
    : 0
  const histScaleMax = Math.max(goals.kcal * 1.15, ...historyDays.map(d => d.kcal), 1)
  const goalLinePct = goals.kcal > 0
    ? Math.min(100, Math.round((goals.kcal / histScaleMax) * 1000) / 10)
    : 0

  const macros = [
    { key: 'protein', label: t('Protein'), val: totals.protein, goal: goals.protein },
    { key: 'carbs', label: t('Carbs'), val: totals.carbs, goal: goals.carbs },
    { key: 'fat', label: t('Fat'), val: totals.fat, goal: goals.fat },
  ]

  const meals = [
    { key: 'breakfast', label: t('Breakfast'), icon: 'sunrise', tint: 'var(--orange)', items: day.meals.breakfast },
    { key: 'lunch', label: t('Lunch'), icon: 'sun', tint: 'var(--blue)', items: day.meals.lunch },
    { key: 'dinner', label: t('Dinner'), icon: 'moon', tint: 'var(--indigo)', items: day.meals.dinner },
    { key: 'snacks', label: t('Snacks'), icon: 'nutrition', tint: 'var(--green)', items: day.meals.snacks },
  ]

  const openAddFood = mealKey => {
    useUI.getState().openSheet(close => (
      <NutritionFoodSheet dateISO={activeDate} initialMeal={mealKey} close={close} />
    ))
  }

  const openEditEntry = (mealKey, entry) => {
    useUI.getState().openSheet(close => (
      <NutritionFoodSheet dateISO={activeDate} initialMeal={mealKey} entry={entry} close={close} />
    ))
  }

  const openCustomFoods = () => {
    useUI.getState().openSheet(close => <NutritionCustomFoodsSheet close={close} />)
  }

  const openHistory = () => {
    useUI.getState().openSheet(close => (
      <NutritionHistorySheet close={close} onSelectDate={setSelectedDate} />
    ))
  }

  const openGoals = () => {
    useUI.getState().openSheet(close => <NutritionGoalsSheet close={close} />)
  }

  const handleCopyMeal = mealKey => {
    const targetDate = activeDate
    let added = []
    useStore.getState().update(s => {
      added = copyMealEntries(s, prevDate, targetDate, mealKey)
    })
    if (!added.length) return
    const ids = added.map(e => e.id)
    useUI.getState().toast(prevIsYesterday ? t('Copied from yesterday') : t('Copied from previous day'), {
      action: t('Undo'),
      onAction: () => {
        useStore.getState().update(s => {
          for (const id of ids) removeMealEntry(s, targetDate, mealKey, id)
        })
      },
    })
  }

  const handleCopyDay = () => {
    const targetDate = activeDate
    let copied = { count: 0, entriesByMeal: {} }
    useStore.getState().update(s => {
      copied = copyDayEntries(s, prevDate, targetDate)
    })
    if (!copied.count) return
    useUI.getState().toast(prevIsYesterday ? t('Copied from yesterday') : t('Copied from previous day'), {
      action: t('Undo'),
      onAction: () => {
        useStore.getState().update(s => {
          for (const m of MEAL_TYPES) {
            for (const item of copied.entriesByMeal[m] || []) {
              removeMealEntry(s, targetDate, m, item.id)
            }
          }
        })
      },
    })
  }

  const showCopyDay = !hasLoggedMeals(day) && hasLoggedMeals(prevDay)

  return (
    <div className="narrow">
      <div className="hdr">
        <div>
          <h1>{t('Nutrition')}</h1>
          <div className="sub">{relWord ? `${relWord} · ${formattedSubDate}` : formattedSubDate}</div>
        </div>
        <div className="hdr-actions">
          <Button size="sm" variant="tinted" type="button" onClick={openCustomFoods} aria-label={t('My foods')}>
            <Icon name="utensils" />
            <span>{t('My foods')}</span>
          </Button>
          <Button size="sm" variant="tinted" type="button" onClick={openGoals} aria-label={t('Daily goal')}>
            <Icon name="target" />
            <span>{t('Goal')}</span>
          </Button>
        </div>
      </div>

      <div className="nutr-datebar">
        <button
          type="button"
          className="iconbtn"
          aria-label={t('Previous day')}
          onClick={() => setSelectedDate(d => shiftISO(d || todayKey, -1))}
        >
          <Icon name="chevronLeft" />
        </button>
        <div className="nutr-datebar-mid">
          <DateField
            value={activeDate}
            onChange={setSelectedDate}
            label={t('Date')}
            className="nutr-datef"
          />
          {activeDate !== todayKey && (
            <Button
              size="xs"
              variant="tinted"
              type="button"
              className="nutr-today-btn"
              onClick={() => setSelectedDate(todayKey)}
            >
              {t('Today')}
            </Button>
          )}
        </div>
        <button
          type="button"
          className="iconbtn"
          aria-label={t('Next day')}
          onClick={() => setSelectedDate(d => shiftISO(d || todayKey, 1))}
        >
          <Icon name="chevronRight" />
        </button>
      </div>

      <div className="card nutr-summary">
        <div
          className="nutr-cal-top"
          role="button"
          tabIndex={0}
          onClick={openHistory}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              openHistory()
            }
          }}
          aria-label={t('View 7-day history')}
        >
          <div className="nutr-ring-box" role="img" aria-label={t('{0} of {1} kcal', fmtNum(totals.kcal), fmtNum(goals.kcal))}>
            <svg className="nutr-ring-svg" viewBox="0 0 112 112" aria-hidden="true">
              <circle className="nutr-ring-track" cx="56" cy="56" r={RING_R} />
              <circle
                className={'nutr-ring-arc' + (isOver ? ' over' : '')}
                cx="56"
                cy="56"
                r={RING_R}
                strokeDasharray={RING_C.toFixed(2)}
                strokeDashoffset={dashOffset.toFixed(2)}
              />
            </svg>
            <div className="nutr-ring-inner" aria-hidden="true">
              <span className={'nutr-ring-num' + (isOver ? ' over' : '')}>
                {isOver ? `+${fmtNum(overKcal)}` : fmtNum(remaining)}
              </span>
              <span className="nutr-ring-lbl">{isOver ? t('kcal over') : t('kcal left')}</span>
            </div>
          </div>

          <div className="nutr-cal-stats">
            <div className="nutr-stat">
              <span className="nutr-stat-l">{t('Eaten')}</span>
              <span className="nutr-stat-v">{t('{0} kcal', fmtNum(totals.kcal))}</span>
            </div>
            <button
              type="button"
              className="nutr-stat tap"
              onClick={e => {
                e.stopPropagation()
                openGoals()
              }}
            >
              <span className="nutr-stat-l">{t('Daily goal')}</span>
              <span className="nutr-stat-v nutr-goal-link">
                <span>{t('{0} kcal', fmtNum(goals.kcal))}</span>
                <Icon name="pencil" />
              </span>
            </button>
            <div className="nutr-stat">
              <span className="nutr-stat-l">{isOver ? t('Over target') : t('Remaining')}</span>
              <span className={'nutr-stat-v ' + (isOver ? 'over' : 'acc')}>
                {isOver ? `+${t('{0} kcal', fmtNum(overKcal))}` : t('{0} kcal', fmtNum(remaining))}
              </span>
            </div>
          </div>
        </div>

        <div className="nutr-macros">
          {macros.map(m => (
            <div key={m.key} className="nutr-macro" role="group" aria-label={m.label}>
              <div className="nutr-macro-hd">
                <span className="nutr-macro-n">
                  <span className={'nutr-mdot ' + m.key} aria-hidden="true" />
                  <span>{m.label}</span>
                </span>
                <span className="nutr-macro-v">
                  <b>{fmtNum(m.val)}</b> / {t('{0} g', fmtNum(m.goal))}
                </span>
              </div>
              <div className="nutr-mbar-t" aria-hidden="true">
                <div className={'nutr-mbar-f ' + m.key} style={{ width: pctWidth(m.val, m.goal) }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card nutr-history" data-nutrition-history>
        <CardHead
          icon="chart"
          tint="var(--acc)"
          title={t('Last 7 days')}
          sub={loggedHist.length > 0 ? t('{0} kcal avg', fmtNum(avgKcal)) : t('Goal {0} kcal', fmtNum(goals.kcal))}
          action={
            <button
              type="button"
              className="iconbtn"
              data-open-history
              aria-label={t('History')}
              onClick={openHistory}
            >
              <Icon name="chevronRight" />
            </button>
          }
        />
        <div className="nutr-hist-grid" role="group" aria-label={t('Last 7 days')}>
          {historyDays.map(d => {
            const dow = new Date(d.date + 'T12:00:00').getDay()
            const dayNum = Number(d.date.slice(8, 10))
            const isSel = d.date === activeDate
            const isToday = d.date === todayKey
            const fillPct = d.kcal > 0 ? Math.min(100, Math.max(6, Math.round((d.kcal / histScaleMax) * 1000) / 10)) : 0
            return (
              <button
                key={d.date}
                type="button"
                className={
                  'nutr-hday' +
                  (isSel ? ' sel' : '') +
                  (isToday ? ' today' : '') +
                  (d.over ? ' over' : '') +
                  (d.logged ? ' has' : '')
                }
                data-hist-date={d.date}
                aria-pressed={isSel}
                aria-label={`${fmtDate(d.date, true)}: ${t('{0} of {1} kcal', fmtNum(d.kcal), fmtNum(d.goalKcal))}`}
                onClick={() => setSelectedDate(d.date)}
              >
                <span className="nutr-hval" aria-hidden="true">
                  {d.logged ? fmtNum(d.kcal) : '·'}
                </span>
                <span className="nutr-hbar-t" aria-hidden="true">
                  {goalLinePct > 0 && <span className="nutr-hbar-goal" style={{ bottom: `${goalLinePct}%` }} />}
                  {fillPct > 0 && <span className="nutr-hbar-f" style={{ height: `${fillPct}%` }} />}
                </span>
                <span className="nutr-hdow" aria-hidden="true">{t(DAYS[dow])}</span>
                <span className="nutr-hnum" aria-hidden="true">{dayNum}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="nutr-sec-row">
        <h4 className="sec">{t('Meals')}</h4>
        {showCopyDay && (
          <button
            type="button"
            className="nutr-copy-btn day"
            data-copy-day
            onClick={handleCopyDay}
          >
            <Icon name="copy" />
            <span>
              {prevIsYesterday
                ? t('Copy day from yesterday ({0} kcal)', fmtNum(prevTotals.kcal))
                : t('Copy day from previous day ({0} kcal)', fmtNum(prevTotals.kcal))}
            </span>
          </button>
        )}
      </div>

      {meals.map(meal => {
        const mealKcal = mealTotals(meal.items).kcal
        const prevMealItems = prevDay.meals[meal.key]
        const prevMealKcal = mealTotals(prevMealItems).kcal
        return (
          <div key={meal.key} className="card nutr-meal" data-meal={meal.key}>
            <CardHead
              icon={meal.icon}
              tint={meal.tint}
              title={meal.label}
              sub={t('{0} kcal', fmtNum(mealKcal))}
              action={
                <button
                  type="button"
                  className="iconbtn"
                  aria-label={t('Add to {0}', meal.label)}
                  onClick={() => openAddFood(meal.key)}
                >
                  <Icon name="plus" />
                </button>
              }
            />
            {meal.items.length > 0 ? (
              <div className="nutr-items">
                {meal.items.map(it => (
                  <SwipeRow
                    key={it.id}
                    className="nutr-swrow"
                    onDelete={() => deleteMealEntryWithUndo(activeDate, meal.key, it)}
                    deleteLabel={t('Delete')}
                  >
                    <button
                      type="button"
                      className="nutr-item tap"
                      data-entry-id={it.id}
                      onClick={() => openEditEntry(meal.key, it)}
                    >
                      <div className="nutr-item-m">
                        <div className="nutr-item-t">{it.name || t('Quick entry')}</div>
                        <div className="nutr-item-s">{entrySubLine(it)}</div>
                      </div>
                      <div className="nutr-item-k">{t('{0} kcal', fmtNum(it.kcal))}</div>
                    </button>
                  </SwipeRow>
                ))}
              </div>
            ) : (
              <div className="nutr-empty">
                <span className="nutr-empty-txt">{t('No food logged yet')}</span>
                {prevMealItems.length > 0 && (
                  <button
                    type="button"
                    className="nutr-copy-btn"
                    data-copy-meal={meal.key}
                    onClick={() => handleCopyMeal(meal.key)}
                  >
                    <Icon name="copy" />
                    <span>
                      {prevIsYesterday ? t('Copy from yesterday') : t('Copy from previous day')}
                      {' · '}
                      {t('{0} kcal', fmtNum(prevMealKcal))}
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
