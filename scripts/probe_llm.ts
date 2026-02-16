
const BASE_URL = "http://192.168.2.182:8003";

async function check(name: string, path: string, method: string = "GET", body?: any) {
    try {
        const url = `${BASE_URL}${path}`;
        const opts: any = { method };
        if (body) {
            opts.headers = { "Content-Type": "application/json" };
            opts.body = JSON.stringify(body);
        }

        const res = await fetch(url, opts);
        console.log(`[${name}] ${method} ${path} -> ${res.status} ${res.statusText}`);
        if (res.ok) {
            try {
                const text = await res.text();
                console.log(`   Body: ${text.slice(0, 100).replace(/\n/g, ' ')}...`);
            } catch { }
        }
    } catch (e: any) {
        console.log(`[${name}] ${method} ${path} -> ERROR: ${e.message}`);
    }
}

async function main() {
    console.log(`Target: ${BASE_URL}`);
    await check("Root", "/");
    await check("Health", "/health");
    await check("Ping", "/ping");

    // OpenAI Style
    await check("OpenAI Models", "/v1/models");
    await check("OpenAI Chat", "/v1/chat/completions", "POST", {
        model: "any",
        messages: [{ role: "user", content: "hi" }]
    });

    // Ollama Style
    await check("Ollama Tags", "/api/tags");
    await check("Ollama Gen", "/api/generate", "POST", { model: "test", prompt: "hi" });

    // LocalAI / Other
    await check("Models (no v1)", "/models");
    await check("Chat (no v1)", "/chat/completions", "POST", {
        model: "any",
        messages: [{ role: "user", content: "hi" }]
    });
}

main();
