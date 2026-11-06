// @vitest-environment happy-dom
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { useStore, DEF } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { setLang } from '../lib/i18n.js'
import { todayISO } from '../lib/format.js'
import { addMealEntry, setNutritionGoals, shiftISO } from '../lib/nutrition.js'
import Modals from '../components/Modals.jsx'
import Home from './Home.jsx'

const nav = vi.fn()
vi.mock('react-router-dom', () => ({ useNavigate: () => nav }))
vi.mock('../sheets.jsx', () => ({
  starterPlanSheet: vi.fn(), bwSheet: vi.fn(), goalSheet: vi.fn(), dayOverrideSheet: vi.fn(),
  calendarSheet: vi.fn(), startFlow: vi.fn(), bwDeltaColor: () => '', weighInsSheet: vi.fn(),
}))
vi.mock('../lib/api.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    api: vi.fn(),
    setRemoteAuth: vi.fn(),
  }
})

let host, root

beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  nav.mockClear()
  localStorage.clear()
  useUI.getState().closeAll()
  useStore.setState({
    S: {
      ...JSON.parse(JSON.stringify(DEF)),
      routines: [{ id: 'r1', name: 'Push', emoji: null, ex: [] }],
      workouts: [],
      bodyweight: [],
      dayPlan: {},
      week: {},
      active: null,
      weighIn: false,
    },
    user: null,
    ready: true,
  })
  await setLang('en')
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(async () => {
  act(() => {
    useUI.getState().closeAll()
    root.unmount()
  })
  host.remove()
  localStorage.clear()
  await setLang('en')
})

const renderHome = () => act(() => {
  root.render(
    <>
      <Home />
      <Modals />
    </>
  )
})

