const fs = require("fs");
const http = require("http");
const path = require("path");

const rootDir = __dirname;
const port = Number(process.env.PORT || 3000);
const model = process.env.OPENROUTER_MODEL || "openrouter/auto";
const openRouterEndpoint = "https://openrouter.ai/api/v1/chat/completions";
const apiKeyFile = path.join(rootDir, "api key", "apikey.txt");

const mimeTypes = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon"
};

const hotelAssistantPrompt = `
You are shmia, the SHMaaS hostel assistant for the TVET MARA Besut student accommodation website and app.

Stay focused on hotel, hostel, booking, account, website, room availability, roommate details, warden duty, check-in, check-out, facilities, contact, location, payment, booking status, signup, forgot password, and policy questions.

Known website facts:
- Students use this site to view hostel blocks, create an account, log in, and book one bed.
- Rooms have 6 beds each.
- Each student can book only 1 bed.
- Blocks include Block A1, Block A2, Block B1, Block B2, and Block C.
- Login is required before booking.
- Desktop registration is available on signup.html. Mobile app registration is available from the login page.
- Student council access cannot be self-selected; staff or admin grants it.
- Forgot password is available from the login form.
- No price is shown and no payment is charged in this system.
- Booking status should be checked after logging in to the student dashboard.
- For exact office phone, address, check-in dates, or urgent issues, guide users to the website Contact section or hostel management.
- Roommates are shown on the student dashboard after assignment. Warden duty can be checked by date with Duty Lookup.

Answer in the user's language when practical, including Malay or English. Be concise and specific. Never invent live availability, personal records, names, dates, phone numbers, approval status, or payment details. Ask one short follow-up when required. Do not repeat the user's question. If unrelated, redirect to SHMaaS support.
`.trim();

function sendJson(response, statusCode, payload) {
    response.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
    });
    response.end(JSON.stringify(payload));
}

function readRequestBody(request) {
    return new Promise((resolve, reject) => {
        let body = "";

        request.on("data", (chunk) => {
            body += chunk;
            if (body.length > 1024 * 1024) {
                reject(new Error("Request body too large"));
                request.destroy();
            }
        });

        request.on("end", () => resolve(body));
        request.on("error", reject);
    });
}

function readOpenRouterApiKeys() {
    const envKeys = process.env.OPENROUTER_KEYS || "";
    const fileContent = fs.existsSync(apiKeyFile) ? fs.readFileSync(apiKeyFile, "utf8") : "";
    const matches = `${envKeys}\n${fileContent}`.match(/sk-or-v1-[A-Za-z0-9_-]+/g);
    const keys = matches ? [...new Set(matches)] : [];

    if (!keys.length) {
        throw new Error("OpenRouter API key was not found. Set OPENROUTER_KEYS or api key/apikey.txt.");
    }

    return keys;
}

async function requestOpenRouterChat(apiKey, messages, origin) {
    return fetch(openRouterEndpoint, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": origin || "https://shmaas-3a0c6.web.app",
            "X-Title": "SHMaaS Student Hostel Chatbot",
            "X-OpenRouter-Title": "SHMaaS Student Hostel Chatbot"
        },
        body: JSON.stringify({
            model,
            messages,
            temperature: 0.35,
            max_tokens: 450
        })
    });
}

function shouldTryNextKey(statusCode) {
    return [401, 403, 429, 500, 502, 503, 504].includes(statusCode);
}

function sanitizeHistory(history) {
    if (!Array.isArray(history)) {
        return [];
    }

    return history
        .filter((entry) => entry && (entry.role === "user" || entry.role === "assistant") && typeof entry.content === "string")
        .slice(-12)
        .map((entry) => ({
            role: entry.role,
            content: entry.content.slice(0, 2000)
        }));
}

async function handleChat(request, response) {
    try {
        const rawBody = await readRequestBody(request);
        const payload = JSON.parse(rawBody || "{}");
        const message = typeof payload.message === "string" ? payload.message.trim() : "";

        if (!message) {
            sendJson(response, 400, { error: "Message is required." });
            return;
        }

        const apiKeys = readOpenRouterApiKeys();
        const messages = [
            { role: "system", content: hotelAssistantPrompt },
            ...sanitizeHistory(payload.history),
            { role: "user", content: message.slice(0, 2000) }
        ];
        const origin = request.headers.origin || request.headers.referer || "";

        let lastError = null;

        for (let index = 0; index < apiKeys.length; index += 1) {
            try {
                const openRouterResponse = await requestOpenRouterChat(apiKeys[index], messages, origin);

                if (!openRouterResponse.ok) {
                    const detail = await openRouterResponse.text();
                    lastError = new Error(`OpenRouter key ${index + 1} failed with ${openRouterResponse.status}: ${detail.slice(0, 220)}`);

                    if (shouldTryNextKey(openRouterResponse.status) && index < apiKeys.length - 1) {
                        continue;
                    }

                    throw lastError;
                }

                const data = await openRouterResponse.json();
                const reply = data && data.choices && data.choices[0] && data.choices[0].message
                    ? data.choices[0].message.content
                    : "";

                if (!reply) {
                    throw new Error("OpenRouter response did not include a reply.");
                }

                sendJson(response, 200, { reply });
                return;
            } catch (error) {
                lastError = error;

                if (index < apiKeys.length - 1) {
                    continue;
                }
            }
        }

        throw lastError || new Error("All OpenRouter API keys failed.");
    } catch (error) {
        console.error("Chat endpoint error:", error.message);
        sendJson(response, 502, {
            error: "Sorry, I'm having trouble connecting right now. Please try again in a moment."
        });
    }
}

function isBlockedStaticPath(filePath) {
    const relativePath = path.relative(rootDir, filePath);
    return relativePath.startsWith("..")
        || path.isAbsolute(relativePath)
        || relativePath.split(path.sep).includes("api key")
        || relativePath.split(path.sep).includes(".git")
        || relativePath.split(path.sep).includes("node_modules")
        || path.basename(filePath) === "server.js";
}

function serveStatic(request, response) {
    const requestUrl = new URL(request.url, `http://${request.headers.host}`);
    const decodedPath = decodeURIComponent(requestUrl.pathname);
    const safePath = decodedPath === "/" ? "/index.html" : decodedPath;
    const filePath = path.resolve(rootDir, `.${safePath}`);

    if (isBlockedStaticPath(filePath)) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Not found");
        return;
    }

    fs.readFile(filePath, (error, content) => {
        if (error) {
            response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
            response.end("Not found");
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        response.writeHead(200, {
            "Content-Type": mimeTypes[ext] || "application/octet-stream",
            "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=3600"
        });
        response.end(content);
    });
}

const server = http.createServer((request, response) => {
    if (request.method === "OPTIONS") {
        response.writeHead(204, {
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Allow-Origin": "*"
        });
        response.end();
        return;
    }

    if (request.url && request.url.startsWith("/api/chat")) {
        if (request.method !== "POST") {
            sendJson(response, 405, { error: "Method not allowed." });
            return;
        }

        handleChat(request, response);
        return;
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Method not allowed");
        return;
    }

    serveStatic(request, response);
});

server.listen(port, () => {
    console.log(`SHMaaS website and AI chatbot backend running at http://localhost:${port}`);
});
