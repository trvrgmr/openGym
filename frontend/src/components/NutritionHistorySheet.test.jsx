// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import NutritionHistorySheet from './NutritionHistorySheet.jsx'
import { addMealEntry, shiftISO } from '../lib/nutrition.js'
import { todayISO } from '../lib/format.js'
import { useStore } from '../store/useStore.js'

describe('NutritionHistorySheet', () => {
  let container

  beforeEach(() => {
    localStorage.clear()
    useStore.setState({
      S: {
        settings: { lang: 'en' },
        nutrition: {
          days: {},
          goals: { kcal: 2200, protein: 160, carbs: 220, fat: 70 },
        },
      },
    })
    container = document.createElement('div')
    document.body.replaceChildren(container)
  })

  it('renders history sheet with 7d and 30d tabs and day list', () => {
    const today = todayISO()
    const yesterday = shiftISO(today, -1)

    // Add entries to today and yesterday
    useStore.getState().update(s => {
      addMealEntry(s, today, 'lunch', {
        name: 'Tavuk Göğsü',
        kcal: 500,
        protein: 60,
        carbs: 10,
        fat: 5,
      })
      addMealEntry(s, yesterday, 'dinner', {
        name: 'Büyük Ziyafet',
        kcal: 2500, // over goal
        protein: 100,
        carbs: 300,
        fat: 80,
      })
    })

    const closeMock = vi.fn()
    const selectDateMock = vi.fn()

    act(() => {
      createRoot(container).render(
        <NutritionHistorySheet close={closeMock} onSelectDate={selectDateMock} />
      )
    })

    const sheet = container.querySelector('[data-nutrition-history-sheet]')
    expect(sheet).not.toBeNull()

    // Check segmented tabs: ONLY 2 tabs (7d and 30d)
    const buttons = container.querySelectorAll('.seg button')
    expect(buttons.length).toBe(2)

    // Check rows rendered (7 days default)
    const rows = container.querySelectorAll('[data-hist-row]')
    expect(rows.length).toBe(7)

    // Yesterday row has over-target tag
    const yestRow = container.querySelector(`[data-hist-row="${yesterday}"]`)
    expect(yestRow).not.toBeNull()
    expect(yestRow.textContent).toContain('2,500 of 2,200 kcal')
    expect(yestRow.textContent).toContain('Over target')

    // Clicking yesterday row selects date and closes
    act(() => {
      yestRow.click()
    })
    expect(selectDateMock).toHaveBeenCalledWith(yesterday)
    expect(closeMock).toHaveBeenCalled()
  })

  it('switches to 30 days view when 30d tab is selected', () => {
    act(() => {
      createRoot(container).render(
        <NutritionHistorySheet close={vi.fn()} onSelectDate={vi.fn()} />
      )
    })

    const buttons = container.querySelectorAll('.seg button')
    // Click 30d button
    act(() => {
      buttons[1].click()
    })

    const rows = container.querySelectorAll('[data-hist-row]')
    expect(rows.length).toBe(30)
  })
})
