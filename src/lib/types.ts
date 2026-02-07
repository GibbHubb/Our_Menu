export type Category = 'Want to Cook' | 'Mains' | 'Soup' | 'Snacks' | 'Breakfast' | 'Sweets' | 'Midweek' | 'Cheap and Healthy';

export interface Recipe {
    id: string;
    created_at: string;
    title: string;
    category: Category;
    link?: string;
    image_url: string;
    ingredients?: string;
    instructions?: string;
    notes?: string;
    shopping_list?: string;
}
