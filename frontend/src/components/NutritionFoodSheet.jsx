import { useEffect, useRef, useState } from 'react'
import { fmtNum } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import {
  MEAL_TYPES,
  addMealEntry,
  cleanKcal,
  cleanMacro,
  kcalFromMacros,
  nutritionDay,
  recentFoodsFromLogs,
  removeMealEntry,
  restoreMealEntry,
  scaleFoodMacros,
  sortedCustomFoods,
  updateMealEntry,
  upsertCustomFood,
} from '../lib/nutrition.js'
import { cacheFoodItem, lookupBarcode, searchExternalFoods } from '../lib/food-lookup.js'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import CameraScan from './CameraScan.jsx'
import Icon from './Icon.jsx'
import NutritionCustomFoodsSheet from './NutritionCustomFoodsSheet.jsx'
import { Button, NumberField, Row, SearchField, Segmented, Stepper, Switch, TextField } from './ui.jsx'

const MULTIPLIER_PRESETS = [0.5, 1, 1.5, 2]
const GRAM_PRESETS = [50, 100, 150, 200]

export function mealLabelOf(key) {
  if (key === 'breakfast') return t('Breakfast')
  if (key === 'lunch') return t('Lunch')
  if (key === 'dinner') return t('Dinner')
  return t('Snacks')
}

export function sourceBadgeOf(source) {
  if (source === 'diyetkolik') return t('Diyetkolik')
  if (source === 'usda') return t('USDA')
  if (source === 'builtin') return t('Built-in')
  if (source === 'openfoodfacts') return t('Open Food Facts')
  return null
}

export function deleteMealEntryWithUndo(dateISO, mealKey, entry) {
  if (!entry?.id) return
  const day = nutritionDay(useStore.getState().S, dateISO)
  const list = day.meals[mealKey] || []
  const idx = list.findIndex(x => x.id === entry.id)
  const snapshot = JSON.parse(JSON.stringify(entry))
  useStore.getState().update(s => {
    removeMealEntry(s, dateISO, mealKey, entry.id)
  })
  useUI.getState().toast(t('Entry deleted'), {
    action: t('Undo'),
    onAction: () => {
      useStore.getState().update(s => {
        restoreMealEntry(s, dateISO, mealKey, snapshot, idx)
      })
    },
  })
}

