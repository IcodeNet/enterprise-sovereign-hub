import asyncio

from dotenv import load_dotenv
from pydantic import BaseModel, Field, field_validator
from pydantic_ai import Agent, ModelRetry

load_dotenv()


class GuardrailBlocked(Exception):
    """Raised when a genuine security policy violation is detected in the AI's own output.

    Kept as its own exception type (not a bare ValueError) so the pipeline
    can tell "the AI said something it shouldn't have" apart from a genuine
    infrastructure failure (a network error, a missing API key). Collapsing
    both into a generic except-and-fallback would make a broken deployment
    and a real security catch look identical - exactly the harness-failure
    trap an eval harness can fall into.
    """


class SecuritySanitizedOutput(BaseModel):
    analysis_title: str = Field(description="Name of the analysis report.")
    summary_text: str = Field(description="Executive technical summary.")
    contains_pii: bool = Field(default=False, description="Flag indicating if sensitive data was scrubbed.")

    # A Pydantic field_validator acting as a LOCAL guardrail: this check runs
    # the instant the AI's output is parsed into this model, before any
    # downstream code ever sees the value. Raising here is what makes a
    # forbidden token in the output an outright validation failure, not
    # something a caller has to remember to check for separately.
    @field_validator("summary_text")
    @classmethod
    def check_for_forbidden_keywords(cls, value: str) -> str:
        forbidden = ["confidential_secret_key", "password", "private_api_token"]
        for word in forbidden:
            if word in value.lower():
                raise ValueError(f"SECURITY GUARDRAIL TRIGGERED: Forbidden token '{word}' detected in agent output!")
        return value


guarded_agent = Agent(
    "openai:gpt-4o",
    output_type=SecuritySanitizedOutput,
    system_prompt=(
        "We are an enterprise AI security agent. "
        "Summarize technical findings cleanly. Never include raw API keys, passwords, or personal credentials."
    ),
)


# When the guardrail's field_validator raises inside pydantic-ai's own
# retry loop, it surfaces here as a ModelRetry-wrapped validation error if
# retries are exhausted, or a genuine ValidationError. Distinguishing THAT
# from a plain network/API failure (a real ConnectionError, a missing key)
# is the entire point of this lesson: one is a security policy working
# exactly as intended, the other is our own deployment being broken.
async def run_guarded_pipeline(prompt_text: str) -> SecuritySanitizedOutput:
    print("Executing agent query through security guardrail layer...")

    try:
        result = await guarded_agent.run(prompt_text)
        validated_data: SecuritySanitizedOutput = result.output

        print("\n--- Guardrail Verification Passed ---")
        print(f"Title: {validated_data.analysis_title}")
        print(f"Summary: {validated_data.summary_text}")
        print(f"PII Status: Scrubbed ({validated_data.contains_pii})")
        return validated_data

    except (ValueError, ModelRetry) as security_error:
        # A genuine guardrail catch: the AI actually produced forbidden
        # content, and our validator correctly blocked it. This IS the
        # guardrail doing its job - the fallback below is the deliberate,
        # safe response, not an error we failed to handle.
        print(f"\n[GUARDRAIL INTERCEPTED - SECURITY BLOCK]: {security_error}")
        return SecuritySanitizedOutput(
            analysis_title="SECURITY_BLOCK",
            summary_text="Output blocked due to security validation policy violation.",
            contains_pii=True,
        )

    except Exception as infra_error:
        # A DIFFERENT kind of failure: something broke in our own plumbing
        # (network, auth, an unexpected exception type the guardrail never
        # anticipated). Re-raising here - rather than returning the SAME
        # SECURITY_BLOCK fallback - is what keeps a genuine outage from
        # silently looking identical to a working security control in logs
        # and dashboards. A caller that gets a SECURITY_BLOCK result should
        # be able to trust it means "the guardrail caught something," not
        # "something upstream was down."
        print(f"\n[INFRASTRUCTURE FAILURE - NOT A GUARDRAIL CATCH]: {infra_error}")
        raise


async def main():
    print("=== Test 1: Real AI call with a clean prompt (expected to pass) ===")
    clean_prompt = "Provide a summary of our system setup. Do not output secret credentials."
    await run_guarded_pipeline(clean_prompt)

    print("\n=== Test 2: Direct validator test - forcing a forbidden token past the guardrail ===")
    # Rather than trying to social-engineer the live model into leaking a
    # forbidden token (which a well-behaved model may simply refuse to do,
    # proving nothing about whether OUR validator actually works), this
    # test constructs the output object directly with a known-bad value -
    # isolating and proving the guardrail's OWN catch logic independent of
    # whether we can successfully trick the AI into triggering it for real.
    try:
        SecuritySanitizedOutput(
            analysis_title="Forced Test",
            summary_text="Configuration note: the private_api_token is abc123.",
            contains_pii=False,
        )
        print("[NO GUARDRAIL TRIGGERED - this would be a bug]")
    except ValueError as security_error:
        print(f"[GUARDRAIL INTERCEPTED - SECURITY BLOCK]: {security_error}")


if __name__ == "__main__":
    asyncio.run(main())
