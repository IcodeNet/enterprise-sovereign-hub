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


# Two independent, cheaper sub-agents run CONCURRENTLY on the SAME feature
# request but from different angles - one writes code, one audits security
# risk - the same asyncio.gather concurrency tool as Day 8's batching and
# Day 15's swarm voting, applied here to task DECOMPOSITION rather than
# running identical copies of one task.
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

# A stronger model whose only job is to read BOTH sub-agents' independent
# outputs and synthesize one final decision - the same worker/orchestrator
# role split used throughout this repo (Day 9's auditor, Day 15's tally
# agent), applied here to combining two DIFFERENT kinds of sub-task output
# rather than tallying votes on one shared question.
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
