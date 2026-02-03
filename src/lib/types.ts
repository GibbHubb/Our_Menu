export type Category = 'Want to Cook' | 'Mains' | 'Soup' | 'Snacks' | 'Breakfast' | 'Sweets';

export interface Recipe {
    id: string;
    created_at: string;
    title: string;
    category: Category;
    link?: string;
    image_url: string;
}
