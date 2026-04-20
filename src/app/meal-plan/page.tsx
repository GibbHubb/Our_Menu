'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { Recipe } from '@/lib/types';

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

export default function MealPlanPage() {
    const [pantry, setPantry] = useState('');
    const [dietary, setDietary] = useState('none');
    const [days, setDays] = useState(7);
    const [plan, setPlan] = useState<MealPlan | null>(null);
    const [planRecipes, setPlanRecipes] = useState<Recipe[]>([]);
    const [loading, setLoading] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState('');

    // Fetch recipes for matched plan days (for PDF shopping list)
    useEffect(() => {
        if (!plan) { setPlanRecipes([]); return; }
        const ids = plan.days.map(d => d.recipe_id).filter(Boolean) as string[];
        if (ids.length === 0) { setPlanRecipes([]); return; }
        supabase.from('recipes').select('*').in('id', ids).then(({ data }) => {
            setPlanRecipes((data as Recipe[]) ?? []);
        });
    }, [plan]);

    async function generate() {
        setLoading(true);
        setPlan(null);
        setSaved(false);
        setError('');
        try {
            const res = await fetch('/api/meal-plan/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pantry, dietary, days }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
            setPlan(data.plan);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }

    async function savePlan() {
        if (!plan) return;
        await fetch('/api/meal-plan/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan, preferences: { pantry, dietary, days } }),
        });
        setSaved(true);
    }

    async function handleDownloadPDF() {
        if (!plan) return;
        const { buildMealPlanPDF } = await import('@/lib/exportPDF');
        await buildMealPlanPDF(plan, planRecipes);
    }

    return (
        <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto' }}>
            <h1 style={{ fontFamily: 'var(--font-playfair, serif)', marginBottom: '24px' }}>
                Meal Plan Generator
            </h1>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
                <textarea
                    placeholder="Pantry items (e.g. chicken, pasta, tomatoes)"
                    value={pantry}
                    onChange={e => setPantry(e.target.value)}
                    rows={3}
                    style={{ padding: '8px', borderRadius: '6px', border: '1px solid #ddd', fontFamily: 'inherit', fontSize: '14px' }}
                />
                <select
                    value={dietary}
                    onChange={e => setDietary(e.target.value)}
                    style={{ padding: '8px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '14px' }}
                >
                    <option value="none">No restriction</option>
                    <option value="vegetarian">Vegetarian</option>
                    <option value="vegan">Vegan</option>
                    <option value="gluten-free">Gluten-free</option>
                </select>
                <select
                    value={days}
                    onChange={e => setDays(Number(e.target.value))}
                    style={{ padding: '8px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '14px' }}
                >
                    <option value={3}>3 days</option>
                    <option value={5}>5 days</option>
                    <option value={7}>7 days</option>
                </select>
                <button
                    onClick={generate}
                    disabled={loading}
                    style={{
                        padding: '10px 24px',
                        background: '#1a1a2e',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: loading ? 'not-allowed' : 'pointer',
                        fontSize: '14px',
                        fontWeight: 600,
                        opacity: loading ? 0.7 : 1,
                    }}
                >
                    {loading ? 'Generating...' : 'Generate Meal Plan'}
                </button>
            </div>

            {error && (
                <p style={{ color: '#b91c1c', fontSize: '13px', marginBottom: '16px' }}>{error}</p>
            )}

            {plan && (
                <>
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                            gap: '12px',
                            marginBottom: '16px',
                        }}
                    >
                        {plan.days?.map((d: PlanDay) => (
                            <div
                                key={d.day}
                                style={{
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '8px',
                                    padding: '12px',
                                    background: '#fff',
                                }}
                            >
                                <div
                                    style={{
                                        fontSize: '11px',
                                        fontWeight: 700,
                                        color: '#8896ab',
                                        textTransform: 'uppercase',
                                        marginBottom: '4px',
                                        letterSpacing: '0.05em',
                                    }}
                                >
                                    Day {d.day}
                                </div>
                                <div style={{ fontWeight: 600, marginBottom: '4px', fontSize: '14px' }}>
                                    {d.meal}
                                </div>
                                {d.recipe_id && (
                                    <a
                                        href={`/recipe/${d.recipe_id}`}
                                        style={{ fontSize: '12px', color: '#4f46e5', textDecoration: 'none' }}
                                    >
                                        View recipe &rarr;
                                    </a>
                                )}
                                {d.reason && (
                                    <div style={{ fontSize: '11px', color: '#6c7a94', marginTop: '4px' }}>
                                        {d.reason}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            onClick={savePlan}
                            disabled={saved}
                            style={{
                                padding: '8px 20px',
                                background: saved ? '#22c55e' : '#374151',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: saved ? 'default' : 'pointer',
                                fontSize: '14px',
                                fontWeight: 600,
                            }}
                        >
                            {saved ? '\u2713 Saved' : 'Save Plan'}
                        </button>
                        <button
                            onClick={handleDownloadPDF}
                            style={{
                                padding: '8px 20px',
                                background: '#4f46e5',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '14px',
                                fontWeight: 600,
                            }}
                        >
                            Download PDF
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
