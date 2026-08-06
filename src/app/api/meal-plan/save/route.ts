import { NextRequest, NextResponse } from 'next/server';
import { createRequestClient, getRequestUser } from '@/lib/supabaseServer';

export async function POST(req: NextRequest) {
    const { plan, preferences } = await req.json();

    // OM14c — a saved meal plan belongs to someone. Previously this inserted
    // through the shared anon client, so every row landed with a NULL user_id
    // and no user could ever be shown "my plans".
    const user = await getRequestUser(req);
    if (!user) {
        return NextResponse.json({ error: 'Sign in to save a meal plan.' }, { status: 401 });
    }

    const supabase = createRequestClient(req);
    const { data, error } = await supabase
        .from('meal_plans')
        .insert({ plan_json: plan, preferences, user_id: user.id })
        .select()
        .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ saved: data });
}
