import dotenv from "dotenv";
import OpenAI from "openai";

import { createRouter } from "../server/router.js";
import { loadConfig } from "../server/config.js";
import { resolveTaskPaths, runTaskHarness } from "../server/task-harness.js";

try {
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
    const { inputPath, outputPath, inputRoot, outputRoot } = resolveTaskPaths(process.env);
    const result = await runTaskHarness({ inputPath, outputPath, inputRoot, outputRoot, router });
    console.log(JSON.stringify({ ok: true, count: result.count }));
} catch (error) {
    console.error("Task harness failed", { code: error?.code || "TASK_HARNESS_ERROR" });
    process.exitCode = 1;
}
