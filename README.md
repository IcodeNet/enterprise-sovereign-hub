# Enterprise Sovereign Intelligence Hub

A single, continuously-growing portfolio project built one 15-minute lesson ("Day") at a time, in both Python and TypeScript, with every claim backed by real, executed evidence rather than a description of what the code should do.

📖 **[Read the book: Building Trustworthy AI Agents](https://icodenet.github.io/enterprise-sovereign-hub/)** — currently 64 days compiled into a single-file field guide, plus a Part X capstone chapter ("Eunomia") that assembles them into one architecture. Published via GitHub Pages (also readable offline at [`book/building-trustworthy-ai-agents.html`](book/building-trustworthy-ai-agents.html)). Tagged `book` (`git checkout book` pins the exact commit).
The capstone itself, Eunomia, is described in Part X of the book; its implementation is not part of this repository.

## Goal

Build a modular enterprise AI system end to end - agent orchestration, resilience, retrieval, and integration - as a working monorepo rather than a pile of disconnected demo scripts. Each Day adds one real capability, in both languages where a genuine equivalent exists, verified by actually running the code and keeping the evidence (timing comparisons, real client round-trips, span-ID matches, repeated runs to catch flakiness) in the day's own doc rather than a bare "it works."

## What Actually Happens When You Send It a Message

Once wired together, the point of all this isn't 64 separate scripts — it's one live pipeline you can watch run in the chat UI.

Here's what happens to a single message, start to finish:

1. **It hits a security gate first.** Before any model ever sees your message, a fast check looks for obvious attack attempts (prompt injection, malicious payloads) and blocks anything suspicious immediately — before spending a single token or a single API call on it.
2. **A core reasoning agent takes over.** This is the part that actually thinks about your question. It can reach for tools as it needs them: an MCP server (a standard way for an agent to call out to external services), a hybrid search engine that blends keyword and meaning-based retrieval so it can pull real facts instead of guessing, and a semantic memory that remembers relevant things you told it earlier in the conversation. If it's making a lot of calls at once, a rate limiter keeps it from overwhelming anything downstream.
3. **A second agent audits the answer before you see it.** A separate "quality auditor" pass checks the draft response — is it actually grounded in what was retrieved, is it accurate, does it avoid vague filler — and can reject it and ask for a redo if it isn't good enough.
4. **The verified answer streams back in real time.** Once it passes the audit, the response renders token-by-token in the chat UI, the same way ChatGPT's replies appear as they're generated, rather than waiting for the whole answer before showing anything.

The whole point of building it this way is that none of these pieces are decorative — the security gate really blocks bad input before it reaches a model, the audit really can reject a bad draft, and every stage along the way is being traced/logged so you can see exactly what happened for any given message, not just trust that it worked. It's meant to look and feel like a genuine enterprise AI assistant — the kind with retrieval, memory, safety checks, and observability all actually wired together — rather than a single-purpose chatbot demo.

The architecture spans two apps that share one hub:

```
┌────────────────────────────────────────────────────────────────────────┐
│               Enterprise Sovereign Intelligence Hub                    │
├──────────────────────────────────┬─────────────────────────────────────┤
│ apps/ai-engine (Python)          │ apps/web (TypeScript / Next.js)     │
├──────────────────────────────────┼─────────────────────────────────────┤
│ • Pydantic AI Orchestration      │ • Vercel AI SDK Core & SSE Streams  │
│ • FastMCP Security & Tooling     │ • Fastify API & Microservices       │
│ • Hybrid Graph-RAG (Qdrant)      │ • React Dashboard & Live Evaluator  │
│ • Deadlock & Circuit Breakers    │ • Cryptographic Token Auth Scopes   │
└──────────────────────────────────┴─────────────────────────────────────┘
```

The work is organized into four operational layers, each covering a range of Days:

1. **Multi-Agent Orchestration & State Management**
   Supervisor/worker topologies (generator + critic agents), state snapshots and rollback on validation failure, context pruning, and tool-execution ordering to prevent write-after-read hazards.

2. **Resilience, Concurrency & Security**
   Async concurrency limits to avoid quota exhaustion, deadlock detection across agent communication loops, cryptographic tool-permission scopes, and adversarial red-teaming/fuzzing of prompt boundaries.

3. **Data Retrieval, Graph-RAG & Storage**
   Hybrid retrieval combining vector search with relational knowledge-graph triples, cache invalidation and Reciprocal Rank Fusion re-ranking, and tenant-isolated vector sharding.

4. **Integration, Streaming & Self-Correction**
   Real-time token streaming with typed tool execution, dynamic tool discovery/schema synthesis at runtime, and self-healing tool execution that feeds a runtime error back into the model's own retry loop.

## Repository Layout

```
enterprise-sovereign-hub/
├── .github/workflows/ci.yml   # Type-check, lint, build, and (with a secret) real smoke-test runs
├── AGENTS.md                  # Durable knowledge for anyone (human or agent) picking this repo back up
├── .agents/skills/            # Reusable procedures/pitfalls discovered while building this repo
├── apps/
│   ├── ai-engine/             # Python (Pydantic AI, FastMCP, Qdrant, LlamaIndex, LangGraph)
│   │   ├── requirements.txt
│   │   ├── src/
│   │   │   ├── agents/
│   │   │   ├── workflows/
│   │   │   ├── retrieval/
│   │   │   ├── observability/
│   │   │   ├── security/
│   │   │   └── mcp/
│   │   └── tests/
│   └── web/                   # TypeScript (Next.js, Vercel AI SDK, assistant-ui)
│       ├── package.json
│       ├── app/
│       └── src/
│           ├── agents/
│           ├── workflows/
│           ├── retrieval/
│           ├── observability/
│           ├── security/
│           └── mcp/
└── docs/                      # One "Day N" doc per lesson (plus a TS Port doc where a language differs)
```

## Git Strategy: Tag Per Day

`main` stays fully working at every point - each Day's module plugs into the existing hub without breaking what came before. This repository starts from a single snapshot of Days 1-64; from here on every completed Day is tagged (`day-N`, and `day-N-ts` when the TypeScript port lands as a separate commit), so `git checkout day-N` shows the repository exactly as it stood after that Day, and `main` always shows the latest complete state.

```bash
git tag -a day-65 -m "Day 65: <one-line summary>"
git push origin day-65
```

## Progress Matrix

| Day | Topic | Python | TypeScript |
|---|---|---|---|
| 1 | Type-Safe Agent Foundations | ✅ `src/agents/market_analyst.py` | ✅ `src/agents/market-analyst.ts` |
| 2 | Dynamic Dependencies & Tool Calling | ✅ `src/agents/trend_tool_agent.py` | ✅ `src/agents/trend-tool-agent.ts` |
| 3 | Streaming Replies / Live Chat UI | ✅ `src/agents/streaming_chat.py` | ✅ `app/chat/page.tsx` |
| 4 | Grounded RAG (Search-Then-Answer) | ✅ `src/workflows/rag_workflow.py` | ✅ `src/workflows/rag-workflow.ts` |
| 5 | Stateful Agent Graphs (LangGraph) | ✅ `src/graphs/market_graph.py` | ✅ `src/graphs/market-graph.ts` |
| 6 | FastMCP Server Architecture | ✅ `src/mcp/sovereign_mcp_server.py` | ✅ `src/mcp/sovereign-mcp-server.ts` |
| 7 | OpenTelemetry / Langfuse Tracing | ✅ `src/observability/tracer_setup.py` | ✅ `src/observability/tracer-setup.ts` |
| 8 | Async Concurrency & Batch Processing | ✅ `src/utils/async_batch_processor.py` | ✅ `src/utils/async-batch-processor.ts` |
| 9 | Multi-Agent Hand-Off & Verification | ✅ `src/agents/` (worker/auditor) | ✅ `src/agents/` (worker/auditor) |
| 10 | Evaluation-Driven Development | ✅ `tests/test_agent_evaluation.py` (deepeval) | ✅ `tests/agent-evaluation.test.ts` (hand-rolled) |
| 11 | Multi-Model Router & Semantic Cache | ✅ `src/routing/semantic_router.py` | ✅ `src/routing/semantic-router.ts` |
| 12 | Human-in-the-Loop & Durable State | ✅ `src/workflows/durable_approval_agent.py` | ✅ `src/workflows/durable-approval-agent.ts` |
| 13 | Programmatic Output Guardrails | ✅ `src/security/output_guardrails.py` | ✅ `src/security/output-guardrails.ts` |
| 14 | Hybrid Dense + Sparse Retrieval | ✅ `src/retrieval/hybrid_search_engine.py` | ✅ `src/retrieval/hybrid-search-engine.ts` |
| 15 | Agent Swarm Consensus Voting | ✅ `src/agents/swarm_consensus.py` | ✅ `src/agents/swarm-consensus.ts` |
| 16 | Local Model Inference (Ollama) | ✅ `src/agents/local_inference_agent.py` | ✅ `src/agents/local-inference-agent.ts` |
| 17 | Logfire / OTel Distributed Tracing | ✅ `src/observability/logfire_tracer.py` | ✅ `src/observability/logfire-tracer.ts` |
| 19 | LLM-as-a-Judge Benchmarking | ✅ `src/evals/agent_evaluator.py` | ✅ `src/evals/agent-evaluator.ts` |
| 20 | AI Red Teaming & Attack Interception | ✅ `src/security/red_team_interceptor.py` | ✅ `src/security/red-team-interceptor.ts` |
| 22 | Context Caching & Prompt Compression | ✅ `src/optimization/context_caching.py` | ✅ `src/optimization/context-caching.ts` |
| 24 | Docker & Compose Containerization | ✅ `Dockerfile`, `src/main.py` (FastAPI) | n/a (infra day) |
| 25 | CI/CD Regression Eval Gates | ✅ `tests/test_ci_eval_gates.py` (DeepEval) | ✅ `src/evals/ci-eval-gate.ts` (hand-rolled - see Day 25 doc for why) |
| 26 | Playwright E2E Verification | n/a | ✅ `tests/e2e/chat-stream.spec.ts` |
| 27 | Sandboxed Code-Execution Retry Loop | ✅ `src/agents/self_healing_agent.py` | ✅ (see the Day 27 doc) |
| 28-33 | MCP resources, dynamic tool synthesis, entity-graph memory, and more | ✅ | ✅ |
| 34-45 | Circuit breakers, pub/sub state sync, model cascades, multimodal vision, HITL approval, red-teaming, schema evolution, semantic guardrails, federated arbitration | ✅ | ✅ |
| 46 | Distributed Deadlock Detection & Circuit Breaking | ✅ `src/resilience/agent_deadlock_breaker.py` | ✅ `src/resilience/agent-deadlock-breaker.ts` |
| 47 | Self-Healing Dynamic Tool Correction | ✅ `src/agents/self_healing_tool_agent.py` | ✅ `src/agents/self-healing-tool-agent.ts` |
| 48 | Dynamic Tool Schema Introspection & MCP Synthesis | ✅ `src/mcp/dynamic_tool_synthesizer.py` | ✅ `src/mcp/dynamic-tool-synthesizer.ts` |
| 49 | Dynamic Vector Cache Invalidation with RRF | ✅ `src/retrieval/cache_invalidator.py` | ✅ `src/retrieval/cache-invalidator.ts` |
| 50 | Dynamic Agent Tool Fallback & Secondary Routing | ✅ `src/resilience/tool_fallback_router.py` | ✅ `src/resilience/tool-fallback-router.ts` |
| 51 | Graph-Augmented Vector Retrieval (Hybrid Graph-RAG) | ✅ `src/retrieval/graph_rag_retriever.py` | ✅ `src/retrieval/graph-rag-retriever.ts` |
| 52 | Cryptographic Tool Permission Scoping | ✅ `src/security/permission_scoped_agent.py` | ✅ `src/security/permission-scoped-agent.ts` |
| 53 | Resilient Streaming Agent Responses | n/a (TS-only) | ✅ `src/streaming/streaming-tool-engine.ts` |
| 54 | Distributed Vector Sharding & Tenant Isolation | ✅ `src/retrieval/tenant_sharded_retriever.py` | ✅ `src/retrieval/tenant-sharded-retriever.ts` |
| 55 | Deterministic Hash-Based Review-Queue Sampling | ✅ `src/observability/review_queue_sampler.py` | ✅ `src/observability/review-queue-sampler.ts` |
| 56 | Last-Approved Baseline Promotion for Eval Gates | ✅ `src/evals/baseline_promotion.py` | ✅ `src/evals/baseline-promotion.ts` |
| 57 | Consecutive-Pass Promotion Windows for Eval Gates | ✅ `src/evals/consecutive_pass_promotion.py` | ✅ `src/evals/consecutive-pass-promotion.ts` |
| 58 | Model Retry Guard with Failure Classification | ✅ `src/agents/model_retry_guard.py` | ✅ `src/agents/model-retry-guard.ts` |
| 59 | Stateful Evaluator Graph | ✅ `src/agents/stateful_evaluator_graph.py` | ✅ `src/agents/stateful-evaluator-graph.ts` |
| 60 | Human-in-the-Loop Gate for High-Risk Actions | ✅ `src/agents/human_in_the_loop_gate.py` | ✅ `src/agents/human-in-the-loop-gate.ts` |
| 61 | Idempotent Approval Execution Ledger | ✅ `src/agents/approval_execution_ledger.py` | ✅ `src/agents/approval-execution-ledger.ts` |
| 62 | Request-Scoped Degradation Visibility | ✅ `src/agents/degradation_visibility.py` | ✅ `src/agents/degradation-visibility.ts` |
| 63 | Bounded Agent Loop Budget & Step Authority | ✅ `src/agents/agent_loop_budget.py` | ✅ `src/agents/agent-loop-budget.ts` |
| 64 | Jev-Style Decision Layer for Agent Routing | ✅ `src/agents/jev_paradigm_eval.py` | ✅ `src/agents/jev-paradigm-eval.ts` |

**All 64 day docs complete in-repo.** Every ✅ above has a matching `docs/Day N: <title>.md` (and a `docs/Day N (TS Port): <title>.md` where the TypeScript side needed a different approach worth documenting on its own, or where a genuine cross-language difference was found). Days 55-64 were independently designed to extend the observability and eval-methodology track with capstone patterns.

## CI/CD

Two independent, secret-gated GitHub Actions workflows check the repository. They are started by hand from the Actions tab for now, to avoid model spend on every commit; their push/PR triggers can be switched back on:

- `.github/workflows/ci.yml` - type-check, lint, build, and (with `OPENAI_API_KEY` set) real smoke-test runs.
- `.github/workflows/ai-eval-gate.yml` - the Day 25 regression gate, in both languages: a fixed benchmark dataset scored by an LLM-as-a-judge metric, blocking the merge if answer quality drops below threshold.

A fresh clone without the `OPENAI_API_KEY` secret configured skips the AI-dependent steps cleanly instead of failing.

## End-to-End Testing

`apps/web/tests/e2e/chat-stream.spec.ts` (Playwright) drives the real chat UI in a headless browser: loads `/chat`, types a prompt into the actual composer, clicks send, and asserts a real streamed reply renders. Run it locally with the dev server running:

```bash
cd apps/web
npm run dev &
npm run test:e2e
```

## Setup

Python app:

```bash
cd apps/ai-engine
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

TypeScript app:

```bash
cd apps/web
npm install --legacy-peer-deps
cp .env.example .env
```

