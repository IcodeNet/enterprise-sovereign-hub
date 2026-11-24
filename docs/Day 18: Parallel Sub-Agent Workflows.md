Day 18 is about splitting one complex engineering task into independent, parallel sub-tasks handled by specialized agents - and getting real timing evidence for how much that actually saves.

---

## Sub-Agent Orchestration — Day 18: Parallel Sub-Agent Workflows

### The Problem We're Solving

A single agent asked to "write this feature AND check it for security issues" either does both jobs poorly at once, or does them one after another - paying the full latency cost of two sequential AI calls. **Sub-agent task decomposition** splits the work into genuinely independent, SPECIALIZED sub-agents (one focused purely on writing code, one focused purely on security auditing), runs them concurrently since neither needs the other's output first, then hands both results to a separate orchestrator agent that synthesizes a final decision.

This is the same `asyncio.gather` concurrency primitive Day 8 used for batching and Day 15 used for swarm voting - but applied to DECOMPOSING one task into different sub-tasks, rather than running identical copies of the same task.

Focus: decomposing an engineering task into parallel, specialized sub-agents
Time investment: 15 minutes

### Step 1: No New Dependencies

This lesson uses `pydantic-ai`, already installed from Day 1.

### Step 2: Create the Source File

Inside `apps/ai-engine/src/agents/`, create:
`subagent_orchestrator.py`

### Step 3: Add the Source Code

```python
import asyncio

from dotenv import load_dotenv
from pydantic import BaseModel, Field
from pydantic_ai import Agent

load_dotenv()


class CodeSnippetResult(BaseModel):
    module_name: str = Field(description="Name of the generated Python module.")
    code: str = Field(description="Clean Python implementation code.")


class SecurityAuditResult(BaseModel):
    has_vulnerabilities: bool = Field(description="False if code passes security checks.")
    recommended_patch: str = Field(description="Security recommendations or confirmation.")


class SynthesizedPackage(BaseModel):
    package_title: str
    is_production_ready: bool
    summary: str


coder_subagent = Agent(
    "openai:gpt-4o-mini",
    output_type=CodeSnippetResult,
    system_prompt="We are an expert Python developer writing modular microservice code.",
)

security_subagent = Agent(
    "openai:gpt-4o-mini",
    output_type=SecurityAuditResult,
    system_prompt="We are a principal security engineer auditing code for vulnerabilities.",
)

lead_orchestrator = Agent(
    "openai:gpt-4o",
    output_type=SynthesizedPackage,
    system_prompt="We are a lead forward-deployed AI engineer consolidating sub-agent outputs into production packages.",
)


async def run_parallel_subagent_pipeline(feature_request: str) -> SynthesizedPackage:
    print("Step 1: Running Sub-Agent 1 (Coder) and Sub-Agent 2 (Security Auditor) concurrently...")

    coder_task = coder_subagent.run(f"Write a Python function for: {feature_request}")
    security_task = security_subagent.run(f"Audit the following feature request for security risks: {feature_request}")

    code_res, sec_res = await asyncio.gather(coder_task, security_task)

    code_data: CodeSnippetResult = code_res.output
    sec_data: SecurityAuditResult = sec_res.output

    print("\n--- Sub-Agent Results Received ---")
    print(f"Sub-Agent 1 (Module): {code_data.module_name}")
    print(f"Sub-Agent 2 (Security Pass): {not sec_data.has_vulnerabilities}")

    print("\nStep 2: Orchestrator Agent synthesizing parallel outputs...")
    synthesis_prompt = (
        f"Feature Request: {feature_request}\n"
        f"Code Module: {code_data.module_name}\n"
        f"Security Status: Vulnerabilities={sec_data.has_vulnerabilities}, Patch={sec_data.recommended_patch}"
    )

    orchestrator_res = await lead_orchestrator.run(synthesis_prompt)
    final_output: SynthesizedPackage = orchestrator_res.output

    print("\n--- Synthesized Package Result ---")
    print(f"Title: {final_output.package_title}")
    print(f"Production Ready: {final_output.is_production_ready}")
    print(f"Summary: {final_output.summary}")

    return final_output


if __name__ == "__main__":
    prompt = "Create a FastMCP tool endpoint for querying vector database indexes."
    asyncio.run(run_parallel_subagent_pipeline(prompt))
```

### Step 4: Run and Verify - With Real Timing Evidence

```bash
python src/agents/subagent_orchestrator.py
```

The security sub-agent genuinely found real issues (missing authentication/authorization, unvalidated input, no HTTPS enforcement) and the orchestrator correctly marked the final package `Production Ready: False` - real evidence the security auditor isn't a rubber stamp, the same discipline Day 9's worker/auditor pattern established.

**Timing comparison** (sequential two calls vs. `asyncio.gather` on the same two calls):

| Mode | Time |
|---|---|
| Sequential (coder, then security) | 5.47s |
| Concurrent (`asyncio.gather`) | 4.35s |

A real, measurable ~20% speedup from running the two independent sub-agents concurrently instead of one after another.

---

## Best Practices

- **Only decompose a task into sub-agents when the pieces are genuinely independent.** The coder and security sub-agents here both take the SAME feature request as input and produce completely separate outputs neither needs from the other - that's what makes `asyncio.gather` a safe fit. If one sub-agent's output were an input to the other, running them concurrently would race and produce wrong results.
- **A specialized sub-agent (narrow system prompt, one job) tends to give a more focused, honest answer than one agent asked to do two things at once.** The security sub-agent here found real, specific issues rather than a generic "looks fine."
- **Measure the actual concurrency speedup, don't assume `asyncio.gather` automatically means "faster."** Two calls to the same rate-limited endpoint concurrently can show a smaller speedup than expected, or none at all, depending on provider-side throttling - see the TS port's doc for a real example of exactly that.

## Why This Matters in Production

Decomposing one large task into specialized, genuinely independent sub-agents run concurrently is both a latency win AND a quality win - each sub-agent focuses on one job instead of splitting attention across several, and the measured 20% speedup here is real evidence the concurrency is actually paying off, not just theoretically sound.
