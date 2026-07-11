# Token-Smart Router

A beginner-friendly Track 1 AI agent that routes simple prompts locally and sends complex prompts to Fireworks only when needed, reducing unnecessary token usage.

## Why this project
Many AI apps call an LLM for every task. This project shows a lightweight agentic workflow that first decides whether a prompt can be solved locally.

## Stack
- React + Vite
- Express
- Fireworks API via OpenAI-compatible SDK

## How it works
- Simple formatting or short definition prompts use a local handler
- More complex reasoning and planning prompts are routed to Fireworks