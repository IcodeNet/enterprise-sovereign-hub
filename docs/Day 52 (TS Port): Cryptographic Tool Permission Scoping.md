Day 52's TypeScript port builds the identical HMAC signing/verification logic with Node's `crypto` module, and reproduces the same "no exception propagates" operational finding.

---

## Security & Guardrails — Day 52 (TS Port): Cryptographic Tool Permission Scoping & Agent Identity Verification

### The Problem We're Solving

Same problem as the Python lesson: sensitive tool calls need a cryptographically-verified permission check, not just prompt-level trust.

Focus: `node:crypto`'s HMAC and `timingSafeEqual` as the direct equivalent of Python's `hmac` module
Time investment: 15 minutes

| What it's called in Python | What it's called in TypeScript |
| --- | --- |
| computing the signature (`hmac.new(self._secret, payload, hashlib.sha256).hexdigest()`) | computing the signature (`crypto.createHmac("sha256", this.secret).update(payload).digest("hex")`) |
| constant-time comparison (`hmac.compare_digest(expected, token.signature)`) | constant-time comparison (`crypto.timingSafeEqual(expectedBuf, signatureBuf)`, with an explicit length check first since `timingSafeEqual` throws on mismatched buffer lengths rather than returning `false`) |
| the security-violation signal (`raise ModelRetry(...)`) | the security-violation signal (`throw new Error(...)` inside the tool's `execute()`) |
| extracting the graceful-failure structured result (agent's own `output_type`) | extracting the graceful-failure structured result (inspecting `steps` for a `tool-error` content part, then a separate `generateObject` extraction) |

### Step 1: Build the Signing & Verification Logic

Structurally identical HMAC-SHA256 signing. One real Node-specific detail: `crypto.timingSafeEqual` THROWS if the two buffers have different lengths, rather than returning `false` like Python's `hmac.compare_digest` does - so an explicit length check has to run first, or a legitimately-shaped forged signature of the wrong length would crash the check instead of failing it cleanly.

### Step 2: Run and Verify All 3 - Same Real Finding as Python

```
--- Test 1: Cryptographic Tool Scope Enforcement (Unauthorized Caller) ---
[NO EXCEPTION PROPAGATED] Structured result: {"accountId":"contractor_dev_01","actionExecuted":"Write to Treasury","status":"Aborted","securityVerdict":"Lacks verified scope 'TREASURY_WRITE'"}
[VERIFIED] The agent's own structured output correctly reports the action did NOT succeed (status='Aborted').

--- Test 2: Cryptographic Tool Scope Enforcement (Authorized Caller) ---
=== Execution Verified & Authenticated ===
Status: success

--- Test 3: Directly Verifying Signature Tampering Is Caught ---
[VERIFIED] A forged signature claiming the right scope is correctly rejected - the HMAC check is genuinely cryptographic, not just a scope-membership lookup.
```

Confirmed identical to Python's finding: the AI SDK's `stopWhen` retry loop absorbs the thrown tool error and the model reports the failure through structured output rather than propagating an exception to the caller. `tsc --noEmit` clean; `oxlint` clean after fixing one `unicorn/no-array-sort` finding. `npm audit` unchanged.

---

## Best Practices

- **`crypto.timingSafeEqual`'s length-mismatch-throws behavior is a real trap, not a style choice.** Missing the explicit length check would make a wrong-length forged signature crash the whole permission check instead of cleanly failing it - a genuinely different, worse failure mode than Python's `hmac.compare_digest`, which handles mismatched lengths internally.
- **Distinguish a thrown tool error from a genuinely successful call by inspecting `steps` for a `tool-error` content part**, not by assuming the presence of `toolResults` means success - a tool that throws still produces a `steps` entry, just with a different `content` type.

## Why This Port Matters in Production

Confirming this port's HMAC verification catches the exact same forged-signature attack Python's version catches, AND that both languages share the same "graceful failure via structured output, no exception" operational contract, is real evidence the pattern is genuinely portable - not just its happy path, but its specific failure-reporting shape too.
