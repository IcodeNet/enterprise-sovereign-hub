import asyncio

from dotenv import load_dotenv
from pydantic import BaseModel, Field
from pydantic_ai import Agent

load_dotenv()


# What the Worker Agent produces: a proposed subsystem design.
class ArchitectureDraft(BaseModel):
    title: str = Field(description="Name of the proposed system subsystem.")
    tech_stack: list[str] = Field(description="Primary tools used in the build.")
    implementation_code: str = Field(description="Sample implementation snippet.")


# What the Auditor Agent produces: a pass/fail judgement on the Worker's
# draft, plus feedback if it's rejected. This is a genuinely different
# schema from ArchitectureDraft - the auditor isn't writing more code, it's
# grading the code that already exists.
class AuditReport(BaseModel):
    is_approved: bool = Field(description="True if the code meets enterprise standards.")
    security_score: int = Field(description="Score from 1 to 10 evaluating safety.")
    required_edits: str | None = Field(default=None, description="Feedback if approval is denied.")


# Two agents, two separate roles, two separate system prompts. Splitting
# "generate the work" and "judge the work" into different agents (instead
# of asking one agent to do both) removes a single point of failure: an
# agent that made a mistake while generating something is not a reliable
# judge of whether that same mistake is actually fine.
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


# Runs the two-step hand-off: the Worker drafts a solution, then the
# Auditor reviews that SAME draft as a completely separate AI call, with
# no visibility into how confident the Worker felt about its own answer -
# only the actual output, exactly as a real second reviewer would see it.
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

    return {
        "draft": draft_data.model_dump(),
        "audit": audit_data.model_dump(),
    }


if __name__ == "__main__":
    prompt = "Create a type-safe streaming route using Pydantic AI and async Python."
    asyncio.run(generate_and_verify(prompt))
