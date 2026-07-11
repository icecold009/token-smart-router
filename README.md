# Token Smart Router

A Track 1 AI agent that routes prompts intelligently — simple prompts are handled locally, complex ones go to Fireworks AI — minimising unnecessary token usage.

## Prerequisites
- Node.js 20+
- Docker (for containerised run)
- A [Fireworks AI](https://fireworks.ai) API key

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `FIREWORKS_API_KEY` | ✅ | Your Fireworks AI API key |
| `FIREWORKS_BASE_URL` | Optional | Defaults to `https://api.fireworks.ai/inference/v1` |
| `ALLOWED_MODELS` | Optional | Comma-separated model list; first entry is used |
| `PORT` | Optional | Server port (default: `3001`) |

Create a `.env` file at the root:


## Run with Docker (recommended)

```bash
docker compose up --build
```

## Run locally (development)

```bash
npm install
npm run dev
```

The React UI is available at `http://localhost:5173`.  
The Express API runs at `http://localhost:3001`.

## Run the task harness (scoring mode)

Place your tasks file at `./input/tasks.json`, then:

```bash
docker compose up --build
curl -X POST http://localhost:3001/run-tasks
```

Results are written to `./output/results.json`.

## How it works

- **Local route**: Short definitional prompts, formatting/list tasks — answered instantly without an API call
- **Fireworks route**: Complex reasoning and planning prompts — sent to the model specified in `ALLOWED_MODELS`

## Stack

- React + Vite (frontend)
- Express (backend)
- Fireworks AI via OpenAI-compatible SDK