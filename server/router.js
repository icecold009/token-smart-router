function routePrompt(prompt) {
    const value = prompt.toLowerCase().trim();

    if (
        value.includes("bullet") ||
        value.includes("format") ||
        value.includes("todo") ||
        value.includes("list these")
    ) {
        return "local";
    }

    if (
        value.length < 100 &&
        (value.startsWith("what is") ||
            value.startsWith("define") ||
            value.startsWith("explain briefly"))
    ) {
        return "local";
    }

    return "fireworks";
}

function handleLocal(prompt) {
    const value = prompt.trim();

    if (value.toLowerCase().includes("bullet") || value.toLowerCase().includes("list")) {
        return {
            content:
                "- Break the problem into smaller tasks\n- Build the smallest working version\n- Test one example locally\n- Improve only after it works",
            reason: "Used local route for simple formatting/list task.",
        };
    }

    if (value.toLowerCase().startsWith("what is")) {
        return {
            content: "This was handled locally as a short definitional prompt to save tokens.",
            reason: "Used local route for a short definitional prompt.",
        };
    }

    return {
        content: "Local handler completed a simple request without calling the model.",
        reason: "Used local route to save tokens on a simple prompt.",
    };
}

function boundedOutput(value, maxOutputChars) {
    const output = String(value || "No response returned from Fireworks.");
    return output.length > maxOutputChars
        ? `${output.slice(0, maxOutputChars)}\n\n[Output truncated by server limit.]`
        : output;
}

export function failureDetails(error) {
    const status = Number(error?.status || error?.response?.status || 0);
    if (status === 429) {
        return {
            code: "RATE_LIMITED",
            status: 429,
            retryable: true,
            message: "The model provider rate limit was reached.",
        };
    }
    if (status === 401 || status === 403) {
        return {
            code: "PROVIDER_AUTH",
            status: 502,
            retryable: false,
            message: "The model provider is not configured for this server.",
        };
    }
    if (status === 408 || error?.name === "TimeoutError") {
        return {
            code: "PROVIDER_TIMEOUT",
            status: 504,
            retryable: true,
            message: "The model provider took too long to respond.",
        };
    }
    return {
        code: "PROVIDER_ERROR",
        status: 502,
        retryable: true,
        message: "The model provider could not complete the request.",
    };
}

export function createRouter({ config, complete }) {
    if (!config || typeof complete !== "function") {
        throw new TypeError("Router dependencies are required.");
    }

    async function runFireworks(prompt) {
        const startedAt = Date.now();
        const controller = new AbortController();
        let timedOut = false;
        const timeout = setTimeout(() => {
            timedOut = true;
            controller.abort();
        }, config.providerTimeoutMs);

        try {
            const response = await complete({
                model: config.allowedModels[0],
                max_tokens: config.maxOutputTokens,
                messages: [
                    { role: "system", content: "You are a helpful project copilot. Give concise, practical answers." },
                    { role: "user", content: prompt },
                ],
                signal: controller.signal,
            });

            return {
                output: boundedOutput(response.choices?.[0]?.message?.content, config.maxOutputChars),
                model: config.allowedModels[0],
                durationMs: Date.now() - startedAt,
                usage: response.usage || null,
            };
        } catch (error) {
            if (timedOut) {
                throw Object.assign(new Error("The model provider timed out."), { name: "TimeoutError" });
            }
            throw error;
        } finally {
            clearTimeout(timeout);
        }
    }

    return Object.freeze({ routePrompt, handleLocal, runFireworks });
}
