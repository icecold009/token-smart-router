import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
    MAX_TASKS,
    resolveTaskPaths,
    runTaskHarness,
    validateTasks,
} from "../server/task-harness.js";

const localRouter = {
    routePrompt: () => "local",
    handleLocal: () => ({ content: "local answer" }),
    runFireworks: async () => {
        throw new Error("provider must not be called");
    },
};

test("validates task count, shape, and prompt bounds", () => {
    assert.deepEqual(validateTasks([{ id: "one", prompt: "What is a stack?" }]), [
        { taskId: "one", prompt: "What is a stack?" },
    ]);
    assert.throws(() => validateTasks(Array.from({ length: MAX_TASKS + 1 }, () => ({ prompt: "x" }))), { code: "TASKS_TOO_LARGE" });
    assert.throws(() => validateTasks([{ prompt: "   " }]), { code: "TASK_PROMPT_INVALID" });
    assert.throws(() => validateTasks([{ prompt: "x".repeat(2_001) }]), { code: "TASK_PROMPT_TOO_LARGE" });
    assert.throws(() => validateTasks([null]), { code: "TASK_INVALID" });
});

test("keeps configured task paths inside their input and output roots", () => {
    const environment = {
        TASK_INPUT_FILE: join(process.cwd(), "input", "tasks.json"),
        TASK_OUTPUT_FILE: join(process.cwd(), "output", "results.json"),
    };
    const paths = resolveTaskPaths(environment, process.cwd());
    assert.equal(paths.inputPath, environment.TASK_INPUT_FILE);
    assert.equal(paths.outputPath, environment.TASK_OUTPUT_FILE);
    assert.equal(paths.inputRoot, join(process.cwd(), "input"));
    assert.equal(paths.outputRoot, join(process.cwd(), "output"));
    assert.throws(() => resolveTaskPaths({ ...environment, TASK_OUTPUT_FILE: join(process.cwd(), "outside.json") }, process.cwd()), { code: "TASK_PATH_INVALID" });
});

test("runs valid local tasks and writes results only after validation", async () => {
    const directory = await mkdtemp(join(tmpdir(), "token-router-harness-"));
    const inputPath = join(directory, "tasks.json");
    const outputPath = join(directory, "results.json");
    await writeFile(inputPath, JSON.stringify([{ id: "one", prompt: "What is a stack?" }]));

    const result = await runTaskHarness({
        inputPath,
        outputPath,
        inputRoot: directory,
        outputRoot: directory,
        router: localRouter,
    });
    assert.deepEqual(result, { count: 1 });
    assert.match(await readFile(outputPath, "utf8"), /"task_id": "one"/);
});

test("does not write output when task validation fails", async () => {
    const directory = await mkdtemp(join(tmpdir(), "token-router-harness-"));
    const inputPath = join(directory, "tasks.json");
    const outputPath = join(directory, "results.json");
    await writeFile(inputPath, JSON.stringify([{ id: "bad", prompt: "x".repeat(2_001) }]));

    await assert.rejects(() => runTaskHarness({
        inputPath,
        outputPath,
        inputRoot: directory,
        outputRoot: directory,
        router: localRouter,
    }), { code: "TASK_PROMPT_TOO_LARGE" });
    await assert.rejects(() => readFile(outputPath, "utf8"), { code: "ENOENT" });
});
