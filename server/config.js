export const DEFAULT_MODEL = "accounts/fireworks/models/llama-v3p1-8b-instruct";
export const DEFAULT_PROVIDER_BASE_URL = "https://api.fireworks.ai/inference/v1";

const DEFAULTS = {
    port: 3001,
    maxOutputTokens: 800,
    maxOutputChars: 12_000,
    providerTimeoutMs: 30_000,
    allowedOrigin: "http://localhost:5173",
};

function configurationError() {
    return Object.assign(new Error("Invalid server configuration."), {
        code: "CONFIG_INVALID",
    });
}

function readOptionalString(environment, name) {
    const value = environment[name];
    return value === undefined ? undefined : String(value).trim();
}

function parseBoundedInteger(environment, name, { defaultValue, min, max }) {
    const raw = readOptionalString(environment, name);
    if (raw === undefined || raw === "") return defaultValue;
    if (!/^\d+$/.test(raw)) throw configurationError();

    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < min || value > max) {
        throw configurationError();
    }
    return value;
}

function parseOrigin(environment) {
    const value = readOptionalString(environment, "ALLOWED_ORIGIN") || DEFAULTS.allowedOrigin;
    if (value === "*" || value.includes(",")) throw configurationError();

    let parsed;
    try {
        parsed = new URL(value);
    } catch {
        throw configurationError();
    }

    const production = readOptionalString(environment, "NODE_ENV") === "production";
    if (
        !["http:", "https:"].includes(parsed.protocol) ||
        parsed.username ||
        parsed.password ||
        parsed.pathname !== "/" ||
        parsed.search ||
        parsed.hash ||
        (production && parsed.protocol !== "https:")
    ) {
        throw configurationError();
    }

    return parsed.origin;
}

function parseProviderBaseUrl(environment) {
    const value = readOptionalString(environment, "FIREWORKS_BASE_URL") || DEFAULT_PROVIDER_BASE_URL;
    let parsed;
    try {
        parsed = new URL(value);
    } catch {
        throw configurationError();
    }

    const pathname = parsed.pathname.replace(/\/+$/, "");
    if (
        parsed.protocol !== "https:" ||
        parsed.hostname !== "api.fireworks.ai" ||
        parsed.port ||
        parsed.username ||
        parsed.password ||
        parsed.search ||
        parsed.hash ||
        pathname !== "/inference/v1"
    ) {
        throw configurationError();
    }

    return `${parsed.origin}${pathname}`;
}

function parseModels(environment) {
    const raw = readOptionalString(environment, "ALLOWED_MODELS");
    if (!raw) return [DEFAULT_MODEL];

    const models = raw.split(",").map((model) => model.trim());
    if (
        models.length === 0 ||
        models.some((model) => !model || model.length > 200 || /[\r\n\t]/.test(model))
    ) {
        throw configurationError();
    }
    return models;
}

export function loadConfig(environment = process.env) {
    const apiKey = readOptionalString(environment, "FIREWORKS_API_KEY");
    if (!apiKey) throw configurationError();

    return Object.freeze({
        port: parseBoundedInteger(environment, "PORT", { defaultValue: DEFAULTS.port, min: 1, max: 65_535 }),
        maxOutputTokens: parseBoundedInteger(environment, "MAX_OUTPUT_TOKENS", {
            defaultValue: DEFAULTS.maxOutputTokens,
            min: 64,
            max: 4_096,
        }),
        maxOutputChars: parseBoundedInteger(environment, "MAX_OUTPUT_CHARS", {
            defaultValue: DEFAULTS.maxOutputChars,
            min: 1_000,
            max: 50_000,
        }),
        providerTimeoutMs: parseBoundedInteger(environment, "PROVIDER_TIMEOUT_MS", {
            defaultValue: DEFAULTS.providerTimeoutMs,
            min: 2_000,
            max: 120_000,
        }),
        allowedOrigin: parseOrigin(environment),
        fireworksApiKey: apiKey,
        fireworksBaseUrl: parseProviderBaseUrl(environment),
        allowedModels: Object.freeze(parseModels(environment)),
    });
}
