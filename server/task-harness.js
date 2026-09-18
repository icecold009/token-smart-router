import {
    existsSync,
    mkdirSync,
    readFileSync,
    renameSync,
    unlinkSync,
    writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

export const MAX_TASKS = 50;
export const MAX_PROMPT_LENGTH = 2_000;
export const MAX_OUTPUT_FILE_BYTES = 1_000_000;

function harnessError(code, message) {
    return Object.assign(new Error(message), { code });
}

function isWithinRoot(candidate, root) {
    const relativePath = relative(resolve(root), resolve(candidate));
    return relativePath === "" || (!relativePath.startsWith("..") && !relativePath.includes(":") && !relativePath.startsWith("/"));
}

export function validateTasks(value) {
    if (!Array.isArray(value)) throw harnessError("TASKS_INVALID", "Task input must be an array.");
    if (value.length > MAX_TASKS) throw harnessError("TASKS_TOO_LARGE", "Task input exceeds the maximum task count.");

    return value.map((task, index) => {
        if (!task || typeof task !== "object" || Array.isArray(task)) {
            throw harnessError("TASK_INVALID", `Task ${index + 1} is invalid.`);
        }

        const candidate = task.prompt ?? task.input ?? task.question;
        if (typeof candidate !== "string" || !candidate.trim()) {
            throw harnessError("TASK_PROMPT_INVALID", `Task ${index + 1} has no valid prompt.`);
        }

        const prompt = candidate.trim();
        if (prompt.length > MAX_PROMPT_LENGTH) {
            throw harnessError("TASK_PROMPT_TOO_LARGE", `Task ${index + 1} prompt is too large.`);
        }

        const taskId = task.id ?? task.task_id;
        if (taskId !== undefined && (typeof taskId !== "string" || taskId.length > 200)) {
            throw harnessError("TASK_ID_INVALID", `Task ${index + 1} has an invalid id.`);
        }

        return { taskId, prompt };
    });
}

export function resolveTaskPaths(environment = process.env, workingDirectory = process.cwd()) {
    const inputRoot = process.platform !== "win32" && existsSync("/input") ? "/input" : join(workingDirectory, "input");
    const outputRoot = process.platform !== "win32" && existsSync("/output") ? "/output" : join(workingDirectory, "output");
    const inputPath = resolve(environment.TASK_INPUT_FILE || join(inputRoot, "tasks.json"));
    const outputPath = resolve(environment.TASK_OUTPUT_FILE || join(outputRoot, "results.json"));

    if (!isWithinRoot(inputPath, inputRoot) || !isWithinRoot(outputPath, outputRoot)) {
        throw harnessError("TASK_PATH_INVALID", "Task input and output paths must stay within their configured directories.");
    }

    return { inputPath, outputPath, inputRoot, outputRoot };
}

export async function runTaskHarness({ inputPath, outputPath, inputRoot, outputRoot, router }) {
    if (
        !inputRoot ||
        !outputRoot ||
        !isWithinRoot(inputPath, inputRoot) ||
        !isWithinRoot(outputPath, outputRoot)
    ) {
        throw harnessError("TASK_PATH_INVALID", "Task input and output paths are invalid.");
    }

    let parsed;
    try {
        parsed = JSON.parse(readFileSync(inputPath, "utf8"));
    } catch {
        throw harnessError("TASK_INPUT_READ_FAILED", "Task input could not be read.");
    }

    const tasks = validateTasks(parsed);
    const results = [];
    for (const task of tasks) {
        const route = router.routePrompt(task.prompt);
        const answer = route === "local"
            ? router.handleLocal(task.prompt).content
            : (await router.runFireworks(task.prompt)).output;

        results.push({ task_id: task.taskId, answer, route });
    }

    const serialized = JSON.stringify(results, null, 2);
    if (Buffer.byteLength(serialized, "utf8") > MAX_OUTPUT_FILE_BYTES) {
        throw harnessError("TASK_OUTPUT_TOO_LARGE", "Task output exceeds the maximum file size.");
    }

    const outputDirectory = dirname(outputPath);
    mkdirSync(outputDirectory, { recursive: true });
    const temporaryPath = join(outputDirectory, `.results.${process.pid}.${Date.now()}.tmp`);
    try {
        writeFileSync(temporaryPath, serialized, { encoding: "utf8", flag: "wx" });
        renameSync(temporaryPath, outputPath);
    } catch {
        try {
            unlinkSync(temporaryPath);
        } catch {
            // Preserve the original failure without exposing a filesystem path.
        }
        throw harnessError("TASK_OUTPUT_WRITE_FAILED", "Task output could not be written.");
    }

    return { count: results.length };
}
