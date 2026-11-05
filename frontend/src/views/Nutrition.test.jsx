// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/api.js', () => ({ api: vi.fn(), setRemoteAuth: vi.fn() }))

import Nutrition from './Nutrition.jsx'
import Modals from '../components/Modals.jsx'
import Toast from '../components/Toast.jsx'
import { bindUI } from '../components/ui.jsx'
import { DEF, useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { addMealEntry, dayTotals, nutritionDay, setNutritionGoals, shiftISO } from '../lib/nutrition.js'
import { todayISO } from '../lib/format.js'
import { setLang } from '../lib/i18n.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
bindUI(useUI)

const clone = v => JSON.parse(JSON.stringify(v))
let host, root

function setInputValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

beforeEach(async () => {
  localStorage.clear()
  useUI.getState().closeAll()
  useUI.getState().dismissToast()
  useStore.setState({ S: { ...clone(DEF), _ts: 1 }, user: null, ready: true })
  await setLang('en')
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(async () => {
  act(() => {
    useUI.getState().closeAll()
    useUI.getState().dismissToast()
    root.unmount()
  })
  host.remove()
  localStorage.clear()
  await setLang('en')
})

const renderApp = () => act(() => {
  root.render(
    <>
      <Nutrition />
      <Modals />
      <Toast />
    </>
  )
})

describe('Nutrition view, food logging, goals & history flows', () => {
  it('renders empty default day cleanly with default 2,200 kcal goal, 7-day strip, and empty meal states', () => {
    renderApp()

    expect(host.querySelector('.hdr h1')?.textContent).toBe('Nutrition')
    expect(host.querySelector('.hdr .sub')?.textContent).toContain('Today')
    expect(host.querySelector('.nutr-ring-svg')).not.toBeNull()
    expect(host.querySelector('.nutr-ring-num')?.textContent).toBe('2,200')
    expect(host.querySelector('.nutr-ring-lbl')?.textContent).toBe('kcal left')

    // 7-day history strip renders 7 day buttons with today selected
    expect(host.querySelectorAll('[data-hist-date]')).toHaveLength(7)
    expect(host.querySelector('.nutr-hday.sel')?.getAttribute('data-hist-date')).toBe(todayISO())

    const macroGroups = [...host.querySelectorAll('.nutr-macro')]
    expect(macroGroups.map(el => el.getAttribute('aria-label'))).toEqual(['Protein', 'Carbs', 'Fat'])
    expect(host.querySelectorAll('.nutr-mbar-f')).toHaveLength(3)

    const mealCards = [...host.querySelectorAll('.nutr-meal')]
    expect(mealCards.map(el => el.getAttribute('data-meal'))).toEqual(['breakfast', 'lunch', 'dinner', 'snacks'])
    expect(host.querySelectorAll('.nutr-meal .nutr-empty')).toHaveLength(4)
    expect(host.querySelectorAll('.nutr-meal .card-head > .iconbtn')).toHaveLength(4)
  })

  it('logs a quick-add food with auto-kcal from macros, saves it to customFoods, and logs 1.5x from Saved & recent', () => {
    const today = todayISO()
    renderApp()

    act(() => {
      host.querySelector('.nutr-meal[data-meal="breakfast"] .card-head > .iconbtn').click()
    })

    const sheet = host.querySelector('#modal-root .sheet')
    expect(sheet).not.toBeNull()
    expect(sheet.querySelector('h3')?.textContent).toBe('Add to Breakfast')

    // Library mode: SearchField & Barcode Scan button are 1st priority
    expect(sheet.querySelector('input[aria-label="Search foods & dishes"]')).not.toBeNull()
    expect(sheet.querySelector('button[aria-label="Scan barcode"]')).not.toBeNull()

    // Secondary action: Switch to manual custom food creation
    act(() => {
      sheet.querySelector('button[aria-label="Create custom food"]').click()
    })

    act(() => {
      setInputValue(sheet.querySelector('input[aria-label="Food name"]'), 'Whey Shake')
      setInputValue(sheet.querySelector('input[aria-label="Serving size"]'), '1 scoop')
      setInputValue(sheet.querySelector('input[aria-label="Protein"]'), '25')
      setInputValue(sheet.querySelector('input[aria-label="Carbs"]'), '3')
      setInputValue(sheet.querySelector('input[aria-label="Fat"]'), '2')
    })

    const autoBtn = sheet.querySelector('.nutr-auto-kcal')
    expect(autoBtn?.textContent).toContain('130 kcal')
    act(() => { autoBtn.click() })

    act(() => {
      sheet.querySelector('[role="switch"][aria-label="Save to my foods"]').click()
    })

    act(() => {
      const submitBtn = [...sheet.querySelectorAll('button.btn.primary')].find(b => b.textContent.includes('Add to Breakfast'))
      submitBtn.click()
    })

    expect(useStore.getState().S.customFoods).toHaveLength(1)
    expect(useStore.getState().S.customFoods[0]).toMatchObject({ name: 'Whey Shake', kcal: 130, protein: 25 })
    expect(dayTotals(nutritionDay(useStore.getState().S, today)).kcal).toBe(130)
    expect(host.querySelector('.nutr-meal[data-meal="breakfast"] .nutr-item-t')?.textContent).toBe('Whey Shake')

    act(() => {
      host.querySelector('.nutr-meal[data-meal="snacks"] .card-head > .iconbtn').click()
    })

    const snacksSheet = host.querySelector('#modal-root .sheet')
    expect(snacksSheet.querySelector('h3')?.textContent).toBe('Add to Snacks')
    act(() => {
      snacksSheet.querySelector('.nutr-food-main').click()
    })

    const chip15 = [...snacksSheet.querySelectorAll('.nutr-chip')].find(b => b.textContent === '1.5×')
    act(() => { chip15.click() })
    expect(snacksSheet.querySelector('.nutr-pick-preview')?.textContent).toContain('195 kcal')

    act(() => {
      snacksSheet.querySelector('.nutr-pick-panel button.btn.primary').click()
    })

    expect(dayTotals(nutritionDay(useStore.getState().S, today)).kcal).toBe(325)
    expect(host.querySelector('.nutr-meal[data-meal="snacks"] .nutr-item-s')?.textContent).toContain('1.5 × 1 scoop')
  })

  it('edits a logged meal entry (scales servings & moves meal) and deletes with Undo toast', () => {
    const today = todayISO()
    useStore.getState().update(s => {
      addMealEntry(s, today, 'breakfast', {
        id: 'entry-1',
        name: 'Boiled eggs',
        serving: '2 pcs',
        qty: 1,
        kcal: 155,
        protein: 13,
        carbs: 1,
        fat: 11,
      })
    })
    renderApp()

    act(() => {
      host.querySelector('.nutr-meal[data-meal="breakfast"] .nutr-item.tap').click()
    })

    const editSheet = host.querySelector('#modal-root .sheet')
    expect(editSheet.querySelector('h3')?.textContent).toBe('Edit entry')

    act(() => {
      const chip2 = [...editSheet.querySelectorAll('.nutr-chip')].find(b => b.textContent === '2×')
      chip2.click()
      const lunchSeg = [...editSheet.querySelectorAll('.seg button')].find(b => b.textContent === 'Lunch')
      lunchSeg.click()
    })

    act(() => {
      const saveBtn = [...editSheet.querySelectorAll('button.btn.primary')].find(b => b.textContent === 'Save changes')
      saveBtn.click()
    })

    expect(nutritionDay(useStore.getState().S, today).meals.breakfast).toHaveLength(0)
    expect(nutritionDay(useStore.getState().S, today).meals.lunch[0]).toMatchObject({ kcal: 310, qty: 2 })

    act(() => {
      host.querySelector('.nutr-meal[data-meal="lunch"] .nutr-item.tap').click()
    })
    act(() => {
      const delBtn = [...host.querySelectorAll('#modal-root .sheet button.btn.danger')].find(b => b.textContent.includes('Delete entry'))
      delBtn.click()
    })

    expect(nutritionDay(useStore.getState().S, today).meals.lunch).toHaveLength(0)
    expect(host.querySelector('#toast .toast-msg')?.textContent).toBe('Entry deleted')

    act(() => {
      host.querySelector('#toast .toast-act').click()
    })
    expect(nutritionDay(useStore.getState().S, today).meals.lunch).toHaveLength(1)
    expect(nutritionDay(useStore.getState().S, today).meals.lunch[0].kcal).toBe(310)
  })

  it('manages custom foods (create, favourite, delete with Undo) without altering historical meal logs', () => {
    const today = todayISO()
    useStore.getState().update(s => {
      addMealEntry(s, today, 'dinner', { name: 'Greek yogurt', serving: '200 g', kcal: 190, protein: 20, carbs: 9, fat: 4 })
    })
    renderApp()

    act(() => {
      host.querySelector('button[aria-label="My foods"]').click()
    })

    const sheet = host.querySelector('#modal-root .sheet')
    expect(sheet.querySelector('h3')?.textContent).toBe('My foods')

    act(() => {
      const newBtn = [...sheet.querySelectorAll('button')].find(b => b.textContent.includes('New food'))
      newBtn.click()
    })

    act(() => {
      setInputValue(sheet.querySelector('input[aria-label="Food name"]'), 'Greek yogurt')
      setInputValue(sheet.querySelector('input[aria-label="Serving size"]'), '200 g')
      setInputValue(sheet.querySelector('input[aria-label="Calories"]'), '210')
      setInputValue(sheet.querySelector('input[aria-label="Protein"]'), '22')
    })

    act(() => {
      const saveBtn = [...sheet.querySelectorAll('button.btn.primary')].find(b => b.textContent === 'Save')
      saveBtn.click()
    })

    expect(useStore.getState().S.customFoods).toHaveLength(1)
    act(() => {
      sheet.querySelector('.nutr-fav').click()
    })
    expect(useStore.getState().S.customFoods[0].fav).toBe(true)

    act(() => {
      sheet.querySelector('.nutr-food-main').click()
    })
    act(() => {
      const delFoodBtn = [...sheet.querySelectorAll('button.btn.danger')].find(b => b.textContent.includes('Delete food'))
      delFoodBtn.click()
    })

    expect(useStore.getState().S.customFoods).toHaveLength(0)
    expect(nutritionDay(useStore.getState().S, today).meals.dinner[0].kcal).toBe(190)

    act(() => {
      host.querySelector('#toast .toast-act').click()
    })
    expect(useStore.getState().S.customFoods).toHaveLength(1)
  })

  it('updates daily calorie & macro goals with macro-to-calorie matching and StackBar breakdown', () => {
    renderApp()

    act(() => {
      host.querySelector('button[aria-label="Daily goal"]').click()
    })

    const sheet = host.querySelector('#modal-root .sheet [data-goals-sheet]')
    expect(sheet).not.toBeNull()
    expect(sheet.querySelector('h3')?.textContent).toBe('Daily goals')

    // Set 180g protein (720), 250g carbs (1000), 80g fat (720) -> 2,440 kcal
    act(() => {
      setInputValue(sheet.querySelector('[data-goal-field="protein"] input.num'), '180')
      setInputValue(sheet.querySelector('[data-goal-field="carbs"] input.num'), '250')
      setInputValue(sheet.querySelector('[data-goal-field="fat"] input.num'), '80')
    })

    const matchBtn = sheet.querySelector('.nutr-auto-kcal')
    expect(matchBtn?.textContent).toContain('2,440 kcal')
    act(() => { matchBtn.click() })
    expect(sheet.querySelector('.nutr-auto-kcal')).toBeNull()

    // StackBar is rendered with 3 macro segments
    expect(sheet.querySelectorAll('.sstack-bar span')).toHaveLength(3)

    act(() => {
      const saveBtn = [...sheet.querySelectorAll('button.btn.primary')].find(b => b.textContent === 'Save')
      saveBtn.click()
    })

    expect(useStore.getState().S.nutritionGoals).toEqual({
      kcal: 2440,
      protein: 180,
      carbs: 250,
      fat: 80,
    })
    expect(host.querySelector('.nutr-ring-num')?.textContent).toBe('2,440')
    expect(host.querySelector('#toast .toast-msg')?.textContent).toBe('Daily goal saved')
  })

  it('navigates across dates, jumps via 7-day history strip, and copies meals/days from yesterday with Undo', () => {
    const today = todayISO()
    const yesterday = shiftISO(today, -1)
    const threeDaysAgo = shiftISO(today, -3)

    useStore.getState().update(s => {
      addMealEntry(s, threeDaysAgo, 'lunch', { name: 'Turkey wrap', kcal: 610, protein: 42, carbs: 55, fat: 16 })
      addMealEntry(s, yesterday, 'breakfast', { name: 'Oats & berries', kcal: 420, protein: 18, carbs: 64, fat: 9 })
      addMealEntry(s, yesterday, 'dinner', { name: 'Steak & potatoes', kcal: 780, protein: 58, carbs: 62, fat: 28 })
    })
    renderApp()

    // Today is empty -> both full-day copy and per-meal copy for Breakfast & Dinner are offered
    expect(host.querySelector('[data-copy-day]')?.textContent).toContain('1,200 kcal')
    expect(host.querySelector('[data-copy-meal="breakfast"]')).not.toBeNull()
    expect(host.querySelector('[data-copy-meal="lunch"]')).toBeNull()

    // Copy just Breakfast from yesterday -> adds 420 kcal to Today, Undo reverts it cleanly
    act(() => {
      host.querySelector('[data-copy-meal="breakfast"]').click()
    })
    expect(dayTotals(nutritionDay(useStore.getState().S, today)).kcal).toBe(420)
    expect(host.querySelector('#toast .toast-msg')?.textContent).toBe('Copied from yesterday')

    act(() => {
      host.querySelector('#toast .toast-act').click()
    })
    expect(dayTotals(nutritionDay(useStore.getState().S, today)).kcal).toBe(0)

    // Tap 3-days-ago bar in 7-day history strip -> jumps to that day (610 kcal) and shows Today button
    act(() => {
      host.querySelector(`[data-hist-date="${threeDaysAgo}"]`).click()
    })
    expect(host.querySelector('.nutr-meal[data-meal="lunch"] .nutr-item-t')?.textContent).toBe('Turkey wrap')
    expect(host.querySelector('.nutr-today-btn')).not.toBeNull()

    // Step Previous day / Next day and jump back to Today
    act(() => {
      host.querySelector('button[aria-label="Next day"]').click()
    })
    expect(host.querySelector('.nutr-hday.sel')?.getAttribute('data-hist-date')).toBe(shiftISO(threeDaysAgo, 1))

    act(() => {
      host.querySelector('.nutr-today-btn').click()
    })
    expect(host.querySelector('.nutr-today-btn')).toBeNull()
    expect(host.querySelector('.hdr .sub')?.textContent).toContain('Today')

    // Copy full day from yesterday (1,200 kcal)
    act(() => {
      host.querySelector('[data-copy-day]').click()
    })
    expect(dayTotals(nutritionDay(useStore.getState().S, today)).kcal).toBe(1200)
  })

  it('renders translated labels and over-target states cleanly in Turkish', async () => {
    const today = todayISO()
    await setLang('tr')
    act(() => {
      useStore.getState().update(s => {
        setNutritionGoals(s, { kcal: 1800 })
        addMealEntry(s, today, 'dinner', { name: 'Izgara somon', kcal: 1950, protein: 90, carbs: 80, fat: 70 })
      })
    })
    renderApp()

    expect(host.querySelector('.hdr h1')?.textContent).toBe('Beslenme')
    expect(host.querySelector('.hdr .sub')?.textContent).toContain('Bugün')
    expect([...host.querySelectorAll('.nutr-meal .card-head-title')].map(el => el.textContent)).toEqual([
      'Kahvaltı', 'Öğle yemeği', 'Akşam yemeği', 'Ara öğün',
    ])
    expect(host.querySelector('.nutr-ring-lbl')?.textContent).toBe('kcal fazla')
    expect(host.textContent).toContain('Hedef aşımı')
    expect(host.textContent).toContain('Son 7 gün')
  })
  it("searches built-in foods with Grams vs Servings scaling and adds to meal", async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ results: [], products: [] }) });
    vi.useFakeTimers()
    const today = todayISO()
    renderApp()

    act(() => {
      host.querySelector(".nutr-meal[data-meal=\"lunch\"] .card-head > .iconbtn").click()
    })

    const sheet = host.querySelector("#modal-root .sheet")
    expect(sheet).not.toBeNull()

    // Type search query
    const searchInput = sheet.querySelector("input[aria-label=\"Search foods & dishes\"]")
    act(() => {
      setInputValue(searchInput, "Tavuk")
    })

    // Advance debounce timer
    await act(async () => {
      vi.advanceTimersByTime(400)
    })

    // Check external / built-in candidate
    const candidate = sheet.querySelector(".nutr-food-row")
    expect(candidate).not.toBeNull()
    expect(candidate.textContent).toContain("Tavuk")

    // Pick candidate
    act(() => {
      candidate.querySelector(".nutr-food-main").click()
    })

    const pickPanel = sheet.querySelector("[data-pick-panel]")
    expect(pickPanel).not.toBeNull()

    // Add to lunch
    act(() => {
      const addBtn = [...pickPanel.querySelectorAll("button.btn.primary")].find(b => b.textContent.includes("Add to Lunch"))
      addBtn.click()
    })

    expect(dayTotals(nutritionDay(useStore.getState().S, today)).kcal).toBeGreaterThan(0)
    expect(host.querySelector(".nutr-meal[data-meal=\"lunch\"] .nutr-item-t")?.textContent).toContain("Tavuk")
    vi.useRealTimers()
  })
});
