# AGENTS.md

Durable knowledge for anyone (human or AI agent) picking this repo up on a fresh machine. If you clone this repo and don't have the conversation history that built it, read this file first.

## What this repo is

A portfolio project built one 15-minute lesson ("Day") at a time, from a PDF curriculum (kept locally at `docs/EnterpriseIntellligenceHub.pdf`, not in the repository), in both Python (`apps/ai-engine`) and TypeScript (`apps/web`). Every Day's code is actually run and its real output is what the matching `docs/Day N: <title>.md` reports - not a description of what the code is supposed to do. See `README.md` for the goal/architecture and the Progress Matrix.

## First-time setup on a new machine

### Python (`apps/ai-engine`)

```bash
cd apps/ai-engine
python -m venv .venv
source .venv/bin/activate        # .venv\Scripts\activate on Windows
pip install -r requirements.txt
cp .env.example .env             # then fill in OPENAI_API_KEY
```

TLS-inspecting proxy SSL errors on `pip install`: see `docs/` for the specific fix already found (root CA needs importing into the WSL/Linux trust store, not just `pip-system-certs`).

### TypeScript (`apps/web`)

```bash
cd apps/web
npm install --legacy-peer-deps   # --legacy-peer-deps is required - see "Known peer-dep conflict" below
cp .env.example .env             # then fill in OPENAI_API_KEY
```

### Running a Day's script

Every Python Day is a runnable module: `python src/agents/market_analyst.py` (adjust path per Day). Every TypeScript Day: `npx tsx src/agents/market-analyst.ts`.

## Verification commands (run before considering any change done)

```bash
# Python
cd apps/ai-engine && python <path-to-script>.py     # run it, read the real output
cd apps/ai-engine && ruff check .                   # Ruff is the formatter/linter here, not Black

# TypeScript
cd apps/web && npx tsc --noEmit                     # type-check
cd apps/web && npx oxlint .                          # lint
cd apps/web && npx oxfmt --check .                   # format check (--write . to fix)
cd apps/web && npx tsx <path-to-script>.ts           # run it, read the real output
```

Regression discipline used throughout this repo: after any dependency change, re-run at least Day 1's script on both sides (`market_analyst.py` / `market-analyst.ts`) to catch a silent breakage before moving on.

## Standing rules for continuing this repo (read before adding a new Day)

