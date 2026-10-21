
import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { CHAT_COMPLETIONS_URL, LLM_MODEL, llmHeaders } from "@/lib/llm";

export async function POST(req: Request) {
    // OM55 — signed-in callers only. This route calls a paid/LLM backend (or fetches an arbitrary
    // URL) on the caller's behalf; anonymous callers could burn it or probe with it.
    if (!(await getRequestUser(req))) {
        return NextResponse.json({ error: 'Sign in to use this.' }, { status: 401 });
    }
    try {
        const body = await req.json();
        const { messages } = body;

        const response = await fetch(CHAT_COMPLETIONS_URL, {
            method: "POST",
            headers: llmHeaders(),
            body: JSON.stringify({
                model: LLM_MODEL,
                messages: messages,
                stream: false // For simplicity first, can do stream later if needed
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("LLM Error:", response.status, errorText);
            return NextResponse.json({ error: "Failed to communicate with AI" }, { status: response.status });
        }

        const data = await response.json();
        return NextResponse.json(data);

    } catch (error) {
        console.error("API Route Error:", error);
        return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
    }
}
