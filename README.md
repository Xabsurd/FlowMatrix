# FlowMatrix

FlowMatrix is a local-first batch runner for ComfyUI workflows. It provides a Nuxt dashboard, SQLite task storage, a local worker, backend scheduling, workflow presets, runtime inputs, and result browsing.

中文名：流阵。

## Features

- Import ComfyUI API workflow JSON files.
- Create reusable call presets and runtime inputs.
- Run large parameter batches against one backend or automatic scheduling.
- Track queue status, task details, and generated results.
- Browse image results in a matrix view with row and column filtering.

## Requirements

- Node.js 22+
- npm
- A reachable ComfyUI instance for local workflow execution

## Development

```bash
npm install
npm run dev
```

`npm run dev` starts the Nuxt app. Start the worker in another terminal when you need task execution:

```bash
npm run worker
```

Useful commands:

```bash
npm run typecheck
npm run lint
npm run build
```

## Configuration

ComfyUI backends, workflow presets, UI preferences, and OpenAI-compatible provider settings are managed inside the app. See `.env.example` for server-side defaults such as database path and storage root.

## License

FlowMatrix is licensed under AGPL-3.0-or-later. See [LICENSE](./LICENSE).
