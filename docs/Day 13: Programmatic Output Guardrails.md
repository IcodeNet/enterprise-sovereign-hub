Day 13 is about catching a genuine safety violation in an AI's output before it goes anywhere - and being disciplined about not confusing "the guardrail caught something" with "our own infrastructure broke."

---

## Guardrails — Day 13: Programmatic Output Guardrails

### The Problem We're Solving

Pydantic AI (Day 1) guarantees an output has the right SHAPE - the right fields, the right types. It says nothing about the right CONTENT. An AI could return a perfectly valid `SecuritySanitizedOutput` object that happens to contain a literal password or API token in its summary text, and Day 1's schema validation alone would wave it straight through.

A **guardrail** is a check that runs on top of shape validation, enforcing a business or safety rule the type system itself can't express - "this field must never contain one of these forbidden words," in this lesson's case. Pydantic's `field_validator` is one real way to implement this: it runs the instant the AI's output is parsed into the model, before any other code touches it.

But there's a second, equally important discipline this lesson builds in from the start: **a genuine security catch and a plain infrastructure failure must never look the same in your error handling.** If your guardrail's `except` block catches everything indiscriminately and always returns the same "SECURITY_BLOCK" fallback, a broken network connection or an expired API key would report itself as a successful security catch - hiding a real outage behind what looks like your safety system working correctly.

Focus: a Pydantic-level content guardrail, with error handling that distinguishes a real security catch from an infrastructure failure
Time investment: 15 minutes

### Step 1: No New Dependencies

This lesson uses `pydantic-ai`, already installed from Day 1. (An earlier lesson draft referenced a separate `guardrails-ai` package, but the actual enforcement logic only needs a plain Pydantic `field_validator` - adding a whole extra library for this would be unnecessary weight for what a few lines of validation code already do, and installing it in practice pulled in real version conflicts with `deepeval` and `logfire`, already installed from Days 7 and 10.)

### Step 2: Create the Source File

Inside `apps/ai-engine/src/security/`, create:
`output_guardrails.py`

### Step 3: Add the Source Code

```python
import asyncio

from dotenv import load_dotenv
from pydantic import BaseModel, Field, field_validator
from pydantic_ai import Agent, ModelRetry

load_dotenv()


class GuardrailBlocked(Exception):
    """Raised when a genuine security policy violation is detected in the AI's own output."""


class SecuritySanitizedOutput(BaseModel):
    analysis_title: str = Field(description="Name of the analysis report.")
    summary_text: str = Field(description="Executive technical summary.")
    contains_pii: bool = Field(default=False, description="Flag indicating if sensitive data was scrubbed.")

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
        # A genuine guardrail catch: the fallback below IS the guardrail
        # doing its job, not an error we failed to handle.
        print(f"\n[GUARDRAIL INTERCEPTED - SECURITY BLOCK]: {security_error}")
        return SecuritySanitizedOutput(
            analysis_title="SECURITY_BLOCK",
            summary_text="Output blocked due to security validation policy violation.",
            contains_pii=True,
        )

    except Exception as infra_error:
        # A DIFFERENT kind of failure. Re-raising - rather than returning
        # the SAME SECURITY_BLOCK fallback - keeps a genuine outage from
        # silently looking identical to a working security control.
        print(f"\n[INFRASTRUCTURE FAILURE - NOT A GUARDRAIL CATCH]: {infra_error}")
        raise


async def main():
    print("=== Test 1: Real AI call with a clean prompt (expected to pass) ===")
    clean_prompt = "Provide a summary of our system setup. Do not output secret credentials."
    await run_guarded_pipeline(clean_prompt)

    print("\n=== Test 2: Direct validator test - forcing a forbidden token past the guardrail ===")
    # Rather than trying to social-engineer the live model into leaking a
    # forbidden token (which a well-behaved model may simply refuse to do,
    # proving nothing about our validator), this test constructs the
    # output object directly with a known-bad value.
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
```

### Step 4: Run and Verify With Real Evidence of Both Branches

```bash
python src/security/output_guardrails.py
```

A real run proved both paths, not just the happy one: Test 1's clean prompt produced a genuine passing summary with no forbidden content. Test 2 directly proved the validator's OWN catch logic works - constructing an object with `"the private_api_token is abc123"` in its summary and confirming Pydantic raised the exact expected error, independent of whether the live AI could be tricked into producing that text itself. (An earlier attempt to socially engineer the actual model into leaking the token failed - the model correctly refused, proving the guardrail's TRIGGER condition was never even reached that way, not that the guardrail logic itself works. The direct test is the more reliable evidence.)

---

## Best Practices

- **Test a guardrail's catch logic directly, not just by hoping to provoke it through the AI.** A well-behaved model may simply decline to produce the forbidden content you're trying to test against, which proves the model behaved well - not that your validator would actually catch it if the model ever did slip.
- **Give a genuine security catch its own distinct exception path from a plain infrastructure error.** A single catch-all `except Exception` that always returns the same fallback response makes a broken deployment indistinguishable from a working guardrail - exactly the kind of ambiguity that would waste hours in a real incident, trying to figure out whether "SECURITY_BLOCK" in your logs means the system worked or something silently broke.
- **A schema check (Pydantic model shape) and a content check (forbidden keywords) are two different concerns - keep them as two different validation layers.** Day 1 already proved the shape is right; this lesson adds a second, independent layer on top, rather than trying to cram content rules into the type system itself.

## Why This Matters in Production

Any AI output that reaches a customer, a log, or a downstream system needs more than a valid shape - it needs a check that a real safety or business rule wasn't violated in the CONTENT. And when that check fires, we need to trust that "SECURITY_BLOCK" in a log genuinely means the guardrail worked, not that something upstream quietly broke and got mislabeled as a security event.
