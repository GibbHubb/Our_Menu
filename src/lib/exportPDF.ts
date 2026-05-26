import type { Recipe } from './types';

interface PlanDay {
    day: number;
    meal: string;
    recipe_title?: string | null;
    recipe_id?: string | null;
    reason?: string;
}

interface MealPlan {
    days: PlanDay[];
}

export async function buildMealPlanPDF(plan: MealPlan, recipes: Recipe[]) {
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');

    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

    const PAGE_W = 595;
    const PAGE_H = 842;
    const MARGIN = 50;
    const LINE_H = 16;
    const MAX_Y = PAGE_H - MARGIN;

    let page = doc.addPage([PAGE_W, PAGE_H]);
    let y = MAX_Y;

    const drawText = (text: string, size: number, f = font, color = rgb(0.15, 0.15, 0.15)) => {
        if (y < MARGIN + 40) {
            page = doc.addPage([PAGE_W, PAGE_H]);
            y = MAX_Y;
        }
        page.drawText(text, { x: MARGIN, y, size, font: f, color });
        y -= size + 4;
    };

    const drawLine = () => {
        page.drawLine({
            start: { x: MARGIN, y: y + 4 },
            end: { x: PAGE_W - MARGIN, y: y + 4 },
            thickness: 0.5,
            color: rgb(0.8, 0.8, 0.8),
        });
        y -= 8;
    };

    // Title
    const today = new Date().toISOString().slice(0, 10);
    drawText('Meal Plan', 22, fontBold);
    y -= 4;
    drawText(today, 11, font, rgb(0.5, 0.5, 0.5));
    y -= 12;
    drawLine();
    y -= 8;

    // Days
    for (const day of plan.days) {
        drawText(`Day ${day.day}`, 14, fontBold);
        drawText(day.meal, 12);
        if (day.recipe_title) {
            drawText(`Recipe: ${day.recipe_title}`, 10, font, rgb(0.4, 0.4, 0.4));
        }
        if (day.reason) {
            drawText(day.reason, 9, font, rgb(0.55, 0.55, 0.55));
        }
        y -= 8;
    }

    // Shopping list
    y -= 8;
    drawLine();
    y -= 4;
    drawText('Shopping List', 16, fontBold);
    y -= 4;

    const ingredientSet = new Set<string>();
    const recipeMap = new Map(recipes.map(r => [r.id, r]));

    for (const day of plan.days) {
        if (!day.recipe_id) continue;
        const recipe = recipeMap.get(day.recipe_id);
        if (!recipe?.ingredients) continue;
        const lines = recipe.ingredients.split('\n').map(l => l.trim()).filter(Boolean);
        for (const line of lines) {
            ingredientSet.add(line.replace(/^[-•*]\s*/, ''));
        }
    }

    const sorted = [...ingredientSet].sort((a, b) => a.localeCompare(b));
    if (sorted.length === 0) {
        drawText('No ingredients to list (no matched recipes).', 10, font, rgb(0.5, 0.5, 0.5));
    } else {
        for (const item of sorted) {
            drawText(`  - ${item}`, 10);
        }
    }

    // Download
    const pdfBytes = await doc.save();
    const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meal-plan-${today}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
}


// OM26 — Cookbook PDF for a collection. Reuses the same pdf-lib
// primitives (text-only v1; photos can land alongside OM25 in a v2).
//
// Layout: cover page (title + recipe count + date), then one page per
// recipe with title + category + (if present) ingredients + instructions.
// Long blocks soft-wrap by width and page-break when y runs low.
export async function buildCookbookPDF(
    collectionName: string,
    recipes: Recipe[],
): Promise<void> {
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');

    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

    const PAGE_W = 595;
    const PAGE_H = 842;
    const MARGIN = 50;
    const MAX_Y = PAGE_H - MARGIN;
    const MAX_TEXT_W = PAGE_W - 2 * MARGIN;

    let page = doc.addPage([PAGE_W, PAGE_H]);
    let y = MAX_Y;

    // Soft-wrap a single logical line at MAX_TEXT_W by character width.
    const wrap = (text: string, size: number, f = font): string[] => {
        const words = text.split(/\s+/);
        const out: string[] = [];
        let line = '';
        for (const w of words) {
            const candidate = line ? `${line} ${w}` : w;
            const width = f.widthOfTextAtSize(candidate, size);
            if (width > MAX_TEXT_W && line) {
                out.push(line);
                line = w;
            } else {
                line = candidate;
            }
        }
        if (line) out.push(line);
        return out;
    };

    const drawText = (text: string, size: number, f = font, color = rgb(0.15, 0.15, 0.15)) => {
        for (const segment of wrap(text, size, f)) {
            if (y < MARGIN + 40) {
                page = doc.addPage([PAGE_W, PAGE_H]);
                y = MAX_Y;
            }
            page.drawText(segment, { x: MARGIN, y, size, font: f, color });
            y -= size + 4;
        }
    };

    const drawLine = () => {
        page.drawLine({
            start: { x: MARGIN, y: y + 4 },
            end: { x: PAGE_W - MARGIN, y: y + 4 },
            thickness: 0.5,
            color: rgb(0.8, 0.8, 0.8),
        });
        y -= 8;
    };

    // Cover page.
    drawText(collectionName || 'Cookbook', 28, fontBold);
    y -= 8;
    drawText(`${recipes.length} recipe${recipes.length === 1 ? '' : 's'}`, 12, font, rgb(0.4, 0.4, 0.4));
    drawText(new Date().toISOString().slice(0, 10), 10, font, rgb(0.55, 0.55, 0.55));

    // One section per recipe.
    for (const recipe of recipes) {
        // Page break between recipes.
        page = doc.addPage([PAGE_W, PAGE_H]);
        y = MAX_Y;
        drawText(recipe.title, 18, fontBold);
        if (recipe.category && recipe.category.length > 0) {
            drawText(recipe.category.join(' · '), 10, font, rgb(0.5, 0.5, 0.5));
        }
        y -= 6;
        drawLine();
        y -= 4;

        if (recipe.ingredients) {
            drawText('Ingredients', 13, fontBold);
            for (const raw of recipe.ingredients.split('\n')) {
                const line = raw.trim();
                if (line) drawText(`  • ${line.replace(/^[-•*]\s*/, '')}`, 10);
            }
            y -= 6;
        }

        if (recipe.instructions) {
            drawText('Instructions', 13, fontBold);
            for (const raw of recipe.instructions.split('\n')) {
                const line = raw.trim();
                if (line) drawText(line, 10);
            }
        }
    }

    // Download.
    const pdfBytes = await doc.save();
    const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const slug = (collectionName || 'cookbook')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'cookbook';
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug}-${new Date().toISOString().slice(0, 10)}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
}
