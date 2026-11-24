"""Cryptographic tool permission scoping & agent identity verification - Day 52.

When multi-agent systems trigger sensitive operations (transferring
capital, writing to a ledger, updating database schemas), relying solely
on prompt instructions is unsafe - a prompt injection can push an agent
into invoking a tool it was never meant to use. This intercepts every
sensitive tool call with an HMAC-signed permission token, verifying both
the token's signature (it wasn't forged or tampered with) and its scope
(the caller was actually granted this specific action) before the tool's
real logic ever runs.
"""

import asyncio
import hashlib
import hmac

from dotenv import load_dotenv
from pydantic import BaseModel
from pydantic_ai import Agent, RunContext
from pydantic_ai.exceptions import ModelRetry

load_dotenv()


class OperationAuditResult(BaseModel):
    account_id: str
    action_executed: str
    status: str
    security_verdict: str


class SecurityToken(BaseModel):
    user_id: str
    scopes: set[str]
    signature: str


class AgentSecurityContext:
    def __init__(self, signing_secret: str):
        self._secret = signing_secret.encode()

    def generate_signature(self, user_id: str, scopes: set[str]) -> str:
        payload = f"{user_id}:{','.join(sorted(scopes))}".encode()
        return hmac.new(self._secret, payload, hashlib.sha256).hexdigest()

    def verify_permission(self, token: SecurityToken, required_scope: str) -> bool:
        expected = self.generate_signature(token.user_id, token.scopes)
        if not hmac.compare_digest(expected, token.signature):
            return False
        return required_scope in token.scopes


class RuntimeContext:
    def __init__(self, security_manager: AgentSecurityContext, auth_token: SecurityToken):
        self.security = security_manager
        self.token = auth_token


secure_agent = Agent(
    "openai:gpt-4o",
    deps_type=RuntimeContext,
    output_type=OperationAuditResult,
    system_prompt=(
        "We are an autonomous security and operations agent. "
        "Execute treasury operations only when the caller's cryptographic context permits it."
    ),
)


@secure_agent.tool
async def execute_treasury_rebalance(ctx: RunContext[RuntimeContext], account_id: str, rebalance_amount_gbp: float) -> str:
    """Executes capital movements between institutional accounts."""
    required_scope = "TREASURY_WRITE"
    is_valid = ctx.deps.security.verify_permission(ctx.deps.token, required_scope)

    if not is_valid:
        raise ModelRetry(
            f"SECURITY VIOLATION: Caller '{ctx.deps.token.user_id}' lacks verified scope '{required_scope}'. "
            "Action has been aborted and logged."
        )

    return f"Successfully rebalanced £{rebalance_amount_gbp:,.2f} on account {account_id}."


async def main() -> None:
    print("--- Test 1: Cryptographic Tool Scope Enforcement (Unauthorized Caller) ---")
    sec_manager = AgentSecurityContext(signing_secret="super-secure-enterprise-key")

    read_only_scopes = {"TREASURY_READ"}
    unauthorized_token = SecurityToken(
        user_id="contractor_dev_01",
        scopes=read_only_scopes,
        signature=sec_manager.generate_signature("contractor_dev_01", read_only_scopes),
    )

    context_unauthorized = RuntimeContext(sec_manager, unauthorized_token)
    user_query = "Rebalance £50,000 from account ACC-4081 to liquidity reserves."

    print(f"Submitting query with unauthorized token: {user_query}")
    try:
        blocked_response = await secure_agent.run(user_query, deps=context_unauthorized)
        blocked_result: OperationAuditResult = blocked_response.output
        print(f"[NO EXCEPTION RAISED] Agent completed its run instead of erroring. Structured result: {blocked_result}")
        assert blocked_result.status.lower() != "success", (
            "BUG: the agent's structured output claims the unauthorized rebalance SUCCEEDED - "
            "this would be a real security failure, not just a reporting quirk."
        )
        print(
            "[VERIFIED] Although no exception propagated to the caller, the agent's own structured output "
            f"correctly reports the action did NOT succeed (status='{blocked_result.status}'). Note: a caller "
            "checking only for exceptions, and not this status field, would incorrectly believe the request "
            "was simply 'handled' rather than actively blocked - the caller MUST check status, not rely on "
            "try/except alone."
        )
    except Exception as err:
        print(f"[ACCESS PREVENTED]: {err}\n")

    print("--- Test 2: Cryptographic Tool Scope Enforcement (Authorized Caller) ---")
    authorized_scopes = {"TREASURY_READ", "TREASURY_WRITE"}
    authorized_token = SecurityToken(
        user_id="byron_lead_architect",
        scopes=authorized_scopes,
        signature=sec_manager.generate_signature("byron_lead_architect", authorized_scopes),
    )

    context_authorized = RuntimeContext(sec_manager, authorized_token)
    print("Submitting query with authorized token...")
    res = await secure_agent.run(user_query, deps=context_authorized)

    result: OperationAuditResult = res.output
    print("=== Execution Verified & Authenticated ===")
    print(f"Target Account: {result.account_id}")
    print(f"Action: {result.action_executed}")
    print(f"Status: {result.status}")

    # Real proof this is a genuine CRYPTOGRAPHIC check, not just a scope
    # membership check the source's demo never actually exercised: a
    # token with the RIGHT scope but a TAMPERED/forged signature must
    # still be rejected - proving the HMAC verification is real, not
    # decorative.
    print("\n--- Test 3: Directly Verifying Signature Tampering Is Caught ---")
    forged_token = SecurityToken(
        user_id="attacker_01",
        scopes={"TREASURY_READ", "TREASURY_WRITE"},
        signature="0" * 64,  # a syntactically valid but forged hex signature
    )
    is_forged_valid = sec_manager.verify_permission(forged_token, "TREASURY_WRITE")
    assert not is_forged_valid, "BUG: a forged signature was accepted despite having the right scope claimed."
    print("[VERIFIED] A forged signature claiming the right scope is correctly rejected - the HMAC check is genuinely cryptographic, not just a scope-membership lookup.")


if __name__ == "__main__":
    asyncio.run(main())
