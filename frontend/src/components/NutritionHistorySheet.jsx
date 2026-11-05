import { useMemo, useState } from 'react'
import { fmtDate, fmtNum, todayISO } from '../lib/format.js'
import { dateLocale, t } from '../lib/i18n.js'
import { nutritionGoalsOf, nutritionHistoryWindow, shiftISO } from '../lib/nutrition.js'
import { useStore } from '../store/useStore.js'
import Icon from './Icon.jsx'
import { Segmented } from './ui.jsx'

export default function NutritionHistorySheet({ close, onSelectDate }) {
  const S = useStore(s => s.S)
  const todayKey = todayISO()
  const goals = nutritionGoalsOf(S)

  // Tabs: '7d' (Last 7 days) and '30d' (Last 30 days)
  const [tab, setTab] = useState('7d')
  const [offset, setOffset] = useState(0) // 0 = current period, 1 = 1 period back, etc.

  const handleTabChange = newTab => {
    setTab(newTab)
    setOffset(0)
  }

  const periodDays = tab === '30d' ? 30 : 7
  const endISO = shiftISO(todayKey, -(offset * periodDays))
  const startISO = shiftISO(endISO, -(periodDays - 1))

  const historyDays = useMemo(() => {
    return nutritionHistoryWindow(S, endISO, periodDays)
  }, [S, endISO, periodDays])

  // Summaries
  const loggedDays = historyDays.filter(d => d.logged)
  const totalKcal = loggedDays.reduce((sum, d) => sum + d.kcal, 0)
  const avgKcal = loggedDays.length > 0 ? Math.round(totalKcal / loggedDays.length) : 0
  const avgProt = loggedDays.length > 0
    ? Math.round((loggedDays.reduce((sum, d) => sum + d.protein, 0) / loggedDays.length) * 10) / 10
    : 0
  const avgCarbs = loggedDays.length > 0
    ? Math.round((loggedDays.reduce((sum, d) => sum + d.carbs, 0) / loggedDays.length) * 10) / 10
    : 0
  const avgFat = loggedDays.length > 0
    ? Math.round((loggedDays.reduce((sum, d) => sum + d.fat, 0) / loggedDays.length) * 10) / 10
    : 0

  const daysOver = loggedDays.filter(d => d.over).length
  const daysOnTarget = loggedDays.filter(d => !d.over && d.kcal > 0).length

  // Date range label
  const startObj = new Date(startISO + 'T12:00:00')
  const endObj = new Date(endISO + 'T12:00:00')
  const rangeLabel = `${startObj.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' })} – ${endObj.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric' })}`

  // Reversed chronological list (newest first for viewing)
  const chronList = useMemo(() => [...historyDays].reverse(), [historyDays])

  const selectDay = date => {
    onSelectDate?.(date)
    close?.()
  }

  return (
    <div className="nutr-sheet nutr-hist-sheet" data-nutrition-history-sheet>
      <div className="nutr-sheet-top">
        <h3>{t('History & analytics')}</h3>
        <button
          type="button"
          className="iconbtn"
          onClick={close}
          aria-label={t('Close')}
        >
          <Icon name="xmark" />
        </button>
      </div>

      <Segmented
        options={[
          { value: '7d', label: t('Last 7 days') },
          { value: '30d', label: t('Last 30 days') },
        ]}
        value={tab}
        onChange={handleTabChange}
      />

      <div className="nutr-hist-nav">
        <button
          type="button"
          className="iconbtn"
          aria-label={t('Previous day')}
          onClick={() => setOffset(o => o + 1)}
        >
          <Icon name="chevronLeft" />
        </button>
        <span className="nutr-hist-range-lbl">{rangeLabel}</span>
        <button
          type="button"
          className="iconbtn"
          disabled={offset === 0}
          aria-label={t('Next day')}
          onClick={() => setOffset(o => Math.max(0, o - 1))}
        >
          <Icon name="chevronRight" />
        </button>
      </div>

      <div className="nutr-hist-summary">
        <div className="nutr-hist-stat-box">
          <span className="nutr-hist-stat-val">{t('{0} kcal', fmtNum(avgKcal))}</span>
          <span className="nutr-hist-stat-sub">
            {t('Daily average')} ({t('{0} kcal avg', fmtNum(avgKcal))})
          </span>
          <span className="nutr-hist-stat-sub">
            {t('P {0}g · C {1}g · F {2}g', fmtNum(avgProt), fmtNum(avgCarbs), fmtNum(avgFat))}
          </span>
        </div>

        <div className="nutr-hist-stat-box">
          <span className="nutr-hist-stat-val">
            <span style={{ color: 'var(--acc-ink)' }}>{daysOnTarget}</span> / <span style={{ color: 'var(--orange-ink)' }}>{daysOver}</span>
          </span>
          <span className="nutr-hist-stat-sub">{t('Days on target')}: {daysOnTarget}</span>
          <span className="nutr-hist-stat-sub">{t('Days over target')}: {daysOver}</span>
        </div>
      </div>

      <div className="nutr-hist-list" role="list">
        {chronList.map(d => {
          const isToday = d.date === todayKey
          const isYesterday = d.date === shiftISO(todayKey, -1)
          const relWord = isToday ? t('Today') : (isYesterday ? t('Yesterday') : null)
          const dateObj = new Date(d.date + 'T12:00:00')
          const dayLabel = relWord
            ? `${relWord} (${dateObj.toLocaleDateString(dateLocale(), { weekday: 'short', day: 'numeric', month: 'short' })})`
            : dateObj.toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'short' })

          const barPct = d.ratio > 0 ? Math.min(100, Math.round(d.ratio * 100)) : 0

          return (
            <button
              key={d.date}
              type="button"
              className="nutr-hist-item"
              data-hist-row={d.date}
              onClick={() => selectDay(d.date)}
            >
              <div className="nutr-hist-item-hd">
                <span className="nutr-hist-item-date">{dayLabel}</span>
                {d.logged ? (
                  <span className={'nutr-hist-item-cals' + (d.over ? ' over' : '')}>
                    {t('{0} of {1} kcal', fmtNum(d.kcal), fmtNum(d.goalKcal))}
                  </span>
                ) : (
                  <span className="nutr-hist-item-cals empty">{t('No logged meals')}</span>
                )}
              </div>

              {d.logged ? (
                <>
                  <div className="nutr-hist-item-sub">
                    <span>{t('P {0}g · C {1}g · F {2}g', fmtNum(d.protein), fmtNum(d.carbs), fmtNum(d.fat))}</span>
                    <span className={'nutr-tag ' + (d.over ? 'over' : 'on')}>
                      {d.over ? t('Over target') : t('{0}%', fmtNum(Math.round(d.ratio * 100)))}
                    </span>
                  </div>
                  <div className="nutr-hist-item-bar" aria-hidden="true">
                    <div
                      className={'nutr-hist-item-bar-f' + (d.over ? ' over' : '')}
                      style={{ width: `${barPct}%` }}
                    />
                  </div>
                </>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
