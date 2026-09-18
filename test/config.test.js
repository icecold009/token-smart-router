import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_MODEL, loadConfig } from "../server/config.js";

function validEnvironment(overrides = {}) {
    return {
        FIREWORKS_API_KEY: "test-key",
        ...overrides,
    };
}

test("loads safe defaults without exposing credential values", () => {
    const config = loadConfig(validEnvironment());

    assert.equal(config.port, 3001);
    assert.equal(config.allowedOrigin, "http://localhost:5173");
    assert.equal(config.fireworksBaseUrl, "https://api.fireworks.ai/inference/v1");
    assert.deepEqual(config.allowedModels, [DEFAULT_MODEL]);
});

test("rejects missing credentials and unsafe provider URLs", () => {
    for (const environment of [
        {},
        validEnvironment({ FIREWORKS_API_KEY: "   " }),
        validEnvironment({ FIREWORKS_BASE_URL: "http://api.fireworks.ai/inference/v1" }),
        validEnvironment({ FIREWORKS_BASE_URL: "https://attacker.example/inference/v1" }),
        validEnvironment({ FIREWORKS_BASE_URL: "https://api.fireworks.ai/inference/v1?redirect=1" }),
    ]) {
        assert.throws(() => loadConfig(environment), { code: "CONFIG_INVALID" });
    }
});

test("rejects wildcard, multi-origin, and insecure production origins", () => {
    for (const environment of [
        validEnvironment({ ALLOWED_ORIGIN: "*" }),
        validEnvironment({ ALLOWED_ORIGIN: "https://one.example,https://two.example" }),
        validEnvironment({ NODE_ENV: "production", ALLOWED_ORIGIN: "http://localhost:5173" }),
    ]) {
        assert.throws(() => loadConfig(environment), { code: "CONFIG_INVALID" });
    }
});

test("rejects non-finite, non-integer, negative, and extreme numeric values", () => {
    for (const name of ["PORT", "MAX_OUTPUT_TOKENS", "MAX_OUTPUT_CHARS", "PROVIDER_TIMEOUT_MS"]) {
        for (const value of ["NaN", "Infinity", "-1", "1.5", "999999999999999999999"]) {
            assert.throws(() => loadConfig(validEnvironment({ [name]: value })), { code: "CONFIG_INVALID" });
        }
    }
});

test("rejects empty or malformed model configuration", () => {
    for (const value of [",", "model-a,", "model-\t-a", `${"x".repeat(201)}`]) {
        assert.throws(() => loadConfig(validEnvironment({ ALLOWED_MODELS: value })), { code: "CONFIG_INVALID" });
    }
});
