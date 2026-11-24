# Verify honestly, report findings even when negative

## When to use this

Always, for every claim about code behavior in this repo - but especially when a result is surprising, inconsistent, or a fix doesn't fully work.

## The core rule

Never write a doc section, a commit message line, or a status update describing a result that wasn't actually produced by running the code in this session. If you didn't see it happen, you cannot claim it happened - restate the theory as a theory, not a proven result.

## What "honest" looks like in practice - real examples from this repo's own history

- **Day 15 (Agent Swarms)**: the swarm's consensus vote landed on the TECHNICALLY WRONG answer, twice in a row, on a question with a verifiably correct answer. The doc says so plainly, with the real vote counts, instead of re-running until a "nicer" result appeared or quietly rephrasing the test question.
- **Day 21 (Knowledge Graph / TS port)**: `graphology-types` installed as a completely EMPTY directory, producing a wall of misleading TypeScript errors. The doc documents the exact diagnostic (`npm ls graphology-types` showing `(empty)`) rather than just saying "fixed a dependency issue."
- **Day 22 (Context Caching)**: OpenAI's prompt caching fired inconsistently across repeated identical runs - sometimes on call 1, sometimes never. Both languages' docs report the REAL, messy numbers from multiple runs, not a single cherry-picked "it worked" run.
- **Day 23 (MCP Client)**: the original curriculum's Python code was flagged as FAKE (a hardcoded tool list, a manual if/else dispatcher) rather than silently "fixing" it without saying why the rewrite was necessary.
- **Day 24 (Docker Compose, ai-engine build)**: `docker compose up --build` genuinely could NOT complete on this machine - PyPI installs inside the container failed with a persistent SSL certificate error that survived multiple different fix attempts (adding the TLS-inspecting proxy's root CA via `update-ca-certificates`, then via the exact known-working host CA bundle, then testing with `--network=host` to rule out Docker's bridge networking). Rather than claiming success or hiding the blocker, this was documented as a real, unresolved, machine-specific limitation, with the diagnostic steps taken and their results stated plainly.

## Practical rules that follow from this

1. **Run the code before writing about it.** A doc section describing a script's output must be backed by that script actually having run in this session, this attempt - not a previous, different version of the file, and not "this is what it should print."
2. **If a fix doesn't fully work, say so - don't claim partial success as full success.** "This reduced the failure rate" is honest; "this fixed it" when it didn't is not.
3. **A negative or inconsistent result is not a failure to hide - it's the actual finding.** Several of this repo's most useful doc sections ARE the negative result (Day 15, Day 22) - readers learn more from "here's a real limit we hit" than from a suspiciously clean happy path.
4. **When something is genuinely unresolved after a reasonable, documented effort, say that plainly and move on** rather than looping indefinitely on the same failing approach. State what was tried, what each attempt's actual result was, and that it remains open - don't manufacture a fake resolution to close the loop artificially.
5. **Distinguish "I verified this" from "this should work."** Only the first belongs in a doc's "Run and Verify" section or a commit message's "Verified:" line. If you haven't run it, say what you expect and flag it as untested, or actually go run it first.

## Why this matters here specifically

This repo's whole value as a portfolio is that every claim is backed by real evidence - the moment one claim is invented or exaggerated, none of the others can be trusted either without independent re-verification. The discipline is the product, not just the code.
