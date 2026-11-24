Day 52 intercepts every sensitive tool call with an HMAC-signed permission token, and finds a genuinely important operational subtlety: the security block doesn't raise an exception to the caller at all - it reports failure through the structured output instead.

---

## Security & Guardrails — Day 52: Cryptographic Tool Permission Scoping & Agent Identity Verification

### The Problem We're Solving

When multi-agent systems trigger sensitive operations - moving capital, writing to a ledger, updating a database schema - relying solely on prompt instructions to keep the agent in bounds is unsafe. A prompt injection can push the agent into invoking a tool it was never meant to use. The fix intercepts every sensitive tool call with a signed permission token before the tool's real logic runs, verifying two separate things: the token's SIGNATURE (proof it wasn't forged or tampered with) and its SCOPE (proof the caller was actually granted this specific action).

Focus: HMAC-based signature verification plus scope checking, with a direct proof that a forged-but-plausible token is still rejected
Time investment: 15 minutes

### Step 1: Build the Signing & Verification Logic

`apps/ai-engine/src/security/permission_scoped_agent.py`'s `AgentSecurityContext` signs a `user_id:sorted_scopes` payload with HMAC-SHA256, and verifies both the signature (via constant-time `hmac.compare_digest`, not a plain `==`, to avoid timing side-channels) and scope membership:

```python
def verify_permission(self, token: SecurityToken, required_scope: str) -> bool:
    expected = self.generate_signature(token.user_id, token.scopes)
    if not hmac.compare_digest(expected, token.signature):
        return False
    return required_scope in token.scopes
```

### Step 2: A Real, Important Finding - No Exception Actually Propagates

The source's own demo wraps the unauthorized call in a `try/except` and expects to catch an error. Running it for real revealed that's WRONG: `pydantic_ai`'s `ModelRetry` (raised inside the tool when the scope check fails) gets caught internally by the agent's own retry loop, and the model gracefully reports the failure through its OWN structured output instead of letting any exception reach the caller at all.

### Step 3: Run and Verify All 3 - Real Results

```
--- Test 1: Cryptographic Tool Scope Enforcement (Unauthorized Caller) ---
[NO EXCEPTION RAISED] Agent completed its run instead of erroring. Structured result:
account_id='ACC-4081' action_executed='Rebalance £50,000 to liquidity reserves' status='Failed' security_verdict='Caller lacks necessary permissions'
[VERIFIED] Although no exception propagated to the caller, the agent's own structured output correctly reports the action did NOT succeed (status='Failed').

--- Test 2: Cryptographic Tool Scope Enforcement (Authorized Caller) ---
=== Execution Verified & Authenticated ===
Status: Pending

--- Test 3: Directly Verifying Signature Tampering Is Caught ---
[VERIFIED] A forged signature claiming the right scope is correctly rejected - the HMAC check is genuinely cryptographic, not just a scope-membership lookup.
```

Test 3, added beyond the source's demo, is the actually critical proof: a token with the RIGHT scope claimed but a forged/tampered signature is still correctly rejected - confirming this is a genuine cryptographic check, not a scope-membership lookup that happens to also carry an unverified signature field.

---

## Best Practices

- **A security gate that fails "gracefully" (via structured output) instead of raising is a genuinely different operational contract than one that throws - and callers need to know which.** A caller written to only catch exceptions around this call would silently believe an unauthorized request was simply "processed," when it was actually blocked. The `status` field, not the absence of an exception, is the source of truth here.
- **Test a forged signature with the CORRECT scope, not just a wrong scope.** A weaker implementation might only check scope membership and never actually verify the signature at all - a test with a wrong scope wouldn't catch that bug, because it would fail for the wrong reason. Only a forged signature paired with the RIGHT scope proves the signature check is load-bearing.
- **Use `hmac.compare_digest`, never a plain string `==`, when comparing a computed signature against a supplied one.** A naive `==` comparison leaks timing information about how many leading characters matched, which an attacker can exploit to forge a signature byte-by-byte.

## Why This Matters in Production

Discovering that a security control's FAILURE MODE is different from what the source material's own demo assumed (no exception, a structured "Failed" status instead) is exactly the kind of finding that only running real code, end to end, actually surfaces - a caller integrating against this pattern based on the source's own assumption would have built a broken alerting path around a try/except that never fires.
