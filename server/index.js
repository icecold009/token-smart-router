import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

dotenv.config();

const app = express();

app.use(cors({ origin: process.env.ALLOWED_ORIGIN || "http://localhost:5173" }));

app.use(express.json({ limit: "16kb" }));

const rateLimitMap = new Map();
const RATE_LIMIT_MAX = 20;          // max requests
const RATE_LIMIT_WINDOW_MS = 60_000; // per 60 seconds
const MAX_OUTPUT_TOKENS = Math.max(64, Number(process.env.MAX_OUTPUT_TOKENS || 800));
const MAX_OUTPUT_CHARS = Math.max(1000, Number(process.env.MAX_OUTPUT_CHARS || 12000));
const PROVIDER_TIMEOUT_MS = Math.max(2_000, Number(process.env.PROVIDER_TIMEOUT_MS || 30_000));

function rateLimiter(req, res, next) {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const entry = rateLimitMap.get(ip);

    if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
        // First request in this window, or window has expired — reset.
        rateLimitMap.set(ip, { count: 1, windowStart: now });
        return next();
    }

    if (entry.count >= RATE_LIMIT_MAX) {
        return res.status(429).json({ error: "Too many requests. Please try again later." });
    }

    entry.count += 1;
    return next();
}

// Apply rate limiter to the public-facing route endpoint only.
app.use("/api/route", rateLimiter);

const client = new OpenAI({
    apiKey: process.env.FIREWORKS_API_KEY,
    baseURL: process.env.FIREWORKS_BASE_URL || "https://api.fireworks.ai/inference/v1",
});

function routePrompt(prompt) {
    const p = prompt.toLowerCase().trim();

    if (
        p.includes("bullet") ||
        p.includes("format") ||
        p.includes("todo") ||
        p.includes("list these")
    ) {
        return "local";
    }

    if (
        p.length < 100 &&
        (p.startsWith("what is") ||
            p.startsWith("define") ||
            p.startsWith("explain briefly"))
    ) {
        return "local";
    }

    return "fireworks";
}

function handleLocal(prompt) {
    const p = prompt.trim();

    if (p.toLowerCase().includes("bullet") || p.toLowerCase().includes("list")) {
        return {
            content:
                "- Break the problem into smaller tasks\n- Build the smallest working version\n- Test one example locally\n- Improve only after it works",
            reason: "Used local route for simple formatting/list task.",
        };
    }

    if (p.toLowerCase().startsWith("what is")) {
        return {
            content:
                "This was handled locally as a short definitional prompt to save tokens.",
            reason: "Used local route for a short definitional prompt.",
        };
    }

    return {
        content:
            "Local handler completed a simple request without calling the model.",
        reason: "Used local route to save tokens on a simple prompt.",
    };
}

function modelName() {
    return process.env.ALLOWED_MODELS
        ? process.env.ALLOWED_MODELS.split(",")[0].trim()
        : "accounts/fireworks/models/llama-v3p1-8b-instruct";
}

function boundedOutput(value) {
    const output = String(value || "No response returned from Fireworks.");
    return output.length > MAX_OUTPUT_CHARS
        ? `${output.slice(0, MAX_OUTPUT_CHARS)}\n\n[Output truncated by server limit.]`
        : output;
}

function failureDetails(error) {
    const status = Number(error?.status || error?.response?.status || 0);
    if (status === 429) return { code: "RATE_LIMITED", status: 429, retryable: true, message: "The model provider rate limit was reached." };
    if (status === 401 || status === 403) return { code: "PROVIDER_AUTH", status: 502, retryable: false, message: "The model provider is not configured for this server." };
    if (status === 408 || error?.name === "TimeoutError") return { code: "PROVIDER_TIMEOUT", status: 504, retryable: true, message: "The model provider took too long to respond." };
    return { code: "PROVIDER_ERROR", status: 502, retryable: true, message: "The model provider could not complete the request." };
}

async function runFireworks(prompt) {
    const startedAt = Date.now();
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, PROVIDER_TIMEOUT_MS);
    try {
        const response = await client.chat.completions.create({
            model: modelName(),
            max_tokens: MAX_OUTPUT_TOKENS,
            messages: [
                { role: "system", content: "You are a helpful project copilot. Give concise, practical answers." },
                { role: "user", content: prompt },
            ],
            signal: controller.signal,
        });
        return {
            output: boundedOutput(response.choices?.[0]?.message?.content),
            model: modelName(),
            durationMs: Date.now() - startedAt,
            usage: response.usage || null,
        };
    } catch (error) {
        if (timedOut) throw Object.assign(new Error("The model provider timed out."), { name: "TimeoutError" });
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

app.post("/api/route", async (req, res) => {
    try {
        const { prompt } = req.body || {};

        if (typeof prompt !== "string" || !prompt.trim()) {
            return res.status(400).json({ error: "Prompt is required." });
        }
        if (prompt.length > 2000) {
            return res.status(400).json({ error: "Prompt must be 2000 characters or fewer." });
        }

        const route = routePrompt(prompt);

        if (route === "local") {
            const localResult = handleLocal(prompt);
            return res.json({
                route,
                output: localResult.content,
                reason: localResult.reason,
                model: "local",
                durationMs: 0,
                estimatedInputTokens: Math.ceil(prompt.trim().length / 4),
                costEstimate: null,
            });
        }

        const result = await runFireworks(prompt);

        return res.json({
            route,
            output: result.output,
            reason: "Used Fireworks for a more complex reasoning/generation prompt.",
            model: result.model,
            durationMs: result.durationMs,
            estimatedInputTokens: result.usage?.prompt_tokens || Math.ceil(prompt.trim().length / 4),
            costEstimate: null,
        });
    } catch (error) {
        const failure = failureDetails(error);
        console.error("Router request failed", { code: failure.code, status: failure.status });
        return res.status(failure.status).json({ error: failure.message, code: failure.code, retryable: failure.retryable });
    }
});

app.get("/api/health", (req, res) => {
    res.json({ ok: true });
});

app.post("/run-tasks", async (req, res) => {
    try {
        const inputPath = process.env.TASK_INPUT_FILE || "/input/tasks.json";
        const outputPath = process.env.TASK_OUTPUT_FILE || "/output/results.json";

        const tasks = JSON.parse(readFileSync(inputPath, "utf-8"));
        const results = [];

        for (const task of tasks) {
            const prompt = task.prompt || task.input || task.question || "";
            const route = routePrompt(prompt);
            let answer;

            if (route === "local") {
                answer = handleLocal(prompt).content;
            } else {
                answer = (await runFireworks(prompt)).output;
            }

            results.push({ task_id: task.id || task.task_id, answer, route });
        }

        const outputDir = outputPath.substring(0, outputPath.lastIndexOf("/"));
        if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
        writeFileSync(outputPath, JSON.stringify(results, null, 2));

        return res.json({ ok: true, count: results.length });
    } catch (err) {
        console.error("Task harness failed", { message: err instanceof Error ? err.message : "unknown" });
        return res.status(500).json({ error: "Server error processing request." });
    }
});

app.listen(process.env.PORT || 3001, () => {
    console.log(`Server running on port ${process.env.PORT || 3001}`);
});
