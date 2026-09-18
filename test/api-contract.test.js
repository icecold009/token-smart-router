import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";

import { createApp } from "../server/app.js";

const config = { allowedOrigin: "http://localhost:5173" };
const router = {
    routePrompt: (prompt) => (prompt.toLowerCase().includes("bullet") ? "local" : "fireworks"),
    handleLocal: () => ({ content: "local answer", reason: "local test" }),
    runFireworks: async () => ({
        output: "remote answer",
        model: "test-model",
        durationMs: 1,
        usage: { prompt_tokens: 3 },
    }),
    failureDetails: () => ({ code: "PROVIDER_ERROR", status: 502, retryable: true, message: "provider failed" }),
};

async function startServer() {
    const server = createApp({ config, router }).listen(0);
    await once(server, "listening");
    return server;
}

test("preserves local and remote /api/route response contracts", async (t) => {
    const server = await startServer();
    t.after(() => server.close());
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const localResponse = await fetch(`${baseUrl}/api/route`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: "Make a bullet list" }),
    });
    assert.equal(localResponse.status, 200);
    assert.deepEqual(await localResponse.json(), {
        route: "local",
        output: "local answer",
        reason: "local test",
        model: "local",
        durationMs: 0,
        estimatedInputTokens: 5,
        costEstimate: null,
    });

    const remoteResponse = await fetch(`${baseUrl}/api/route`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: "Write a detailed plan for a new application" }),
    });
    assert.equal(remoteResponse.status, 200);
    assert.equal((await remoteResponse.json()).model, "test-model");
});

test("keeps invalid prompts and the task harness outside the application contract", async (t) => {
    const server = await startServer();
    t.after(() => server.close());
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const invalidResponse = await fetch(`${baseUrl}/api/route`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: "   " }),
    });
    assert.equal(invalidResponse.status, 400);

    const harnessResponse = await fetch(`${baseUrl}/run-tasks`, { method: "POST" });
    assert.equal(harnessResponse.status, 404);
});
