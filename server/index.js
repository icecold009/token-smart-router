import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

dotenv.config();

console.log("Fireworks key loaded:", !!process.env.FIREWORKS_API_KEY);
console.log("Key prefix:", process.env.FIREWORKS_API_KEY?.slice(0, 6));

const app = express();
app.use(cors());
app.use(express.json());

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

app.post("/api/route", async (req, res) => {
    try {
        const { prompt } = req.body;

        if (!prompt || !prompt.trim()) {
            return res.status(400).json({ error: "Prompt is required." });
        }

        const route = routePrompt(prompt);

        if (route === "local") {
            const localResult = handleLocal(prompt);
            return res.json({
                route,
                output: localResult.content,
                reason: localResult.reason,
            });
        }

        const response = await client.chat.completions.create({
            model: process.env.ALLOWED_MODELS
                ? process.env.ALLOWED_MODELS.split(",")[0].trim()
                : "accounts/fireworks/models/llama-v3p1-8b-instruct",
            messages: [
                {
                    role: "system",
                    content:
                        "You are a helpful project copilot. Give concise, practical answers.",
                },
                {
                    role: "user",
                    content: prompt,
                },
            ],
        });

        const output =
            response.choices?.[0]?.message?.content ||
            "No response returned from Fireworks.";

        return res.json({
            route,
            output,
            reason: "Used Fireworks for a more complex reasoning/generation prompt.",
        });
    } catch (error) {
        console.error("Full backend error:", error);

        return res.status(500).json({
            error:
                error?.message ||
                error?.response?.data?.error?.message ||
                "Server error while processing the prompt."
        });
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
                const response = await client.chat.completions.create({
                    model: process.env.ALLOWED_MODELS
                        ? process.env.ALLOWED_MODELS.split(",")[0].trim()
                        : "accounts/fireworks/models/llama-v3p1-8b-instruct",
                    messages: [
                        { role: "system", content: "You are a helpful project copilot. Give concise, practical answers." },
                        { role: "user", content: prompt },
                    ],
                });
                answer = response.choices?.[0]?.message?.content || "";
            }

            results.push({ task_id: task.id || task.task_id, answer, route });
        }

        const outputDir = outputPath.substring(0, outputPath.lastIndexOf("/"));
        if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
        writeFileSync(outputPath, JSON.stringify(results, null, 2));

        return res.json({ ok: true, count: results.length });
    } catch (err) {
        console.error("Task harness error:", err);
        return res.status(500).json({ error: err.message });
    }
});


app.listen(process.env.PORT || 3001, () => {
    console.log(`Server running on port ${process.env.PORT || 3001}`);
});