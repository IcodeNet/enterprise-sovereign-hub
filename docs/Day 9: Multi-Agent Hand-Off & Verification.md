Day 9 is about not trusting a single AI call to grade its own work - splitting "do the work" and "check the work" into two genuinely separate agents.

---

## Multi-Agent Systems — Day 9: Multi-Agent Hand-Off & Verification

### The Problem We're Solving

If one AI call both writes a piece of code AND judges whether that code is good, its judgement is compromised from the start - whatever mistake it made while writing is invisible to it while reviewing, because it's the same reasoning that produced the mistake in the first place. This is a single point of failure: one run, no second opinion.

The fix is a genuine hand-off between two separate roles:
- **Worker Agent**: generates the actual solution.
- **Auditor Agent**: reviews that solution as a completely separate AI call - a fresh context, a different system prompt, no memory of how confident the Worker felt about its own answer.

This isn't the same as Day 5's branching graph (which picks ONE path based on data) - here, both agents always run, in a fixed sequence, but the second one's whole job is to genuinely evaluate the first one's real output, not just repeat or rubber-stamp it.

Focus: a two-agent hand-off where the second agent can genuinely reject the first agent's work
Time investment: 15 minutes

### Step 1: No New Dependencies

This lesson uses `pydantic-ai`, already installed from Day 1.

### Step 2: Create the Source File

Inside `apps/ai-engine/src/agents/`, create:
`multi_agent_consensus.py`

### Step 3: Add the Source Code

```python
import asyncio

from dotenv import load_dotenv
from pydantic import BaseModel, Field
from pydantic_ai import Agent

load_dotenv()


class ArchitectureDraft(BaseModel):
    title: str = Field(description="Name of the proposed system subsystem.")
    tech_stack: list[str] = Field(description="Primary tools used in the build.")
    implementation_code: str = Field(description="Sample implementation snippet.")


class AuditReport(BaseModel):
    is_approved: bool = Field(description="True if the code meets enterprise standards.")
    security_score: int = Field(description="Score from 1 to 10 evaluating safety.")
    required_edits: str | None = Field(default=None, description="Feedback if approval is denied.")


worker_agent = Agent(
    "openai:gpt-4o",
    output_type=ArchitectureDraft,
    system_prompt="We are a senior AI software engineer drafting system architectures.",
)

auditor_agent = Agent(
    "openai:gpt-4o",
    output_type=AuditReport,
    system_prompt="We are a principal security architect reviewing agent code outputs for safety.",
)


async def generate_and_verify(user_requirement: str) -> dict:
    print("Step 1: Worker Agent generating architectural draft...")
    draft_result = await worker_agent.run(user_requirement)
    draft_data: ArchitectureDraft = draft_result.output

    print("Step 2: Passing draft to Auditor Agent for verification...")
    audit_input = (
        f"Subsystem Title: {draft_data.title}\n"
        f"Stack: {draft_data.tech_stack}\n"
        f"Code:\n{draft_data.implementation_code}"
    )

    audit_result = await auditor_agent.run(audit_input)
    audit_data: AuditReport = audit_result.output

    print("\n--- Consensus Pipeline Results ---")
    print(f"System: {draft_data.title}")
    print(f"Audit Approval Status: {'APPROVED' if audit_data.is_approved else 'REJECTED'}")
    print(f"Security Rating: {audit_data.security_score}/10")

    if not audit_data.is_approved:
        print(f"Feedback Required: {audit_data.required_edits}")

    return {"draft": draft_data.model_dump(), "audit": audit_data.model_dump()}


if __name__ == "__main__":
    prompt = "Create a type-safe streaming route using Pydantic AI and async Python."
    asyncio.run(generate_and_verify(prompt))
```

### Step 4: Run and Verify

```bash
python src/agents/multi_agent_consensus.py
```

Real evidence this pattern works isn't "it printed an approval" - a system that always approves proves nothing about whether the auditor is actually checking anything. Running this for real produced a genuine **REJECTED** verdict with a security score of 5/10, and specific, concrete feedback: missing input validation on the draft's WebSocket data, unbounded task creation risk, an overly broad exception catch-all, and `print` statements instead of real logging. That's real evidence of a second opinion that actually disagreed - not just two agents that always agree with each other.

---

## Best Practices

- **A verification step that never rejects anything isn't verification - it's decoration.** If you run this lesson and always get "APPROVED" no matter what, that's a sign the auditor's prompt or schema isn't actually engaging critically with the draft, not a sign the draft is genuinely flawless every time.
- **Give the Auditor ONLY the Worker's final output, not the Worker's reasoning or confidence.** The auditor call above receives just the title, stack, and code - exactly what a real second human reviewer would see, with no insight into how the first agent felt about its own answer, which is what keeps the review honest.
- **Use a genuinely different schema for the Auditor's output than the Worker's.** `AuditReport` isn't a variant of `ArchitectureDraft` - it's a judgement about a draft, with fields (`is_approved`, `security_score`) that only make sense in that role. Reusing the same schema for both would blur what each agent is actually supposed to be doing.

## Why This Matters in Production

Any AI-generated architecture, code snippet, or analysis that matters enough to act on shouldn't rely on a single model run's own self-assessment. A genuine Worker/Auditor split - proven here to actually catch real issues, not just approve everything - is the foundation for any pipeline where we need a second opinion we can actually trust, including Day 5's routing (send REJECTED items to a human review branch) and Day 10's automated quality gates.