1. **Every Day needs a doc that reports what actually happened when the code ran** - real output, real errors found and fixed, real timing/evidence where the lesson is about performance or reliability. A doc that only shows a clean happy path is treated as incomplete; several existing Days deliberately document a bug that was hit and how it was diagnosed and fixed (see Day 13, 14, 16 for examples).
2. **The PDF curriculum is a starting point, not ground truth.** Every API shown in the PDF has been checked against the ACTUAL installed library version before being used - `pydantic-ai`, `llama-index`, `langfuse`, and others have all moved on since the PDF was written, and several PDF code snippets used APIs that no longer exist (see "Known API drift" below).
3. **A TypeScript port is not required to use the same library as Python** if no real equivalent exists - document the gap honestly instead of faking one. Day 14 (no embedded Qdrant client in JS - used real Docker Qdrant) and Day 16/17 (no Logfire package for JS - used plain OpenTelemetry / AI SDK telemetry) are the precedent.
4. **A new dependency that introduces a CRITICAL vulnerability `npm audit fix` can't resolve gets removed and reimplemented with existing dependencies**, not accepted. A MODERATE vulnerability with no fix available is an acceptable, explicitly-documented trade-off for a dev-only tool - state it in the commit message, don't ignore it silently. (Precedent: Day 10 removed `deepeval`'s TS package over a critical RCE; Day 14 documented and kept a moderate DoS advisory in a transitive dependency.)
5. **Git tag every completed Day**: `git tag -a day-N -m "Day N: <one-line summary>"` then `git push origin day-N`. If Python and TypeScript land in separate commits, tag both (`day-N` and `day-N-ts`).
6. **Comments explain the *why*, matching this repo's own established voice** - plain English, no unexplained jargon (the same "explain" convention used throughout the docs), and a note longer than one line goes in a block comment.

## Known API drift already found and fixed (don't rediscover these)

- `pydantic-ai`: `result.data` → `result.output`; `Agent(result_type=...)` → `Agent(output_type=...)`; single-class `OpenAIModel(base_url=..., api_key=...)` → split `OpenAIChatModel(model_name=..., provider=OpenAIProvider(base_url=..., api_key=...))`; `Agent(output_retries=...)` doesn't exist, the parameter is `Agent(retries=...)`.
- `pydantic-ai`'s DEFAULT output strategy (simulated tool-call) is unreliable against small/local models (see Day 16) - use `NativeOutput(YourModel)` for local Ollama models.
- `langfire`/`logfire`: `logfire.instrument_pydantic()` instruments Pydantic's OWN validation internals, NOT agent tracing - the call you actually want for agent spans is `logfire.instrument_pydantic_ai()`. Using the wrong one silently produces zero agent-level spans with no error.
- `langfuse` (Python and TS): the old `.trace()`/`.score()` API is gone in `langfuse` 4.x - it's OTel-native now (`start_as_current_observation` + span-level `.score()` in Python; `@langfuse/tracing` + `@langfuse/otel` in TS, NOT the legacy unscoped `langfuse` npm package). The TS `LangfuseSpanProcessor` needs `@opentelemetry/exporter-trace-otlp-http` as an explicit dependency - not surfaced by `npm install`, only by actually running the script.
- LlamaIndex.TS: `getContent()` requires an explicit `MetadataMode.NONE` argument (Python's `get_content()` doesn't). `VectorStoreIndex.fromDocuments`'s `storageContext` needs the full shape from `storageContextFromDefaults({ vectorStore })`, not a bare `{ vectorStore }` object literal.
- Qdrant: `qdrant-client`'s Python package has a genuine embedded in-memory client (`:memory:`); `@qdrant/js-client-rest` does NOT - it only talks to a real server. Also: two separate `:memory:` clients (sync + async) in Python do NOT share data - route everything through ONE client instance.
- No official Logfire package exists for TypeScript/Node - only Python. The closest real equivalent is plain OpenTelemetry (already used for Day 7) or the Vercel AI SDK's own built-in `experimental_telemetry` option.
- Ollama's OpenAI-compatible endpoint does not support the same structured-output schema enforcement OpenAI's real API does - the AI SDK's own runtime warning names this directly (`"responseFormat" is not supported... only supported with structuredOutputs`). Spell the exact expected JSON shape out explicitly in the prompt for local models; don't rely on the schema object alone.

## Known peer-dependency conflict (apps/web)

`@llamaindex/workflow-core`'s peer dependency on `next@^15.2.2` conflicts with other packages in this workspace whenever `npm audit fix` or a plain `npm install` (without `--legacy-peer-deps`) is attempted. This has recurred across at least 3 separate dependency additions. Always use `npm install --legacy-peer-deps` in `apps/web`; if `npm uninstall` itself gets blocked by a safety gate, edit `package.json` directly and run `npm install --legacy-peer-deps` to resync the lockfile non-destructively.

## CI (`.github/workflows/ci.yml`)

- `verify-web` (type-check, lint, format-check, build) runs on every run of the workflow (started by hand for now) - no secret needed.
- `verify-python`'s smoke-test and pytest steps are GATED on an `OPENAI_API_KEY` repository secret being configured (`Settings → Secrets and variables → Actions`). Without it, those steps are skipped rather than failing the whole pipeline - a fresh fork or clone without the secret configured still gets a green Python job, just without live-model verification.
- The pytest suite specifically (`apps/ai-engine/tests/test_agent_evaluation.py`, Day 10) needs a REAL `OPENAI_API_KEY` even to COLLECT (not just run) - `deepeval` validates the key at import time. Local runs need the key exported or `.env` loaded before `pytest` is invoked; `pytest` does not auto-load `.env` on its own.

## Local infra this repo's lessons may need (not always running)

- **Ollama** (Day 16+): `curl http://localhost:11434/api/tags` to check it's up and see pulled models. This machine had `qwen2.5-coder:7b` already pulled and used for the local-inference lessons - the Ollama CLI binary itself was NOT on PATH in this WSL environment even though the daemon was reachable at `localhost:11434`; use the REST API directly (`curl`) rather than assuming an `ollama` CLI command will work.
- **Qdrant** (Day 14's TypeScript port): needs a real server for the TS side specifically (`docker run -d --name esih-qdrant -p 6333:6333 qdrant/qdrant:latest`), even though the Python side runs fully in-memory with no server. Stop/remove it after: `docker stop esih-qdrant && docker rm esih-qdrant`.

## Curriculum renumbering (Day 47 onward)

The source PDF's original Days 47 and 48 turned out to be near-exact duplicates of already-built Days 29 and 42 respectively (same algorithms, different framing text). Rather than rebuild the same code under a new number, everything from original Day 49 onward was RENUMBERED to close the gap, and 2 new days were added at the end (built independently, not from the PDF) to reach a round Day 56:

| This repo's Day | Source PDF's original Day | Topic |
|---|---|---|
| 47 | 49 | Self-Healing Dynamic Tool Correction (`ModelRetry`) |
| 48 | 50 | Dynamic Tool Schema Introspection & MCP Tool Synthesis |
| 49 | 51 | Dynamic Vector Cache Invalidation with RRF |
| 50 | 52 | Dynamic Agent Tool Fallback & Secondary Routing |
| 51 | 53 | Graph-Augmented Vector Retrieval (Hybrid Graph-RAG) |
| 52 | 54 | Cryptographic Tool Permission Scoping |
| 53 | 55 | Resilient Streaming Agent Responses (Vercel AI SDK) |
| 54 | 56 | Distributed Vector Sharding & Tenant Isolation |
| 55 | — (new) | Built independently, not from the source PDF |
| 56 | — (new) | Built independently, not from the source PDF |

See `docs/Day 29: Token Bucket Rate Limiting.md` and `docs/Day 42: Agentic Self-Compaction & Hierarchical Memory Summarization.md` for the duplicate-finding notes.

## Where the deeper "why" lives

`.agents/skills/` holds longer-form, reusable write-ups of specific recurring problems (dependency-conflict recovery, structured-output reliability on small models, etc.) - check there before re-deriving a fix this repo has already found once. Start with `.agents/skills/portfolio-day-lesson-authoring.md` for the exact per-day workflow (extract PDF → verify against real APIs → write Python → write TS port → write both docs → commit → tag) and the required doc format - read it before starting any new Day. Read `.agents/skills/verify-honestly-report-negative-findings.md` alongside it - it's the standing discipline behind every "Run and Verify" section and every honest negative finding in this repo's docs.
