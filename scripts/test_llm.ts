
const BASE_URL = "http://192.168.2.182:8003";

async function testEndpoint(path: string, method: string = "GET", body?: any) {
    const url = `${BASE_URL}${path}`;
    console.log(`Testing ${method} ${url}...`);
    try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(url, {
            method,
            headers: { "Content-Type": "application/json" },
            body: body ? JSON.stringify(body) : undefined,
            signal: controller.signal
        });
        clearTimeout(id);

        console.log(`Status: ${response.status} ${response.statusText}`);
        if (response.ok) {
            const text = await response.text();
            console.log("Response peek:", text.slice(0, 200));
            return true;
        }
    } catch (e: any) {
        console.log(`Error: ${e.message}`);
    }
    return false;
}

async function main() {
    console.log("--- Probing LLM Server ---");

    // 1. Check root
    await testEndpoint("/");

    // 2. Check models (standard OpenAI)
    await testEndpoint("/v1/models");

    // 3. Check chat completions
    await testEndpoint("/v1/chat/completions", "POST", {
        model: "test", // vLLM often ignores this or needs a specific one
        messages: [{ role: "user", content: "hi" }]
    });

    // 5. Check Ollama style
    await testEndpoint("/api/tags");
    await testEndpoint("/api/generate", "POST", { model: "test", prompt: "hi" });

    // 6. Check generic health
    await testEndpoint("/health");
    await testEndpoint("/ping");
}

main();
