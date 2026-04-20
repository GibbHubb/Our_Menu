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
}
