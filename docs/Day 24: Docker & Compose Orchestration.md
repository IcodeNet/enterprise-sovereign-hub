Day 24 is about packaging the Python AI engine as a real, buildable Docker service - including a genuine misdiagnosis (blaming the wrong security tool for an hour) that a fresh model's perspective actually cracked.

---

## Containerization — Day 24: Docker & Compose Orchestration

### The Problem We're Solving

Running the AI engine, a FastMCP server, and Qdrant each in their own terminal window doesn't reproduce on a different machine and gives no isolation between services. **Docker Compose** packages each service into its own container, connected over an internal bridge network, so the whole stack can start with one command.

This lesson also exposes the Python AI engine as a real HTTP microservice for the first time - every earlier day's agent ran as a standalone script; this one wraps an agent in **FastAPI** so a containerized frontend (or any other service) can call it over the network.

Focus: containerizing the Python AI engine into a buildable Docker image - and a real misdiagnosis that cost significant time until a fresh model's perspective found the actual cause
Time investment: 20 minutes for the application code; the container build's SSL issue took roughly an hour of solo debugging (wrong theory) plus a delegated re-diagnosis to actually resolve

### Step 1: Install FastAPI & Uvicorn, Create the Service Entrypoint

```bash
pip install fastapi uvicorn
```

Inside `apps/ai-engine/src/`, create `main.py`:

```python
from dotenv import load_dotenv
from fastapi import FastAPI
from pydantic import BaseModel
from pydantic_ai import Agent

load_dotenv()

app = FastAPI(title="Sovereign Intelligence Hub API")


class AgentQueryRequest(BaseModel):
    prompt: str


class AgentQueryResponse(BaseModel):
    status: str
    result: str


fastapi_agent = Agent("openai:gpt-4o-mini", system_prompt="We are an enterprise AI microservice.")


@app.get("/health")
def health_check() -> dict:
    return {"status": "HEALTHY", "service": "ai-engine"}


@app.post("/api/v1/agent/run", response_model=AgentQueryResponse)
async def run_agent(payload: AgentQueryRequest) -> AgentQueryResponse:
    res = await fastapi_agent.run(payload.prompt)
    return AgentQueryResponse(status="SUCCESS", result=str(res.output))
```

### Step 2: Verify the Application Code Directly - Before Touching Docker

```bash
uvicorn src.main:app --host 0.0.0.0 --port 8010
curl http://localhost:8010/health
curl -X POST http://localhost:8010/api/v1/agent/run -H "Content-Type: application/json" -d '{"prompt":"say hi in 3 words"}'
```

Real results: `{"status":"HEALTHY","service":"ai-engine"}` and `{"status":"SUCCESS","result":"Hello there, friend!"}` - both endpoints genuinely working, proving the APPLICATION CODE is correct before Docker enters the picture at all.

### Step 3: Create the Dockerfile and docker-compose.yml

```dockerfile
# Stage 1: Build & Dependencies
FROM python:3.12-slim AS builder

WORKDIR /app

# Some networks inspect TLS traffic: a proxy on the machine or the network
# re-signs every certificate. The container has its own certificate store,
# separate from the host's, so that proxy's root CA must be trusted here too:
# put it in certs/ as a .crt file (empty in the repo; see certs/README.md).
COPY certs/ /usr/local/share/ca-certificates/extra/
RUN update-ca-certificates

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# Stage 2: Runtime Minimal Image
FROM python:3.12-slim AS runner

WORKDIR /app

COPY --from=builder /root/.local /root/.local
ENV PATH=/root/.local/bin:$PATH
ENV PYTHONUNBUFFERED=1

COPY src/ ./src/

EXPOSE 8000

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

```yaml
version: "3.8"
services:
  qdrant:
    image: qdrant/qdrant:latest
    container_name: sovereign-qdrant
    ports: ["6333:6333", "6334:6334"]
    volumes: ["qdrant_storage:/qdrant/storage"]
    networks: [sovereign-net]
  ai-engine:
    build: { context: ./apps/ai-engine, dockerfile: Dockerfile }
    container_name: sovereign-ai-engine
    ports: ["8000:8000"]
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - QDRANT_HOST=qdrant
      - QDRANT_PORT=6333
    depends_on: [qdrant]
    networks: [sovereign-net]
networks:
  sovereign-net: { driver: bridge }
volumes:
  qdrant_storage:
