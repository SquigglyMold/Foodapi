import axios, { AxiosInstance } from 'axios';
import { BarcodeProduct } from '../types';
import { CacheService } from './cacheService';

interface OFFNutriments {
  'energy-kcal_100g'?: number;
  'proteins_100g'?: number;
  'carbohydrates_100g'?: number;
  'fat_100g'?: number;
  'fiber_100g'?: number;
  'sugars_100g'?: number;
  'sodium_100g'?: number;
  'serving_size'?: string;
}

interface OFFProduct {
  product_name?: string;
  brands?: string;
  quantity?: string;
  image_url?: string;
  nutriscore_grade?: string;
  ingredients_text?: string;
  allergens_tags?: string[];
  categories_tags?: string[];
  nutriments?: OFFNutriments;
}

interface OFFResponse {
  status: number; // 1 = found, 0 = not found
  product?: OFFProduct;
}

export class OpenFoodFactsService {
  private readonly client: AxiosInstance;
  private readonly cache: CacheService;

  constructor() {
    this.cache = CacheService.getInstance();
    this.client = axios.create({
      baseURL: 'https://world.openfoodfacts.org/api/v0',
      timeout: 6000,
      headers: {
        'User-Agent': 'FoodAPI/2.0 (rapidapi)',
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
      decompress: true,
    });
  }

  async lookupBarcode(barcode: string, requestId?: string): Promise<BarcodeProduct> {
    const cacheKey = CacheService.generateKey('barcode', { barcode });
    const cached = this.cache.get<BarcodeProduct>(cacheKey);
    if (cached) return cached;

    try {
      const response = await this.client.get<OFFResponse>(`/product/${barcode}.json`);
      const data = response.data;

      if (!data || data.status !== 1 || !data.product) {
        const notFound: BarcodeProduct = { barcode, source: 'not_found' };
        this.cache.set(cacheKey, notFound, 5 * 60 * 1000);
        return notFound;
      }

      const p = data.product;
      const n = p.nutriments || {};

      const result: BarcodeProduct = {
        barcode,
        source: 'openfoodfacts',
        name: p.product_name?.trim(),
        brand: p.brands?.split(',')[0]?.trim(),
        quantity: p.quantity?.trim(),
        imageUrl: p.image_url,
        nutriscore: p.nutriscore_grade?.toUpperCase(),
        ingredients: p.ingredients_text?.substring(0, 1000),
        allergens: this.parseAllergenTags(p.allergens_tags),
        categories: this.parseCategoryTags(p.categories_tags),
        nutrition: {
          calories:      this.round(n['energy-kcal_100g']),
          protein:       this.round(n['proteins_100g']),
          carbohydrates: this.round(n['carbohydrates_100g']),
          fat:           this.round(n['fat_100g']),
          fiber:         this.round(n['fiber_100g']),
          sugars:        this.round(n['sugars_100g']),
          // OFF stores sodium in g/100g, convert to mg
          sodium:        n['sodium_100g'] != null ? this.round(n['sodium_100g']! * 1000) : undefined,
          servingSize:   n['serving_size'],
        },
      };

      // Cache for 1 hour — product data changes rarely
      this.cache.set(cacheKey, result, 60 * 60 * 1000);
      return result;
    } catch (err: any) {
      // Don't throw — return not_found gracefully so callers can decide
      const notFound: BarcodeProduct = { barcode, source: 'not_found' };
      return notFound;
    }
  }

  private parseAllergenTags(tags?: string[]): string[] {
    if (!tags || tags.length === 0) return [];
    return tags
      .filter(t => t.startsWith('en:'))
      .map(t => t.replace('en:', '').replace(/-/g, ' '));
  }

  private parseCategoryTags(tags?: string[]): string[] {
    if (!tags || tags.length === 0) return [];
    return tags
      .filter(t => t.startsWith('en:'))
      .map(t => t.replace('en:', '').replace(/-/g, ' '))
      .slice(0, 8);
  }

  private round(v: number | undefined): number | undefined {
    if (v == null || isNaN(v)) return undefined;
    return Math.round(v * 100) / 100;
  }
}
