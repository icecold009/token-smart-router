import dotenv from "dotenv";
import OpenAI from "openai";

import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createRouter, failureDetails } from "./router.js";

dotenv.config();

const config = loadConfig(process.env);
const client = new OpenAI({
    apiKey: config.fireworksApiKey,
    baseURL: config.fireworksBaseUrl,
});
const router = createRouter({
    config,
    complete: (request) => client.chat.completions.create(request),
});
const app = createApp({
    config,
    router: { ...router, failureDetails },
});

app.listen(config.port, () => {
    console.log(`Server running on port ${config.port}`);
});