export default function NutritionFoodSheet({ dateISO, initialMeal = 'breakfast', entry = null, close }) {
  const S = useStore(s => s.S)
  const savedFoods = sortedCustomFoods(S)
  const savedKeys = new Set(savedFoods.map(f => `id:${f.id}`))
  const savedNames = new Set(savedFoods.map(f => `${f.name.toLowerCase()}|${f.serving.toLowerCase()}`))
  const recentFoods = recentFoodsFromLogs(S, 15).filter(r => {
    if (r.foodId && savedKeys.has(`id:${r.foodId}`)) return false
    return !savedNames.has(`${r.name.toLowerCase()}|${r.serving.toLowerCase()}`)
  })

  const [meal, setMeal] = useState(MEAL_TYPES.includes(initialMeal) ? initialMeal : 'breakfast')
  // Modes: 'library' (search & browse, 1st priority), 'quick' (manual custom creation, 2nd priority), 'edit', 'scan'
  const [mode, setMode] = useState(() => (entry ? 'edit' : 'library'))
  const [query, setQuery] = useState('')
  const [scanning, setScanning] = useState(false)
  const [externalHits, setExternalHits] = useState([])
  const [searching, setSearching] = useState(false)

  // Selected food item for serving / gram scaling preview
  const [picked, setPicked] = useState(null)
  const [scaleMode, setScaleMode] = useState('servings') // 'servings' | 'grams'
  const [pickQty, setPickQty] = useState(1)
  const [pickGrams, setPickGrams] = useState(100)

  // Manual Quick-add / Custom food form state
  const initQty = entry?.qty > 0 ? entry.qty : 1
  const baseRef = useRef({
    kcal: entry ? (Number(entry.kcal) || 0) / initQty : 0,
    protein: entry ? (Number(entry.protein) || 0) / initQty : 0,
    carbs: entry ? (Number(entry.carbs) || 0) / initQty : 0,
    fat: entry ? (Number(entry.fat) || 0) / initQty : 0,
  })
  const [name, setName] = useState(entry?.name || '')
  const [serving, setServing] = useState(entry?.serving || '')
  const [barcode, setBarcode] = useState(entry?.barcode || '')
  const [qty, setQty] = useState(initQty)
  const [kcal, setKcal] = useState(entry?.kcal ?? 0)
  const [protein, setProtein] = useState(entry?.protein ?? 0)
  const [carbs, setCarbs] = useState(entry?.carbs ?? 0)
  const [fat, setFat] = useState(entry?.fat ?? 0)
  const [saveCustom, setSaveCustom] = useState(false)

  // Live debounced search across Diyetkolik, Open Food Facts, and Built-in staples
  useEffect(() => {
    const q = query.trim()
    if (!q || q.length < 2) {
      setExternalHits([])
      setSearching(false)
      return
    }
    setSearching(true)
    const ctrl = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const hits = await searchExternalFoods(q, 'tr', ctrl.signal)
        setExternalHits(hits)
      } catch {
        // aborted or network failure
      } finally {
        setSearching(false)
      }
    }, 300)

    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [query])

  const openManageFoods = () => {
    useUI.getState().openSheet(closeManage => <NutritionCustomFoodsSheet close={closeManage} />)
  }

  // ---- Edit existing meal entry ----
  if (entry) {
    const autoKcal = kcalFromMacros(protein, carbs, fat)
    const canSaveEdit = Boolean(name.trim()) || cleanKcal(kcal) > 0 || cleanMacro(protein) > 0 || cleanMacro(carbs) > 0 || cleanMacro(fat) > 0

    const applyEditQty = nextQty => {
      const q = Number.isFinite(Number(nextQty)) && Number(nextQty) > 0 ? Math.round(Number(nextQty) * 100) / 100 : 1
      setQty(q)
      const scaled = scaleFoodMacros(baseRef.current, q)
      setKcal(scaled.kcal)
      setProtein(scaled.protein)
      setCarbs(scaled.carbs)
      setFat(scaled.fat)
    }

    const onManualField = (field, val, cleaner) => {
      const clean = cleaner(val ?? 0)
      const divisor = qty > 0 ? qty : 1
      baseRef.current[field] = clean / divisor
      if (field === 'kcal') setKcal(clean)
      else if (field === 'protein') setProtein(clean)
      else if (field === 'carbs') setCarbs(clean)
      else if (field === 'fat') setFat(clean)
    }

    const commitEdit = () => {
      if (!canSaveEdit) return
      useStore.getState().update(s => {
        updateMealEntry(s, dateISO, initialMeal, entry.id, {
          meal,
          name: name.trim(),
          serving: serving.trim(),
          qty: qty > 0 ? qty : 1,
          kcal: cleanKcal(kcal),
          protein: cleanMacro(protein),
          carbs: cleanMacro(carbs),
          fat: cleanMacro(fat),
        })
      })
      useUI.getState().toast(t('Entry updated'))
      close?.()
    }

    const handleDelete = () => {
      deleteMealEntryWithUndo(dateISO, initialMeal, entry)
      close?.()
    }

    return (
      <div className="nutr-sheet">
        <h3>{t('Edit entry')}</h3>

        <label className="sect-t">{t('Meal')}</label>
        <Segmented
          value={meal}
          onChange={setMeal}
          options={MEAL_TYPES.map(m => ({ value: m, label: mealLabelOf(m) }))}
        />

        <label className="sect-t nutr-mt">{t('Servings')}</label>
        <div className="nutr-mult-row">
          <div className="nutr-mult-chips">
            {MULTIPLIER_PRESETS.map(p => (
              <button
                key={p}
                type="button"
                className={'nutr-chip' + (qty === p ? ' on' : '')}
                aria-pressed={qty === p}
                onClick={() => applyEditQty(p)}
              >
                {fmtNum(p)}×
              </button>
            ))}
          </div>
          <Stepper value={qty} step={0.25} min={0.25} max={50} decimal onChange={applyEditQty} ariaLabel={t('Servings')} />
        </div>

        <label className="sect-t nutr-mt">{t('Food name')}</label>
        <TextField
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={t('e.g. Chicken breast, Oats')}
          aria-label={t('Food name')}
        />

        <label className="sect-t nutr-mt">{t('Serving size')}</label>
        <TextField
          value={serving}
          onChange={e => setServing(e.target.value)}
          placeholder={t('e.g. 100 g, 1 scoop')}
          aria-label={t('Serving size')}
        />

        <div className="nutr-form-grid nutr-mt">
          <div className="nutr-num-cell">
            <label className="nutr-num-lbl">{t('Calories')} (kcal)</label>
            <NumberField value={kcal} decimal={false} onChange={v => onManualField('kcal', v, cleanKcal)} aria-label={t('Calories')} />
          </div>
          <div className="nutr-num-cell">
            <label className="nutr-num-lbl">{t('Protein')} (g)</label>
            <NumberField value={protein} decimal onChange={v => onManualField('protein', v, cleanMacro)} aria-label={t('Protein')} />
          </div>
          <div className="nutr-num-cell">
            <label className="nutr-num-lbl">{t('Carbs')} (g)</label>
            <NumberField value={carbs} decimal onChange={v => onManualField('carbs', v, cleanMacro)} aria-label={t('Carbs')} />
          </div>
          <div className="nutr-num-cell">
            <label className="nutr-num-lbl">{t('Fat')} (g)</label>
            <NumberField value={fat} decimal onChange={v => onManualField('fat', v, cleanMacro)} aria-label={t('Fat')} />
          </div>
        </div>

        {autoKcal > 0 && cleanKcal(kcal) !== autoKcal && (
          <button type="button" className="nutr-auto-kcal" onClick={() => onManualField('kcal', autoKcal, cleanKcal)}>
            <Icon name="calculator" />
            <span>{t('From macros ({0} kcal)', fmtNum(autoKcal))}</span>
          </button>
        )}

        <div className="nutr-sheet-actions">
          <Button variant="primary" type="button" onClick={commitEdit} disabled={!canSaveEdit}>
            {t('Save changes')}
          </Button>
          <Button variant="danger" icon="trash" type="button" onClick={handleDelete}>
            {t('Delete entry')}
          </Button>
        </div>
      </div>
    )
  }

  // ---- Barcode scanner mode ----
  if (scanning) {
    const handleBarcodeFound = async ({ value }) => {
      setScanning(false)
      useUI.getState().toast(t('Scanning barcode...'))
      const match = await lookupBarcode(value, savedFoods)
      if (match) {
        setPicked(match)
        setPickQty(1)
        setPickGrams(match.gramsPerServing || 100)
        setScaleMode(match.per100g ? 'grams' : 'servings')
        setMode('library')
      } else {
        // Pre-fill manual custom form with barcode so user can save it once
        setBarcode(value)
        setSaveCustom(true)
        setMode('quick')
        useUI.getState().toast(t('Barcode not found'))
      }
    }

    return (
      <div className="nutr-sheet">
        <CameraScan
          onFound={handleBarcodeFound}
          onCancel={() => setScanning(false)}
        />
      </div>
    )
  }

  // Log item to store
  const logFoodFinal = (food, { qty: finalQty, grams: finalGrams, kcal: finalKcal, protein: finalProt, carbs: finalCarb, fat: finalFat }) => {
    useStore.getState().update(s => {
      let savedFoodId = food.id
      // Auto-cache online search items to local customFoods so next time it is instant offline
      if (food.source && food.source !== 'custom') {
        const saved = upsertCustomFood(s, {
          name: food.name,
          serving: food.serving || (finalGrams ? `${fmtNum(finalGrams)} g` : '100 g'),
          barcode: food.barcode || null,
          kcal: food.kcal ?? finalKcal,
          protein: food.protein ?? finalProt,
          carbs: food.carbs ?? finalCarb,
          fat: food.fat ?? finalFat,
          fav: false,
        })
        savedFoodId = saved?.id || savedFoodId
      }

      addMealEntry(s, dateISO, meal, {
        name: food.name,
        serving: finalGrams ? `${fmtNum(finalGrams)} g` : (food.serving || ''),
        qty: finalQty || 1,
        kcal: finalKcal,
        protein: finalProt,
        carbs: finalCarb,
        fat: finalFat,
        ...(savedFoodId ? { foodId: savedFoodId } : {}),
      })
    })
    cacheFoodItem(food)
    useUI.getState().toast(t('Added to {0}', mealLabelOf(meal)))
    close?.()
  }

  const logTemplate = (food, mult = 1) => {
    const scaled = scaleFoodMacros(food, mult)
    logFoodFinal(food, {
      qty: scaled.qty,
      kcal: scaled.kcal,
      protein: scaled.protein,
      carbs: scaled.carbs,
      fat: scaled.fat,
    })
  }

  // Calculate scaled values for currently picked food
  let scaledPicked = null
  if (picked) {
    if (scaleMode === 'grams' && picked.per100g) {
      const g = Math.max(1, Number(pickGrams) || 100)
      const ratio = g / 100
      scaledPicked = {
        qty: ratio,
        grams: g,
        kcal: cleanKcal(picked.per100g.kcal * ratio),
        protein: cleanMacro(picked.per100g.protein * ratio),
        carbs: cleanMacro(picked.per100g.carbs * ratio),
        fat: cleanMacro(picked.per100g.fat * ratio),
      }
    } else {
      const scaled = scaleFoodMacros(picked, pickQty)
      scaledPicked = {
        qty: scaled.qty,
        grams: picked.gramsPerServing ? Math.round(picked.gramsPerServing * scaled.qty) : null,
        kcal: scaled.kcal,
        protein: scaled.protein,
        carbs: scaled.carbs,
        fat: scaled.fat,
      }
    }
  }

  // Pin external item to customFoods for offline reuse
  const pinToCustomFoods = food => {
    useStore.getState().update(s => {
      upsertCustomFood(s, {
        name: food.name,
        serving: food.serving || '100 g',
        kcal: food.kcal,
        protein: food.protein,
        carbs: food.carbs,
        fat: food.fat,
        fav: true,
      })
    })
    useUI.getState().toast(t('Copied to my foods'))
  }

  // Commit manual quick-add / custom food creation
  const autoKcal = kcalFromMacros(protein, carbs, fat)
  const canQuickAdd = Boolean(name.trim()) || cleanKcal(kcal) > 0 || cleanMacro(protein) > 0 || cleanMacro(carbs) > 0 || cleanMacro(fat) > 0

  const commitQuickAdd = () => {
    if (!canQuickAdd) return
    const trimmedName = name.trim()
    const trimmedServing = serving.trim()
    useStore.getState().update(s => {
      let savedId = null
      if (saveCustom && trimmedName) {
        const saved = upsertCustomFood(s, {
          name: trimmedName,
          serving: trimmedServing,
          barcode: barcode ? barcode.trim() : null,
          kcal: cleanKcal(kcal),
          protein: cleanMacro(protein),
          carbs: cleanMacro(carbs),
          fat: cleanMacro(fat),
        })
        savedId = saved?.id || null
      }
      addMealEntry(s, dateISO, meal, {
        name: trimmedName,
        serving: trimmedServing,
        qty: 1,
        kcal: cleanKcal(kcal),
        protein: cleanMacro(protein),
        carbs: cleanMacro(carbs),
        fat: cleanMacro(fat),
        ...(savedId ? { foodId: savedId } : {}),
      })
    })
    useUI.getState().toast(t('Added to {0}', mealLabelOf(meal)))
    close?.()
  }

  const q = query.trim().toLowerCase()
  const matchSaved = f => !q || f.name.toLowerCase().includes(q) || (f.serving || '').toLowerCase().includes(q)
  const filteredSaved = savedFoods.filter(matchSaved)
  const filteredRecent = recentFoods.filter(matchSaved)

  const renderFoodCandidate = (food, key, sourceTag = null) => {
    const isSelected = picked && ((food.id && picked.id === food.id) || (!food.id && picked.name === food.name && picked.serving === food.serving))
    const macroLine = t('P {0}g · C {1}g · F {2}g', fmtNum(food.protein), fmtNum(food.carbs), fmtNum(food.fat))
    const sub = food.serving
      ? `${food.serving} · ${t('{0} kcal', fmtNum(food.kcal))} · ${macroLine}`
      : `${t('{0} kcal', fmtNum(food.kcal))} · ${macroLine}`
    const badge = sourceBadgeOf(food.source || sourceTag)

    return (
      <div key={key} className={'nutr-food-row' + (isSelected ? ' sel' : '')}>
        <button
          type="button"
          className="nutr-food-main"
          onClick={() => {
            setPicked(food)
            setPickQty(1)
            setPickGrams(food.gramsPerServing || 100)
            setScaleMode(food.per100g ? 'grams' : 'servings')
          }}
        >
          <span className="nutr-item-t">
            {food.fav && <Icon name="starFill" className="nutr-inline-star" />}
            <span>{food.name}</span>
            {badge && <span className="nutr-source-badge">{badge}</span>}
          </span>
          <span className="nutr-item-s">{sub}</span>
        </button>
        <button
          type="button"
          className="iconbtn nutr-quick-plus"
          aria-label={t('Add {0}', food.name)}
          onClick={() => logTemplate(food, 1)}
        >
          <Icon name="plus" />
        </button>
      </div>
    )
  }

  return (
    <div className="nutr-sheet">
      <div className="nutr-sheet-top">
        <h3>{t('Add to {0}', mealLabelOf(meal))}</h3>
        <div className="row gap-2">
          {mode === 'library' && (
            <Button
              size="sm"
              variant="tinted"
              type="button"
              onClick={() => {
                setName(query.trim())
                setMode('quick')
              }}
              aria-label={t('Create custom food')}
            >
              <Icon name="plus" />
              <span>{t('Custom food')}</span>
            </Button>
          )}
          {mode === 'quick' && (
            <Button size="sm" variant="ghost" type="button" onClick={() => setMode('library')}>
              {t('Back')}
            </Button>
          )}
        </div>
      </div>

      {mode === 'library' ? (
        <div className="nutr-mt">
          <div className="nutr-search-row">
            <SearchField
              value={query}
              onChange={e => setQuery(e.target.value)}
              onClear={() => setQuery('')}
              placeholder={t('Search foods & dishes')}
              aria-label={t('Search foods & dishes')}
            />
            <button
              type="button"
              className="iconbtn nutr-scan-btn"
              aria-label={t('Scan barcode')}
              onClick={() => setScanning(true)}
            >
              <Icon name="qr" />
            </button>
          </div>

          {picked && scaledPicked && (
            <div className="nutr-pick-panel" data-pick-panel>
              <div className="nutr-pick-hd">
                <div className="nutr-pick-title">
                  <div className="nutr-item-t">
                    <b>{picked.name}</b>
                    {sourceBadgeOf(picked.source) && (
                      <span className="nutr-source-badge">{sourceBadgeOf(picked.source)}</span>
                    )}
                  </div>
                  {picked.serving && <div className="nutr-item-s">{picked.serving}</div>}
                </div>
                <button type="button" className="iconbtn" onClick={() => setPicked(null)} aria-label={t('Clear')}>
                  <Icon name="xmark" />
                </button>
              </div>

              {picked.per100g && (
                <Segmented
                  value={scaleMode}
                  onChange={setScaleMode}
                  options={[
                    { value: 'servings', label: t('Servings') },
                    { value: 'grams', label: t('Grams (g)') },
                  ]}
                />
              )}

              {scaleMode === 'grams' && picked.per100g ? (
                <div className="nutr-mult-row">
                  <div className="nutr-mult-chips">
                    {GRAM_PRESETS.map(g => (
                      <button
                        key={g}
                        type="button"
                        className={'nutr-chip' + (pickGrams === g ? ' on' : '')}
                        aria-pressed={pickGrams === g}
                        onClick={() => setPickGrams(g)}
                      >
                        {g} g
                      </button>
                    ))}
                  </div>
                  <Stepper
                    value={pickGrams}
                    step={25}
                    min={10}
                    max={2000}
                    decimal={false}
                    unit="g"
                    onChange={v => setPickGrams(v || 100)}
                    ariaLabel={t('Grams')}
                  />
                </div>
              ) : (
                <div className="nutr-mult-row">
                  <div className="nutr-mult-chips">
                    {MULTIPLIER_PRESETS.map(p => (
                      <button
                        key={p}
                        type="button"
                        className={'nutr-chip' + (pickQty === p ? ' on' : '')}
                        aria-pressed={pickQty === p}
                        onClick={() => setPickQty(p)}
                      >
                        {fmtNum(p)}×
                      </button>
                    ))}
                  </div>
                  <Stepper
                    value={pickQty}
                    step={0.25}
                    min={0.25}
                    max={50}
                    decimal
                    onChange={setPickQty}
                    ariaLabel={t('Servings')}
                  />
                </div>
              )}

              <div className="nutr-pick-preview">
                <b>{t('{0} kcal', fmtNum(scaledPicked.kcal))}</b>
                <span>· {t('P {0}g · C {1}g · F {2}g', fmtNum(scaledPicked.protein), fmtNum(scaledPicked.carbs), fmtNum(scaledPicked.fat))}</span>
              </div>

              <div className="row gap-2">
                <Button
                  variant="primary"
                  type="button"
                  onClick={() => logFoodFinal(picked, scaledPicked)}
                  style={{ flex: 1 }}
                >
                  {t('Add to {0}', mealLabelOf(meal))}
                </Button>
                {picked.source && picked.source !== 'custom' && (
                  <Button
                    variant="tinted"
                    type="button"
                    onClick={() => pinToCustomFoods(picked)}
                    aria-label={t('Save copy to my foods')}
                  >
                    <Icon name="star" />
                  </Button>
                )}
              </div>
            </div>
          )}

          {searching && (
            <div className="muted small" style={{ margin: '10px 0' }}>
              {t('Searching foods...')}
            </div>
          )}

          <div className="nutr-library">
            {/* 1. External matches (Diyetkolik / Open Food Facts / Builtin) when typing */}
            {externalHits.length > 0 && (
              <div>
                <div className="sect-t">{t('Search results')}</div>
                <div className="nutr-food-list">
                  {externalHits.map(f => renderFoodCandidate(f, f.id || f.name))}
                </div>
              </div>
            )}

            {/* 2. Saved local foods */}
            {filteredSaved.length > 0 && (
              <div className={externalHits.length > 0 ? 'nutr-mt' : ''}>
                <div className="sect-t">{t('Saved foods')}</div>
                <div className="nutr-food-list">
                  {filteredSaved.map(f => renderFoodCandidate(f, `s:${f.id}`))}
                </div>
              </div>
            )}

            {/* 3. Recently logged */}
            {filteredRecent.length > 0 && (
              <div className={externalHits.length > 0 || filteredSaved.length > 0 ? 'nutr-mt' : ''}>
                <div className="sect-t">{t('Recent')}</div>
                <div className="nutr-food-list">
                  {filteredRecent.map((f, i) => renderFoodCandidate(f, `r:${f.foodId || f.name}:${i}`))}
                </div>
              </div>
            )}

            {/* 4. Empty search state -> Offer manual custom food creation */}
            {query.trim() && externalHits.length === 0 && filteredSaved.length === 0 && filteredRecent.length === 0 && !searching && (
              <div className="nutr-sheet-empty">
                <div className="nutr-sheet-empty-t">{t('No matching foods')}</div>
                <div className="muted small" style={{ margin: '4px 0 12px' }}>
                  {t('Can’t find what you’re looking for?')}
                </div>
                <Button
                  variant="tinted"
                  icon="plus"
                  type="button"
                  onClick={() => {
                    setName(query.trim())
                    setMode('quick')
                  }}
                >
                  {t('Create custom food')}
                </Button>
              </div>
            )}

            {/* 5. Clean footer link to manual creation */}
            {!picked && (
              <div className="nutr-foot-create">
                <Button
                  variant="plain"
                  className="dim small"
                  type="button"
                  onClick={() => {
                    setName(query.trim())
                    setMode('quick')
                  }}
                >
                  <Icon name="plus" />
                  <span>{t('Create custom food')}</span>
                </Button>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ---- Mode 2: Manual Custom Food Creation Form (Secondary) ---- */
        <div className="nutr-mt">
          <label className="sect-t">{t('Food name')}</label>
          <TextField
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={t('e.g. Chicken breast, Oats')}
            aria-label={t('Food name')}
          />

          <label className="sect-t nutr-mt">{t('Serving size')}</label>
          <TextField
            value={serving}
            onChange={e => setServing(e.target.value)}
            placeholder={t('e.g. 100 g, 1 scoop')}
            aria-label={t('Serving size')}
          />

          <div className="nutr-form-grid nutr-mt">
            <div className="nutr-num-cell">
              <label className="nutr-num-lbl">{t('Calories')} (kcal)</label>
              <NumberField value={kcal} decimal={false} onChange={v => setKcal(v ?? 0)} aria-label={t('Calories')} />
            </div>
            <div className="nutr-num-cell">
              <label className="nutr-num-lbl">{t('Protein')} (g)</label>
              <NumberField value={protein} decimal onChange={v => setProtein(v ?? 0)} aria-label={t('Protein')} />
            </div>
            <div className="nutr-num-cell">
              <label className="nutr-num-lbl">{t('Carbs')} (g)</label>
              <NumberField value={carbs} decimal onChange={v => setCarbs(v ?? 0)} aria-label={t('Carbs')} />
            </div>
            <div className="nutr-num-cell">
              <label className="nutr-num-lbl">{t('Fat')} (g)</label>
              <NumberField value={fat} decimal onChange={v => setFat(v ?? 0)} aria-label={t('Fat')} />
            </div>
          </div>

          {autoKcal > 0 && cleanKcal(kcal) !== autoKcal && (
            <button type="button" className="nutr-auto-kcal" onClick={() => setKcal(autoKcal)}>
              <Icon name="calculator" />
              <span>{t('From macros ({0} kcal)', fmtNum(autoKcal))}</span>
            </button>
          )}

          <div className="sect-b nutr-mt">
            <Row icon="star" iconTint="var(--gold)" title={t('Save to my foods')}>
              <Switch
                checked={saveCustom && Boolean(name.trim())}
                onChange={setSaveCustom}
                disabled={!name.trim()}
                aria-label={t('Save to my foods')}
              />
            </Row>
          </div>

          <div className="nutr-sheet-actions">
            <Button variant="primary" type="button" onClick={commitQuickAdd} disabled={!canQuickAdd}>
              {t('Add to {0}', mealLabelOf(meal))}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
