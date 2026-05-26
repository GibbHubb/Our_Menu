export type Category = 'Want to Cook' | 'Mains' | 'Soup' | 'Snacks' | 'Breakfast' | 'Sweets' | 'Midweek' | 'Cheap and Healthy' | 'Salad' | 'Pasta' | 'Winter Warmer';

export interface Recipe {
    id: string;
    created_at: string;
    title: string;
    category: Category[]; // Now an array
    link?: string;
    image_url: string;
    ingredients?: string;
    instructions?: string;
    notes?: string;
    shopping_list?: string;
    rating?: number;                                // OM5: 1-5 star rating
    shopping_list_checked?: Record<string, boolean>; // OM6: per-item checked state
    // OM11 — per-serving nutrition (Claude estimate, cached on row)
    kcal_per_serving?: number;
    protein_g?: number;
    carbs_g?: number;
    fat_g?: number;
    ingredients_hash?: string;
    nutrition_generated_at?: string;
    // OM13 — season tags ('spring' | 'summer' | 'autumn' | 'winter'); empty = year-round
    seasons?: string[];
}

// OM9 — Collection re-export for convenience
export type { Collection } from './collections';
