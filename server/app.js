import cors from "cors";
import express from "express";

const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;

export function createRateLimiter() {
    const rateLimitMap = new Map();

    return function rateLimiter(req, res, next) {
        const ip = req.ip || req.socket.remoteAddress || "unknown";
        const now = Date.now();
        const entry = rateLimitMap.get(ip);

        if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
            rateLimitMap.set(ip, { count: 1, windowStart: now });
            return next();
        }

        if (entry.count >= RATE_LIMIT_MAX) {
            return res.status(429).json({ error: "Too many requests. Please try again later." });
        }

        entry.count += 1;
        return next();
    };
}

export function createApp({ config, router }) {
    const app = express();

    app.use(cors({ origin: config.allowedOrigin }));
    app.use(express.json({ limit: "16kb" }));
    app.use("/api/route", createRateLimiter());

    app.post("/api/route", async (req, res) => {
        try {
            const { prompt } = req.body || {};

            if (typeof prompt !== "string" || !prompt.trim()) {
                return res.status(400).json({ error: "Prompt is required." });
            }
            if (prompt.length > 2_000) {
                return res.status(400).json({ error: "Prompt must be 2000 characters or fewer." });
            }

            const route = router.routePrompt(prompt);
            if (route === "local") {
                const localResult = router.handleLocal(prompt);
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

            const result = await router.runFireworks(prompt);
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
            const failure = router.failureDetails ? router.failureDetails(error) : {
                code: "PROVIDER_ERROR",
                status: 502,
                retryable: true,
                message: "The model provider could not complete the request.",
            };
            console.error("Router request failed", { code: failure.code, status: failure.status });
            return res.status(failure.status).json({
                error: failure.message,
                code: failure.code,
                retryable: failure.retryable,
            });
        }
    });

    app.get("/api/health", (req, res) => {
        res.json({ ok: true });
    });

    return app;
}
