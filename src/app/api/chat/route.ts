
import { NextResponse } from "next/server";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { messages } = body;

        // "http://192.168.2.182:8003/v1/chat/completions"
        const LLM_URL = "http://192.168.2.182:8003/v1/chat/completions";

        const response = await fetch(LLM_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "test", // or whatever model name the server expects, usually flexible with vLLM/Ollama
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

    } catch (error: any) {
        console.error("API Route Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