```

### Step 4: The Real Finding - a Confidently Wrong Theory, and What Actually Fixed It

`docker compose up --build -d` first failed at the `pip install -r requirements.txt` step with `SSLError(SSLCertVerificationError(1, '[SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed: self-signed certificate in certificate chain'))` reaching PyPI. The immediate, reasonable-seeming assumption: this is the SAME network proxy's SSL interception this repo already documented for the host machine in Day 1.

That assumption was WRONG, and four different attempts to fix it AS that proxy's problem all failed identically:

1. Adding that proxy's root+intermediate CA certs into the container and running `update-ca-certificates`.
2. Copying the EXACT CA bundle already proven working on the host into the container.
3. Testing with `docker run --network=host` to rule out Docker's bridge network.
4. Confirming a plain `curl -v https://pypi.org` succeeds cleanly from an uncustomized container - proving the interception is specific to PyPI's traffic, not a blanket HTTPS block.

**The actual root cause, found by delegating the investigation to a fresh model rather than continuing to iterate solo**: it was never the network proxy. The real interceptor was a second tool: an **endpoint security agent** on the Windows side, running its own TLS-inspecting proxy specifically on package-manager traffic. This was confirmed decisively by directly inspecting the certificate chain served for `pypi.org` from inside the container: its issuer was that agent's own self-signed root, completely unrelated to the network proxy's. The agent already writes the exact CA certificate needed to a file on the Windows host.

The fix, once the correct root cause was identified, was simple: copy THAT specific certificate into the build stage and trust it - no network-proxy certs, no env var overrides, no `--network=host` workaround needed at all. The certificate is unique to the machine, so it is not kept in the repo: it goes in `apps/ai-engine/certs/`, which git ignores.

```bash
export OPENAI_API_KEY=<your key>
docker compose up --build -d
docker compose ps
curl http://localhost:8000/health
```

Real, final evidence: `docker compose ps` shows both `sovereign-ai-engine` and `sovereign-qdrant` `Up`; `curl http://localhost:8000/health` returns a genuine `200 OK` with `{"status":"HEALTHY","service":"ai-engine"}` - from inside the actual running container, built from a completely fresh, no-cache image with all 230+ pinned dependencies installed successfully.

### Step 5: A Second Real, Ongoing Fragility - Exact-Pinned Freezes Go Stale on Their Own

Re-verified again in a later session: the SSL/CA fix above still held, but the SAME build now failed on an UNRELATED problem - `ERROR: No matching distribution found for boto3==1.43.104`. This is not a network/proxy issue at all: `requirements.txt` is a full `pip freeze` (230 exact-pinned lines, most of them transitive dependencies never imported directly, like `boto3` here - pulled in only because some other package, e.g. an observability library, depends on it). Fast-moving packages like `boto3` publish new patch releases almost daily; a version pinned exact at freeze-time can fall out of whatever the live PyPI index actually serves within days, with no code change on this repo's side at all.

Confirmed genuinely NOT transient: retried the identical build twice, both times failing on the identical package/version. This is a real, structural fragility of committing a full exact-pinned freeze rather than a short list of direct dependencies with loose bounds - documented honestly here rather than pin-chased indefinitely (per this repo's own time-boxing rule), since fixing THIS one pin only pushes the same failure to the next fast-moving transitive dependency that happens to release between one build and the next.

---

## Best Practices

- **A plausible-sounding root cause (the last SSL issue we hit, so it's probably the same one) is not a verified one.** The network proxy was a reasonable first guess, but four failed fix attempts against that theory should have triggered checking the actual certificate issuer far earlier than it did.
- **When debugging a certificate error, inspect the ACTUAL certificate chain being served, don't assume which proxy is intercepting it.** `openssl x509 -noout -issuer` or a verbose `curl` immediately reveals the true issuer name - this single check would have shortcut the whole misdiagnosis.
- **Time-box infrastructure blockers and delegate to a fresh model rather than repeating variations of the same wrong theory.** This exact experience is why this repo's own `.agents/skills/portfolio-day-lesson-authoring.md` now has a hard 2-attempt time-box rule - a fresh model, unattached to the first (wrong) theory, found the real answer directly by inspecting the certificate issuer rather than continuing to fix the network proxy.
- **Verify the application code works OUTSIDE a container before ever building one.** This step correctly isolated the failure to the container/network layer, not the FastAPI service itself, before any of the certificate debugging began.
- **A full `pip freeze`/exact-pinned requirements.txt is a genuine, structural fragility for a Docker build, not just a one-time annoyance.** Every fast-moving transitive dependency (packages the code never imports directly) is another chance for the build to break on its own, with zero code changes, purely because time passed. A build that worked yesterday is not guaranteed to work today from the same lockfile against a live package index.

## Why This Matters in Production

An hour was lost fixing the WRONG problem, confidently, because the first theory (the network proxy, since that's the one this repo had seen before) was never actually verified against the real evidence (the certificate's own issuer field) until a fresh model looked at it without that assumption already baked in. The lesson isn't "always check the cert issuer" in isolation - it's that a repeated, identically-failing fix attempt is itself the signal to stop trusting the current theory and check a more fundamental assumption, ideally by getting a second, unbiased perspective rather than continuing to dig in the same wrong direction.
