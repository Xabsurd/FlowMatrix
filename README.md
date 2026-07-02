# FlowMatrix

FlowMatrix is a local-first batch runner for ComfyUI workflows and OpenAI-compatible image APIs. It provides a Nuxt dashboard, SQLite task storage, backend scheduling, workflow presets, runtime inputs, a local worker, and matrix-style result browsing.

中文名：流阵。

## Quick Start

1. Add an execution backend. Use a ComfyUI endpoint for full workflow execution, or configure the Online API in Settings and add a backend with type `在线 API` and endpoint `openai`.
2. Import a ComfyUI API workflow JSON.
3. Create a call preset, then mark the parameters you want to edit at runtime.
4. Open Run, choose the preset and backend, fill candidate values, then inspect outputs in Runs & Results.

## Features

- Import ComfyUI API workflow JSON files.
- Create reusable call presets and runtime inputs.
- Run large parameter batches against one backend or automatic scheduling.
- Execute full ComfyUI workflows or prompt-based OpenAI-compatible image generation.
- Track queue status, task details, and generated results.
- Browse image results in a matrix view with row and column filtering.

## Requirements

- Node.js 22+
- npm
- A reachable ComfyUI instance for local workflow execution, or an OpenAI-compatible image API key for online execution

## Development

```bash
npm install
npm run dev
```

`npm run dev` starts the Nuxt app and auto-starts the local worker in LAN mode. Use `npm run dev:web` if you only want the web server, or `npm run worker` when running the worker as a separate process in another terminal.

Useful commands:

```bash
npm run typecheck
npm run lint
npm run build
```

## Configuration

ComfyUI backends, workflow presets, UI preferences, and OpenAI-compatible provider settings are managed inside the app. See `.env.example` for server-side defaults such as database path, storage root, and provider secret encryption.

## Online API

The first provider is OpenAI-compatible. Save `Base URL`, `Model`, and `API Key` in Settings, test the connection, then add an execution backend with type `在线 API`. During a run, FlowMatrix collects prompt/text parameters from the selected preset, calls the configured image API, and stores returned images in the same result gallery as ComfyUI outputs.

## License

FlowMatrix is licensed under GPL-3.0-or-later. See [LICENSE](./LICENSE).