// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cacheFoodItem,
  foodApiService,
  getCachedFood,
  lookupBarcode,
  normalizeOffProduct,
  searchExternalFoods,
} from './food-lookup.js'

describe('food-lookup: external & local lookup client', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  describe('normalizeOffProduct', () => {
    it('returns null for null, undefined or nameless products', () => {
      expect(normalizeOffProduct(null)).toBeNull()
      expect(normalizeOffProduct({})).toBeNull()
      expect(normalizeOffProduct({ product_name: '   ' })).toBeNull()
    })

    it('correctly maps Open Food Facts fields and scales serving', () => {
      const raw = {
        code: '8690504018247',
        product_name: 'Tam Yağlı Süt',
        brands: 'Sütaş, Sütaş A.Ş.',
        serving_size: '200 ml',
        serving_quantity: 200,
        nutriments: {
          'energy-kcal_100g': 61,
          proteins_100g: 3.1,
          carbohydrates_100g: 4.7,
          fat_100g: 3.3,
        },
      }
      const norm = normalizeOffProduct(raw)
      expect(norm).toEqual({
        id: 'off:8690504018247',
        source: 'openfoodfacts',
        barcode: '8690504018247',
        name: 'Tam Yağlı Süt',
        brand: 'Sütaş',
        serving: '200 ml',
        gramsPerServing: 200,
        per100g: {
          kcal: 61,
          protein: 3.1,
          carbs: 4.7,
          fat: 3.3,
        },
        kcal: 122,
        protein: 6.2,
        carbs: 9.4,
        fat: 6.6,
      })
    })

    it('falls back to energy_100g in kJ if energy-kcal_100g is missing', () => {
      const raw = {
        code: '12345',
        product_name: 'Test Food',
        nutriments: {
          energy_100g: 836.8, // ~200 kcal
          proteins_100g: 10,
          carbohydrates_100g: 20,
          fat_100g: 5,
        },
      }
      const norm = normalizeOffProduct(raw)
      expect(norm.per100g.kcal).toBe(200)
    })
  })

  describe('LRU cache (cacheFoodItem & getCachedFood)', () => {
    it('stores and retrieves cached food items', () => {
      expect(getCachedFood('bc:8690001')).toBeNull()
      const item = { barcode: '8690001', name: 'Yoğurt', serving: '200 g', kcal: 130 }
      cacheFoodItem(item)
      const fetched = getCachedFood('bc:8690001')
      expect(fetched.name).toBe('Yoğurt')
      expect(fetched._at).toBeDefined()
    })

    it('prunes oldest items when cache exceeds capacity', () => {
      // Fill cache with 105 items
      for (let i = 0; i < 105; i++) {
        cacheFoodItem({ id: `item_${i}`, name: `Food ${i}`, kcal: 100 })
      }
      // Oldest items should be pruned
      const cache = JSON.parse(localStorage.getItem('gym_food_cache_v1') || '{}')
      expect(Object.keys(cache).length).toBeLessThanOrEqual(100)
    })
  })

  describe('lookupBarcode cascade', () => {
    it('returns custom food if barcode is found in user customFoods', async () => {
      const customFoods = [
        { id: 'cf_1', barcode: '869111', name: 'My Custom Bar', kcal: 220, protein: 20 },
      ]
      const res = await lookupBarcode('869111', customFoods)
      expect(res).toEqual({
        id: 'cf_1',
        barcode: '869111',
        name: 'My Custom Bar',
        kcal: 220,
        protein: 20,
        source: 'custom',
      })
    })

    it('returns cached item if in local cache', async () => {
      cacheFoodItem({ barcode: '869222', name: 'Cached Cheese', kcal: 300 })
      const res = await lookupBarcode('869222', [])
      expect(res.name).toBe('Cached Cheese')
    })

    it('calls Open Food Facts API and caches result if found', async () => {
      const fakeProduct = {
        code: '869333',
        product_name: 'Pınar Süt',
        nutriments: { 'energy-kcal_100g': 60, proteins_100g: 3, carbohydrates_100g: 4.5, fat_100g: 3 },
      }
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 1, product: fakeProduct }),
      })

      const res = await lookupBarcode('869333', [])
      expect(fetchSpy).toHaveBeenCalled()
      expect(res.name).toBe('Pınar Süt')
      expect(res.source).toBe('openfoodfacts')
      expect(getCachedFood('bc:869333')).toBeDefined()
    })

    it('returns null gracefully if not found or fetch fails', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'))
      const res = await lookupBarcode('9999999', [])
      expect(res).toBeNull()
    })
  })

  describe('searchExternalFoods', () => {
    it('returns empty array on empty query', async () => {
      const res = await searchExternalFoods('')
      expect(res).toEqual([])
    })

    it('searches built-in foods immediately and queries Diyetkolik, USDA & OFF in parallel', async () => {
      const fakeDkResult = {
        results: [
          {
            id: 'dk:ezogelin',
            name: 'Ezogelin Çorbası',
            source: 'diyetkolik',
            serving: '1 porsiyon (250 g)',
            gramsPerServing: 250,
            per100g: { kcal: 50, protein: 2, carbs: 8, fat: 1 },
            kcal: 125,
            protein: 5,
            carbs: 20,
            fat: 2.5,
          },
        ],
      }
      const fakeUsdaResult = {
        results: [
          {
            id: 'usda:12345',
            name: 'Chicken, breast, boneless, skinless, raw',
            source: 'usda',
            serving: '100 g',
            gramsPerServing: 100,
            per100g: { kcal: 112, protein: 22.5, carbs: 0, fat: 1.9 },
            kcal: 112,
            protein: 22.5,
            carbs: 0,
            fat: 1.9,
          },
        ],
      }
      const fakeOffResult = {
        products: [
          {
            code: '869999',
            product_name: 'Ezogelin Hazır Çorba',
            nutriments: { 'energy-kcal_100g': 40, proteins_100g: 1.5, carbohydrates_100g: 7, fat_100g: 0.8 },
          },
        ],
      }

      vi.spyOn(globalThis, 'fetch').mockImplementation(async url => {
        if (url.includes('/api/nutrition/diyetkolik')) {
          return { ok: true, json: async () => fakeDkResult }
        }
        if (url.includes('/api/nutrition/usda')) {
          return { ok: true, json: async () => fakeUsdaResult }
        }
        if (url.includes('openfoodfacts.org')) {
          return { ok: true, json: async () => fakeOffResult }
        }
        return { ok: false }
      })

      const results = await searchExternalFoods('ezogelin')
      expect(results.length).toBeGreaterThanOrEqual(1)
      expect(results.some(r => r.source === 'diyetkolik')).toBe(true)
      expect(results.some(r => r.source === 'usda')).toBe(true)
      expect(results.some(r => r.source === 'openfoodfacts')).toBe(true)
    })

    it('handles network failure in external sources gracefully and falls back to built-in items', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Offline'))
      const results = await searchExternalFoods('tavuk')
      // Should still find Tavuk from builtin catalogue
      expect(results.length).toBeGreaterThanOrEqual(1)
      expect(results[0].source).toBe('builtin')
    })
  })

  describe('foodApiService', () => {
    it('exports Open Food Facts and USDA service methods', () => {
      expect(typeof foodApiService.searchOpenFoodFacts).toBe('function')
      expect(typeof foodApiService.lookupBarcodeOpenFoodFacts).toBe('function')
      expect(typeof foodApiService.searchUsda).toBe('function')
      expect(typeof foodApiService.searchExternalFoods).toBe('function')
      expect(typeof foodApiService.lookupBarcode).toBe('function')
    })

    it('searchOpenFoodFacts sends request with OpenGymCustom/1.0 User-Agent', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          products: [{
            code: '123',
            product_name: 'Protein Bar',
            nutriments: { 'energy-kcal_100g': 350, proteins_100g: 30, carbohydrates_100g: 30, fat_100g: 10 },
          }],
        }),
      })

      const hits = await foodApiService.searchOpenFoodFacts('protein bar')
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('world.openfoodfacts.org/cgi/search.pl'),
        expect.objectContaining({
          headers: { 'User-Agent': 'OpenGymCustom/1.0' },
        })
      )
      expect(hits).toHaveLength(1)
      expect(hits[0].name).toBe('Protein Bar')
    })
  })
})
