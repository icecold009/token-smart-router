# Token Smart Router

Token Smart Router is a small AI gateway that decides whether a prompt needs a remote model. Short, predictable tasks can be answered locally; complex reasoning and planning can be sent to Fireworks AI. The goal is straightforward: spend model tokens where they add value, while keeping the routing decision visible and easy to test.

## How it works

1. The React client submits a prompt to the local Express API.
2. The router classifies the request by task shape and complexity.
3. Local-friendly prompts are handled without an external model call.
4. More involved prompts are sent to the configured Fireworks model.
5. The response is returned to the UI with the selected route available for inspection.

The task harness can also run a batch of prompts and write results to `output/results.json`.

## Prerequisites

- Node.js 20 or newer
- Docker, if using the container workflow
- A [Fireworks AI](https://fireworks.ai) API key for remote routing

## Configuration

Create a `.env` file in the repository root:

| Variable | Required | Purpose |
|---|---:|---|
| `FIREWORKS_API_KEY` | Yes for remote routing | Fireworks credential |
| `FIREWORKS_BASE_URL` | No | Defaults to `https://api.fireworks.ai/inference/v1` |
| `ALLOWED_MODELS` | No | Comma-separated model allowlist; the first is selected |
| `PORT` | No | Express port; defaults to `3001` |
| `MAX_OUTPUT_TOKENS` | No | Server-side remote output cap; defaults to `800` |
| `MAX_OUTPUT_CHARS` | No | Server-side response-size cap; defaults to `12000` |
| `PROVIDER_TIMEOUT_MS` | No | Remote provider timeout; defaults to `30000` ms |

Keep `.env` local. The API key belongs on the server and must never be exposed in the Vite client bundle.

## Run locally

```bash
npm install
npm run dev
```

The React UI runs at <http://localhost:5173> and the Express API at <http://localhost:3001>.

The UI shows the selected route, model, approximate input tokens, latency, and
whether a cost estimate is configured. Run history stays in memory for the
current tab only; it is not persisted to local storage.

## Run with Docker

```bash
docker compose up --build
```

## Run the task harness

Place a task file at `input/tasks.json`, then start the service and call:

```bash
curl -X POST http://localhost:3001/run-tasks
```

Results are written to `output/results.json`.

## Technology

- React and Vite
- Express
- Fireworks AI through the OpenAI-compatible SDK
- Docker Compose for the container workflow

## Honest limits

The local route is a deterministic optimisation, not a general-purpose language model. The remote route depends on Fireworks credentials, model availability, and network access. Add representative routing tests before using the router as a cost or latency guarantee in production.
