import { useState } from 'react'
import { fmtNum } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import {
  cleanKcal,
  cleanMacro,
  kcalFromMacros,
  removeCustomFood,
  restoreCustomFood,
  sortedCustomFoods,
  upsertCustomFood,
} from '../lib/nutrition.js'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import Icon from './Icon.jsx'
import SwipeRow from './SwipeRow.jsx'
import { Button, NumberField, Row, SearchField, Switch, TextField } from './ui.jsx'

export function deleteCustomFoodWithUndo(food) {
  if (!food?.id) return
  const curList = useStore.getState().S.customFoods || []
  const idx = curList.findIndex(x => x && String(x.id) === String(food.id))
  const snapshot = idx >= 0 ? JSON.parse(JSON.stringify(curList[idx])) : JSON.parse(JSON.stringify(food))
  useStore.getState().update(s => { removeCustomFood(s, food.id) })
  useUI.getState().toast(t('Food deleted'), {
    action: t('Undo'),
    onAction: () => {
      useStore.getState().update(s => { restoreCustomFood(s, snapshot, idx >= 0 ? idx : 0) })
    },
  })
}

export default function NutritionCustomFoodsSheet() {
  const S = useStore(s => s.S)
  const foods = sortedCustomFoods(S)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(null)

  const [name, setName] = useState('')
  const [serving, setServing] = useState('')
  const [kcal, setKcal] = useState(0)
  const [protein, setProtein] = useState(0)
  const [carbs, setCarbs] = useState(0)
  const [fat, setFat] = useState(0)
  const [fav, setFav] = useState(false)

  const startEdit = item => {
    setName(item?.name || '')
    setServing(item?.serving || '')
    setKcal(item?.kcal ?? 0)
    setProtein(item?.protein ?? 0)
    setCarbs(item?.carbs ?? 0)
    setFat(item?.fat ?? 0)
    setFav(Boolean(item?.fav))
    setEditing(item || {})
  }

  const toggleFav = food => {
    useStore.getState().update(s => {
      upsertCustomFood(s, { id: food.id, fav: !food.fav })
    })
  }

  if (editing !== null) {
    const autoKcal = kcalFromMacros(protein, carbs, fat)
    const canSave = name.trim().length > 0

    const commit = () => {
      if (!canSave) return
      useStore.getState().update(s => {
        upsertCustomFood(s, {
          ...(editing.id ? { id: editing.id } : {}),
          name: name.trim(),
          serving: serving.trim(),
          kcal: cleanKcal(kcal),
          protein: cleanMacro(protein),
          carbs: cleanMacro(carbs),
          fat: cleanMacro(fat),
          fav,
        })
      })
      useUI.getState().toast(t('Food saved'))
      setEditing(null)
    }

    return (
      <div className="nutr-sheet">
        <div className="nutr-sheet-hd">
          <button type="button" className="iconbtn" onClick={() => setEditing(null)} aria-label={t('Back')}>
            <Icon name="chevronLeft" />
          </button>
          <h3>{editing.id ? t('Edit food') : t('New food')}</h3>
        </div>

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
          <Row icon={fav ? 'starFill' : 'star'} iconTint="var(--gold)" title={t('Favourite')}>
            <Switch checked={fav} onChange={setFav} aria-label={t('Favourite')} />
          </Row>
        </div>

        <div className="nutr-sheet-actions">
          <Button variant="primary" type="button" onClick={commit} disabled={!canSave}>
            {editing.id ? t('Save changes') : t('Save')}
          </Button>
          {editing.id && (
            <Button
              variant="danger"
              icon="trash"
              type="button"
              onClick={() => {
                deleteCustomFoodWithUndo(editing)
                setEditing(null)
              }}
            >
              {t('Delete food')}
            </Button>
          )}
        </div>
      </div>
    )
  }

  const q = query.trim().toLowerCase()
  const visible = q
    ? foods.filter(f => f.name.toLowerCase().includes(q) || f.serving.toLowerCase().includes(q))
    : foods

  return (
    <div className="nutr-sheet">
      <div className="nutr-sheet-top">
        <h3>{t('My foods')}</h3>
        <Button size="sm" variant="tinted" icon="plus" type="button" onClick={() => startEdit(null)}>
          {t('New food')}
        </Button>
      </div>

      {foods.length > 0 && (
        <div className="nutr-search">
          <SearchField
            value={query}
            onChange={e => setQuery(e.target.value)}
            onClear={() => setQuery('')}
            placeholder={t('Search foods')}
            aria-label={t('Search foods')}
          />
        </div>
      )}

      {foods.length === 0 ? (
        <div className="nutr-sheet-empty">
          <div className="nutr-sheet-empty-t">{t('No saved foods yet')}</div>
          <div className="muted small">{t('Save frequent foods for one-tap logging.')}</div>
        </div>
      ) : visible.length === 0 ? (
        <div className="nutr-sheet-empty">
          <div className="muted small">{t('No matching foods')}</div>
        </div>
      ) : (
        <div className="nutr-food-list">
          {visible.map(food => {
            const macroLine = t('P {0}g · C {1}g · F {2}g', fmtNum(food.protein), fmtNum(food.carbs), fmtNum(food.fat))
            const sub = food.serving
              ? `${food.serving} · ${t('{0} kcal', fmtNum(food.kcal))} · ${macroLine}`
              : `${t('{0} kcal', fmtNum(food.kcal))} · ${macroLine}`
            return (
              <SwipeRow
                key={food.id}
                onDelete={() => deleteCustomFoodWithUndo(food)}
                deleteLabel={t('Delete')}
              >
                <div className="nutr-food-row" data-food-id={food.id}>
                  <button type="button" className="nutr-food-main" onClick={() => startEdit(food)}>
                    <span className="nutr-item-t">{food.name}</span>
                    <span className="nutr-item-s">{sub}</span>
                  </button>
                  <button
                    type="button"
                    className={'iconbtn nutr-fav' + (food.fav ? ' on' : '')}
                    aria-label={t('Favourite')}
                    aria-pressed={food.fav}
                    onClick={() => toggleFav(food)}
                  >
                    <Icon name={food.fav ? 'starFill' : 'star'} />
                  </button>
                </div>
              </SwipeRow>
            )
          })}
        </div>
      )}
    </div>
  )
}
