import { useState } from 'react'
import { fmtNum } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import {
  DEFAULT_NUTRITION_GOALS,
  macroBreakdown,
  nutritionGoalsOf,
  setNutritionGoals,
} from '../lib/nutrition.js'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import Icon from './Icon.jsx'
import { StackBar } from './StatBars.jsx'
import { Button, Stepper } from './ui.jsx'

export default function NutritionGoalsSheet({ close }) {
  const S = useStore(s => s.S)
  const initial = nutritionGoalsOf(S)

  const [kcal, setKcal] = useState(initial.kcal)
  const [protein, setProtein] = useState(initial.protein)
  const [carbs, setCarbs] = useState(initial.carbs)
  const [fat, setFat] = useState(initial.fat)

  const bd = macroBreakdown(protein, carbs, fat)
  const cleanTargetKcal = Math.max(1, Math.round(Number(kcal) || DEFAULT_NUTRITION_GOALS.kcal))
  const needsMatch = bd.kcal > 0 && cleanTargetKcal !== bd.kcal

  const resetDefaults = () => {
    setKcal(DEFAULT_NUTRITION_GOALS.kcal)
    setProtein(DEFAULT_NUTRITION_GOALS.protein)
    setCarbs(DEFAULT_NUTRITION_GOALS.carbs)
    setFat(DEFAULT_NUTRITION_GOALS.fat)
  }

  const commit = () => {
    useStore.getState().update(s => {
      setNutritionGoals(s, {
        kcal: Math.max(1, Math.round(Number(kcal) || DEFAULT_NUTRITION_GOALS.kcal)),
        protein: Math.max(1, Math.round(Number(protein) || DEFAULT_NUTRITION_GOALS.protein)),
        carbs: Math.max(1, Math.round(Number(carbs) || DEFAULT_NUTRITION_GOALS.carbs)),
        fat: Math.max(1, Math.round(Number(fat) || DEFAULT_NUTRITION_GOALS.fat)),
      })
    })
    useUI.getState().toast(t('Daily goal saved'))
    close?.()
  }

  const stackParts = [
    {
      key: 'protein',
      label: t('Protein'),
      n: bd.proteinPct,
      share: bd.shares.protein,
      color: 'var(--green-ink)',
    },
    {
      key: 'carbs',
      label: t('Carbs'),
      n: bd.carbsPct,
      share: bd.shares.carbs,
      color: 'var(--blue)',
    },
    {
      key: 'fat',
      label: t('Fat'),
      n: bd.fatPct,
      share: bd.shares.fat,
      color: 'var(--orange)',
    },
  ]

  return (
    <div className="nutr-sheet" data-goals-sheet>
      <div className="nutr-sheet-top">
        <h3>{t('Daily goals')}</h3>
        <Button size="sm" variant="ghost" className="dim" type="button" onClick={resetDefaults}>
          {t('Reset to defaults')}
        </Button>
      </div>

      <div className="sect-b nutr-goals-list">
        <div className="nutr-goal-row" data-goal-field="kcal">
          <div className="nutr-goal-m">
            <span className="nutr-goal-t">{t('Calories')}</span>
            <span className="nutr-goal-s">{t('Calories from macros: {0} kcal', fmtNum(bd.kcal))}</span>
          </div>
          <Stepper
            value={kcal}
            step={50}
            min={200}
            max={20000}
            decimal={false}
            unit="kcal"
            onChange={v => setKcal(v ?? DEFAULT_NUTRITION_GOALS.kcal)}
          />
        </div>

        <div className="nutr-goal-row" data-goal-field="protein">
          <div className="nutr-goal-m">
            <span className="nutr-goal-t">
              <span className="nutr-mdot protein" aria-hidden="true" />
              <span>{t('Protein')}</span>
            </span>
            <span className="nutr-goal-s">
              {t('{0} kcal', fmtNum(bd.proteinKcal))} · {t('{0}%', fmtNum(bd.proteinPct))}
            </span>
          </div>
          <Stepper
            value={protein}
            step={5}
            min={5}
            max={2000}
            decimal={false}
            unit="g"
            onChange={v => setProtein(v ?? DEFAULT_NUTRITION_GOALS.protein)}
          />
        </div>

        <div className="nutr-goal-row" data-goal-field="carbs">
          <div className="nutr-goal-m">
            <span className="nutr-goal-t">
              <span className="nutr-mdot carbs" aria-hidden="true" />
              <span>{t('Carbs')}</span>
            </span>
            <span className="nutr-goal-s">
              {t('{0} kcal', fmtNum(bd.carbsKcal))} · {t('{0}%', fmtNum(bd.carbsPct))}
            </span>
          </div>
          <Stepper
            value={carbs}
            step={5}
            min={5}
            max={3000}
            decimal={false}
            unit="g"
            onChange={v => setCarbs(v ?? DEFAULT_NUTRITION_GOALS.carbs)}
          />
        </div>

        <div className="nutr-goal-row" data-goal-field="fat">
          <div className="nutr-goal-m">
            <span className="nutr-goal-t">
              <span className="nutr-mdot fat" aria-hidden="true" />
              <span>{t('Fat')}</span>
            </span>
            <span className="nutr-goal-s">
              {t('{0} kcal', fmtNum(bd.fatKcal))} · {t('{0}%', fmtNum(bd.fatPct))}
            </span>
          </div>
          <Stepper
            value={fat}
            step={5}
            min={5}
            max={1000}
            decimal={false}
            unit="g"
            onChange={v => setFat(v ?? DEFAULT_NUTRITION_GOALS.fat)}
          />
        </div>
      </div>

      {needsMatch && (
        <button type="button" className="nutr-auto-kcal" onClick={() => setKcal(bd.kcal)}>
          <Icon name="calculator" />
          <span>{t('Match calories to macros ({0} kcal)', fmtNum(bd.kcal))}</span>
        </button>
      )}

      <div className="nutr-split-card nutr-mt">
        <div className="nutr-split-hd">
          <span className="sect-t" style={{ margin: 0 }}>{t('Macro split')}</span>
          <span className="nutr-split-tot">{t('{0} kcal', fmtNum(bd.kcal))}</span>
        </div>
        <StackBar
          parts={stackParts}
          ariaLabel={t('Macro split')}
          fmtValue={p => t('{0}%', fmtNum(p.n))}
        />
      </div>

      <div className="nutr-sheet-actions">
        <Button variant="primary" type="button" onClick={commit}>
          {t('Save')}
        </Button>
      </div>
    </div>
  )
}