describe('Home Nutrition 7-Day & Consistency Card', () => {
  it('renders dedicated nutrition card when nutrition module is enabled and hides it when disabled', () => {
    renderHome()
    expect(host.querySelector('.home-nutr-card')).not.toBeNull()
    expect(host.querySelector('.home-nutr-card .card-head-title')?.textContent).toBe('Diet consistency')

    // Disable nutrition module
    act(() => {
      useStore.setState(s => ({
        S: { ...s.S, modules: { nutrition: false } },
      }))
    })
    expect(host.querySelector('.home-nutr-card')).toBeNull()

    // Re-enable nutrition module
    act(() => {
      useStore.setState(s => ({
        S: { ...s.S, modules: { nutrition: true } },
      }))
    })
    expect(host.querySelector('.home-nutr-card')).not.toBeNull()
  })

  it('renders CardHead with icon, tint, eyebrow, title, sub, action button, and opens /nutrition on header tap', () => {
    renderHome()
    const card = host.querySelector('.home-nutr-card')
    expect(card).not.toBeNull()

    const head = card.querySelector('.card-head')
    expect(head.querySelector('.lbl2')?.textContent).toBe('Nutrition')
    expect(head.querySelector('.card-head-title')?.textContent).toBe('Diet consistency')
    expect(head.querySelector('.card-head-sub')?.textContent).toContain('0/100')
    expect(head.querySelector('.card-head-sub')?.textContent).toContain('Building habit')
    expect(head.querySelector('.card-head-sub')?.textContent).toContain('0 / 2,200 kcal')

    const actionBtn = head.querySelector('.btn')
    expect(actionBtn?.textContent).toContain('Nutrition')
    act(() => {
      actionBtn.click()
    })
    expect(nav).toHaveBeenCalledWith('/nutrition')

    // Tapping the card head main button navigates to /nutrition
    const tapMain = head.querySelector('.tap-main')
    act(() => {
      tapMain.click()
    })
    expect(nav).toHaveBeenCalledWith('/nutrition')
  })

  it('displays prominent consistency score badge, tier dot, label, and adherence stats', () => {
    renderHome()
    const badge = host.querySelector('.home-nutr-score-badge')
    expect(badge).not.toBeNull()
    expect(badge.classList.contains('tier-low')).toBe(true)
    expect(badge.querySelector('.home-nutr-score-val')?.textContent).toBe('0')
    expect(badge.querySelector('.home-nutr-score-unit')?.textContent).toBe('/100')

    const meta = host.querySelector('.home-nutr-score-meta')
    expect(meta.querySelector('.home-nutr-tier-name')?.textContent).toBe('Building habit')
    expect(meta.querySelector('.home-nutr-logged-stat')?.textContent).toBe('0 of 7 days logged')
    expect(meta.querySelector('.home-nutr-score-sub')?.textContent).toBe('Log food daily to track diet consistency')
  })

  it('calculates optimal score and updates subtitle, badge, and average when 7 days are logged', () => {
    const today = todayISO()
    // Configure 2000 kcal & 150g protein target
    useStore.getState().update(s => {
      setNutritionGoals(s, { kcal: 2000, protein: 150, carbs: 200, fat: 65 })
      // Log 2000 kcal and 150g protein on all 7 days
      for (let i = 0; i < 7; i++) {
        const d = shiftISO(today, -i)
        addMealEntry(s, d, 'lunch', {
          name: 'Healthy Lunch',
          kcal: 2000,
          protein: 150,
          carbs: 200,
          fat: 65,
        })
      }
    })

    renderHome()

    const headSub = host.querySelector('.home-nutr-card .card-head-sub')?.textContent
    expect(headSub).toContain('100/100')
    expect(headSub).toContain('Optimal')
    expect(headSub).toContain('2,000 / 2,000 kcal')

    const badge = host.querySelector('.home-nutr-score-badge')
    expect(badge.classList.contains('tier-optimal')).toBe(true)
    expect(badge.querySelector('.home-nutr-score-val')?.textContent).toBe('100')

    const meta = host.querySelector('.home-nutr-score-meta')
    expect(meta.querySelector('.home-nutr-tier-name')?.textContent).toBe('Optimal')
    expect(meta.querySelector('.home-nutr-logged-stat')?.textContent).toBe('7 of 7 days logged')
    expect(meta.querySelector('.home-nutr-score-sub')?.textContent).toContain('7-day average: 2,000 kcal / day')
  })

  it('renders interactive 7-day bar grid and navigates to /nutrition on day click', () => {
    renderHome()
    const grid = host.querySelector('.home-nutr-card .nutr-hist-grid')
    expect(grid).not.toBeNull()

    const dayBtns = grid.querySelectorAll('.nutr-hday')
    expect(dayBtns).toHaveLength(7)

    // Today is marked
    const todayBtn = grid.querySelector('.nutr-hday.today')
    expect(todayBtn).not.toBeNull()
    expect(todayBtn.getAttribute('data-hist-date')).toBe(todayISO())

    // Clicking any day navigates to /nutrition
    act(() => {
      todayBtn.click()
    })
    expect(nav).toHaveBeenCalledWith('/nutrition')
  })

  it('quick action pills open Log food, 7-day history, and Goals sheets directly from Home', () => {
    renderHome()
    const pills = host.querySelectorAll('.home-nutr-pill')
    expect(pills).toHaveLength(3)

    const logFoodPill = [...pills].find(b => b.textContent.includes('Log food'))
    const historyPill = [...pills].find(b => b.textContent.includes('7-day history'))
    const goalsPill = [...pills].find(b => b.textContent.includes('Goals'))

    expect(logFoodPill).toBeTruthy()
    expect(historyPill).toBeTruthy()
    expect(goalsPill).toBeTruthy()

    // 1. Log food pill -> opens NutritionFoodSheet
    act(() => {
      logFoodPill.click()
    })
    let sheet = host.querySelector('#modal-root .sheet')
    expect(sheet).not.toBeNull()
    expect(sheet.querySelector('h3')?.textContent).toContain('Add to Breakfast')
    act(() => {
      useUI.getState().closeAll()
    })
    expect(host.querySelector('#modal-root .sheet')).toBeNull()

    // 2. 7-day history pill -> opens NutritionHistorySheet
    act(() => {
      historyPill.click()
    })
    sheet = host.querySelector('#modal-root .sheet')
    expect(sheet).not.toBeNull()
    expect(sheet.querySelector('h3')?.textContent).toBe('History & analytics')
    act(() => {
      useUI.getState().closeAll()
    })
    expect(host.querySelector('#modal-root .sheet')).toBeNull()

    // 3. Goals pill -> opens NutritionGoalsSheet
    act(() => {
      goalsPill.click()
    })
    sheet = host.querySelector('#modal-root .sheet')
    expect(sheet).not.toBeNull()
    expect(sheet.querySelector('h3')?.textContent).toBe('Daily goals')
    act(() => {
      useUI.getState().closeAll()
    })
    expect(host.querySelector('#modal-root .sheet')).toBeNull()
  })
})
