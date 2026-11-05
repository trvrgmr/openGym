import { describe, expect, it } from 'vitest'
import { BUILTIN_FOODS, searchBuiltinFoods } from './foods-catalogue.js'

describe('foods-catalogue: built-in food library', () => {
  it('contains at least 100 curated items with valid nutritional schema', () => {
    expect(BUILTIN_FOODS.length).toBeGreaterThanOrEqual(100)
    for (const food of BUILTIN_FOODS) {
      expect(food.id).toMatch(/^cat:[a-z0-9-]+$/)
      expect(food.name.trim().length).toBeGreaterThan(0)
      expect(typeof food.serving).toBe('string')
      expect(food.gramsPerServing).toBeGreaterThan(0)
      expect(food.per100g).toBeDefined()
      expect(typeof food.per100g.kcal).toBe('number')
      expect(typeof food.per100g.protein).toBe('number')
      expect(typeof food.per100g.carbs).toBe('number')
      expect(typeof food.per100g.fat).toBe('number')
      expect(Array.isArray(food.tags)).toBe(true)
    }
  })

  it('includes staple raw foods for gym & macro tracking', () => {
    const rawChicken = BUILTIN_FOODS.find(f => f.id === 'cat:tavuk-gogsu-cig')
    expect(rawChicken).toBeDefined()
    expect(rawChicken.name).toBe('Tavuk Göğsü (Çiğ)')
    expect(rawChicken.per100g.kcal).toBe(110)
    expect(rawChicken.per100g.protein).toBeGreaterThanOrEqual(23)

    const rawRice = BUILTIN_FOODS.find(f => f.id === 'cat:pirinc-cig')
    expect(rawRice).toBeDefined()
    expect(rawRice.name).toContain('Pirinç (Çiğ')
    expect(rawRice.per100g.carbs).toBeGreaterThanOrEqual(75)

    const rawBeef = BUILTIN_FOODS.find(f => f.id === 'cat:dana-kiyma-yagsiz-cig')
    expect(rawBeef).toBeDefined()
    expect(rawBeef.name).toContain('Dana Kıyma (%5 Yağlı, Çiğ)')

    const rawSalmon = BUILTIN_FOODS.find(f => f.id === 'cat:somon-cig')
    expect(rawSalmon).toBeDefined()
    expect(rawSalmon.name).toBe('Somon Fileto (Çiğ)')
  })

  it('searchBuiltinFoods returns top items on empty query', () => {
    const all = searchBuiltinFoods('', 'tr', 10)
    expect(all).toHaveLength(10)
    expect(all[0].id).toBe(BUILTIN_FOODS[0].id)
  })

  it('matches raw items and boosts when searching with "cig" or "çiğ"', () => {
    // "tavuk cig" should return raw chicken
    const chickenHits = searchBuiltinFoods('tavuk cig')
    expect(chickenHits.some(f => f.name.includes('Çiğ'))).toBe(true)

    // "pirinc cig" should return raw rice
    const riceHits = searchBuiltinFoods('pirinc cig')
    expect(riceHits.some(f => f.name.includes('Pirinç') && f.name.includes('Çiğ'))).toBe(true)

    // "kiyma cig" should return raw minced meat
    const beefHits = searchBuiltinFoods('kiyma cig')
    expect(beefHits.some(f => f.name.includes('Kıyma') && f.name.includes('Çiğ'))).toBe(true)
  })

  it('matches items case-insensitively and normalizes Turkish diacritics', () => {
    // "cig kofte" should match "Çiğ Köfte"
    const hits1 = searchBuiltinFoods('cig kofte')
    expect(hits1.some(f => f.name.includes('Çiğ Köfte'))).toBe(true)

    // "tavuk" matches both raw and cooked chicken
    const hits2 = searchBuiltinFoods('tavuk')
    expect(hits2.some(f => f.name.includes('Tavuk'))).toBe(true)

    // "YUMURTA" matches "Yumurta"
    const hits3 = searchBuiltinFoods('YUMURTA')
    expect(hits3.some(f => f.name.includes('Yumurta'))).toBe(true)
  })

  it('matches English names from nameEn field', () => {
    const hits = searchBuiltinFoods('chicken')
    expect(hits.some(f => (f.nameEn || '').toLowerCase().includes('chicken'))).toBe(true)
  })

  it('matches tags such as supplement or kahvalti', () => {
    const whey = searchBuiltinFoods('whey')
    expect(whey.some(f => f.tags.includes('whey'))).toBe(true)

    const kahvalti = searchBuiltinFoods('kahvalti')
    expect(kahvalti.length).toBeGreaterThan(0)
  })

  it('respects the limit argument', () => {
    const hits = searchBuiltinFoods('a', 'tr', 3)
    expect(hits.length).toBeLessThanOrEqual(3)
  })
})
