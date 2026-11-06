// @vitest-environment happy-dom
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { useStore } from '../store/useStore.js'
import { todayISO } from '../lib/format.js'
import Home from './Home.jsx'

const mocks = { nav: vi.fn() }
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.nav }))
vi.mock('../sheets.jsx', () => ({
  starterPlanSheet: vi.fn(), bwSheet: vi.fn(), goalSheet: vi.fn(), dayOverrideSheet: vi.fn(),
  calendarSheet: vi.fn(), startFlow: vi.fn(), bwDeltaColor: () => '', weighInsSheet: vi.fn(),
}))

let host, root
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  mocks.nav.mockReset()
})
afterEach(() => { act(() => root.unmount()); host.remove() })

const mountHome = (stateOverrides = {}) => {
  const today = todayISO()
  useStore.setState(s => ({
    S: {
      ...s.S,
      routines: [{ id: 'r1', name: 'Upper Body', ex: [] }],
      workouts: [],
      bodyweight: [],
      dayPlan: {},
      week: { [new Date().getDay() === 0 ? 6 : new Date().getDay() - 1]: 'r1' },
      active: null,
      modules: { coach: true },
      nutritionLogs: {},
      ...stateOverrides,
    },
    user: { id: 'u1', name: 'Alex' },
    config: { coach: { enabled: true } },
  }))
  act(() => root.render(<Home />))
}

describe('AI Coach Hero Entry Card on Home', () => {
  it('renders prominently on Home when coach module is active', () => {
    mountHome()
    const coachCard = host.querySelector('.coach-home-card')
    expect(coachCard).toBeTruthy()
    expect(coachCard.textContent).toContain('AI Coach')
    expect(coachCard.textContent).toContain('Performance & Nutrition Coach')
    expect(coachCard.querySelector('.coach-home-pills')).toBeTruthy()
  })

  it('hides cleanly when coach module is switched off in Settings -> Modules', () => {
    mountHome({ modules: { coach: false } })
    const coachCard = host.querySelector('.coach-home-card')
    expect(coachCard).toBeNull()
  })

  it('shows "Meals logged · Workout pending" when user logged meals but workout is pending', () => {
    const today = todayISO()
    // today has planned routine r1, but no workout logged
    const dayPlan = { [today]: 'r1' }
    const nutritionLogs = {
      [today]: {
        meals: {
          breakfast: [{ id: 'm1', name: 'Eggs & Oats', kcal: 500, protein: 35, carbs: 45, fat: 15 }],
          lunch: [], dinner: [], snacks: []
        }
      }
    }
    mountHome({ dayPlan, nutritionLogs, workouts: [] })
    const sub = host.querySelector('.coach-home-card .card-head-sub')
    expect(sub?.textContent).toBe('Meals logged · Workout pending')
  })

  it('shows "Today’s workout and macros logged · Analysis ready" when both workout and meals are logged', () => {
    const today = todayISO()
    const workouts = [{ id: 'w1', d: today, routineId: 'r1', start: Date.now() - 3600000, end: Date.now(), entries: [] }]
    const nutritionLogs = {
      [today]: {
        meals: {
          lunch: [{ id: 'm2', name: 'Chicken Rice', kcal: 650, protein: 50, carbs: 70, fat: 12 }],
          breakfast: [], dinner: [], snacks: []
        }
      }
    }
    mountHome({ workouts, nutritionLogs })
    const sub = host.querySelector('.coach-home-card .card-head-sub')
    expect(sub?.textContent).toBe('Today’s workout and macros logged · Analysis ready')
  })

  it('shows "Workout logged · Log meals for nutrition analysis" when workout is logged but meals pending', () => {
    const today = todayISO()
    const workouts = [{ id: 'w1', d: today, routineId: 'r1', start: Date.now() - 3600000, end: Date.now(), entries: [] }]
    mountHome({ workouts, nutritionLogs: {} })
    const sub = host.querySelector('.coach-home-card .card-head-sub')
    expect(sub?.textContent).toBe('Workout logged · Log meals for nutrition analysis')
  })

  it('shows "Weekly performance & calorie correlation ready" on rest day or idle state', () => {
    mountHome({ workouts: [], nutritionLogs: {}, routines: [], dayPlan: {}, week: {} })
    const sub = host.querySelector('.coach-home-card .card-head-sub')
    expect(sub?.textContent).toBe('Weekly performance & calorie correlation ready')
  })

  it('navigates to #/coach on card tap or CTA action button click', () => {
    mountHome()
    const cardMain = host.querySelector('.coach-home-card .tap-main')
    expect(cardMain).toBeTruthy()
    act(() => cardMain.click())
    expect(mocks.nav).toHaveBeenCalledWith('/coach')

    mocks.nav.mockReset()
    const ctaBtn = host.querySelector('.coach-home-card .card-head .btn')
    expect(ctaBtn).toBeTruthy()
    act(() => ctaBtn.click())
    expect(mocks.nav).toHaveBeenCalledWith('/coach')
  })

  it('navigates to #/coach with prompt state when quick-action shortcut pills are tapped', () => {
    mountHome()
    const pills = [...host.querySelectorAll('.coach-home-pill')]
    expect(pills.length).toBe(3)

    // Weekly analysis pill
    act(() => pills[0].click())
    expect(mocks.nav).toHaveBeenCalledWith('/coach', { state: { prompt: 'Weekly analysis' } })

    mocks.nav.mockReset()
    // Macro status pill
    act(() => pills[1].click())
    expect(mocks.nav).toHaveBeenCalledWith('/coach', { state: { prompt: 'Macro status' } })

    mocks.nav.mockReset()
    // Ask Coach pill
    act(() => pills[2].click())
    expect(mocks.nav).toHaveBeenCalledWith('/coach', { state: { prompt: 'Ask Coach' } })
  })
})
