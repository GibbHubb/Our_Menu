import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function POST(req: NextRequest) {
    const { plan, preferences } = await req.json();
    const { data, error } = await supabase
        .from('meal_plans')
        .insert({ plan_json: plan, preferences })
        .select()
        .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ saved: data });
}
