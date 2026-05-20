# @tierfall-app/demo-cli

> End-to-end TierFall demo. Boots Ollama, pulls a small model, runs the demo
> container against it.

## Quickstart

From the repo root:

```bash
docker compose -f apps/demo-cli/docker-compose.yml up --abort-on-container-exit demo
```

This will:

1. Start the `ollama` service (host port `11435` published; service-internal
   port stays `11434`).
2. Run `ollama-init`, which pulls `llama3.2:3b` (~2 GB on first run; cached in
   the `ollama-models` named volume on subsequent runs).
3. Build and run the demo container, which logs the adapters detected from
   environment and exits 0.

Tear down without losing the model cache:

```bash
docker compose -f apps/demo-cli/docker-compose.yml down
```

## Cloud-only profile

To skip Ollama entirely (useful once cloud-fall scenarios land):

```bash
docker compose -f apps/demo-cli/docker-compose.yml --profile cloud up demo-cloud-only
```

Make sure to export `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `DEEPSEEK_API_KEY`
in your environment first — see `.env.example`.

## Status

Scaffold only. The scenario logic — the actual fall demonstration — ships in
issue #9. Today the demo prints which adapters are configured and exits.
