# Authoring a new "Day N" lesson (code + doc, Python + TypeScript)

## When to use this

Adding a new Day to this portfolio, sourced from the PDF curriculum (kept locally at `docs/EnterpriseIntellligenceHub.pdf`, not in the repository), built in both `apps/ai-engine` (Python) and `apps/web` (TypeScript).

## The non-negotiable per-day workflow

1. **Extract the PDF's own version of the Day** (`pdftotext -layout` against the PDF, then grep/search for the Day's section) - use it as a starting point, never as ground truth. PDF code snippets routinely use APIs that have since moved on (renamed methods, restructured classes, removed parameters, or - as found in Day 20 and Day 23 - code that doesn't actually do what it claims to do at all). Check every API against the ACTUALLY INSTALLED library version before writing a line of code that depends on it.
2. **Write the Python file first**, verify it by actually RUNNING it and reading the real output - not a syntax check, not "it imported fine." Fix any real bug found (wrong API, wrong assumption, or a lesson that was faked/simulated in the source material) and note the fix plainly.
3. **Write the TypeScript port**, using a genuine equivalent library where one exists. If no real equivalent exists (verify via `npm view <package> version` / a real web search, never assume), document the gap honestly and build the closest faithful equivalent from first principles rather than faking a parity that doesn't exist.
4. **Re-verify the TS side**: `npx tsc --noEmit` clean, `npx oxlint .` clean, then actually RUN the script and read the real output.
5. **Regression-check**: re-run Day 1 (or another known-good early day) on both sides after any dependency change, to catch a silent breakage before moving on.
6. **Write both docs** (see format below) - the doc's evidence must come from the ACTUAL run output captured while building this day, never invented or extrapolated from what "should" happen.
7. **Regenerate `apps/ai-engine/requirements.txt`** (`pip list --format=freeze > requirements.txt`) whenever a Python dependency changed.
8. **Commit with a detailed message** naming every real bug found/fixed and the actual evidence gathered, then push.
9. **Tag the day**: `git tag -a day-N -m "Day N: <one-line summary>"` (and `day-N-ts` if Python and TS land in separate commits), then `git push origin day-N` (or `git push origin --tags`).

## HARD RULE: always TWO separate doc files, never one combined doc

Every day with both a Python and a TS side gets exactly two files:
`docs/Day N: <title>.md` (Python) and `docs/Day N (TS Port): <title>.md`
(TypeScript) - never a single file covering both languages, even if the TS
side is short or just confirms the same finding as Python. This was
established from Day 1 and held through Day 23, then silently broken for
Days 25-31 (combined into one file each) without ever deciding to change
the convention - caught only when the user visually compared the docs
folder listing to the actual pattern.

**MECHANICAL trip-wire, not a memory check**: before writing ANY day's
doc(s), actually run `ls docs/ | tail -6` and look at the real output -
do not rely on remembering the convention from earlier in the session.
If the immediately preceding numbered day does not show a matching pair
(or isn't a documented single-doc exception), STOP and fix that day
before writing the new one. Habit and memory drift silently across a
long session; a real command run at the start of every doc-writing step
does not. This generalizes to every convention in this skill (tag
naming, commit shape, requirements.txt regeneration) - re-run the actual
verifying command each time rather than trusting recent memory of having
done it right before. The ONLY exception is a day with no TS side by
design (e.g. Day 24, a pure infra/Docker day) - that day gets one doc,
explicitly noting why no TS port exists.

## Doc format (both `docs/Day N: <title>.md` and `docs/Day N (TS Port): <title>.md`)

Every day doc follows this exact section order:

1. **Title** - `## <Category> — Day N: <Title>` (or `Day N (TS Port): <Title>` for the port doc).
2. **One-paragraph framing** - what real capability this lesson adds, in plain English.
3. **"The Problem We're Solving"** - what fails or is missing WITHOUT this lesson's technique. Comes after the intro, before Focus/Time.
4. **Focus / Time investment** - one line each.
5. **Numbered Steps** - install commands, file path to create, then the actual working source code in a fenced block. The code shown IS the real, verified file content, never a simplified stand-in.
6. **Run and Verify** - the actual command, and the REAL output/evidence gathered while building this lesson. If something broke and got fixed, state the exact error, the root cause, and the fix - never hide a bug that was hit and resolved.
7. **"Best Practices"** (bulleted) - before "Why This Matters"; generalizable lessons ACTUALLY discovered while building this specific day, not generic advice.
8. **"Why This Matters in Production"** - one closing paragraph connecting the lesson to real production stakes.

The TS Port doc reads STANDALONE (a reader who never saw the Python doc should follow it fully), but explicitly calls out any REAL cross-language difference found (a missing library feature, a different failure mode, a different fix, a different measured result).

**HARD RULE, restored after being silently dropped from Day 3 onward**: every TS Port doc includes a "What it's called in Python | What it's called in TypeScript" comparison table early on (right after the intro paragraph, before Step 1) mapping the concrete equivalent concepts/API calls side by side. This was the actual convention on Days 1-2, then dropped without a decision on every day since. Bring it back on every NEW TS Port doc going forward; do not backfill old docs unless asked.

## Commit message pattern

```
Day N: <one-line summary>, Python + TS

Python (apps/ai-engine/src/.../file.py):
- <what it does, 1-2 lines>
- <any REAL bug found and the exact fix, if any>
- Verified: <the actual evidence - timing numbers, span IDs matched,
  N/N clean runs after a fix, etc>

TypeScript port (apps/web/src/.../file.ts):
- <same shape - what it does, real bug+fix if any, real evidence>

<Any regenerated requirements.txt / dependency note>
```

## Verify-before-write discipline (the whole point of this skill)

Never write a "Run and Verify" section, an evidence table, or a Best Practices bullet describing a result that wasn't actually produced by running the code in this session. If a script's behavior is flaky or inconsistent across runs, that inconsistency IS the finding worth documenting (run it 3-5 times, report the real spread) - never paper over it with a single cherry-picked clean run. Real examples from this repo's own history: Day 15's swarm vote landed on the technically wrong answer, twice, and the doc says so; Day 22's prompt caching was inconsistent across repeated runs, and the doc reports the real numbers instead of one lucky run; Day 21 hit a genuinely empty/broken npm sub-dependency and the doc explains exactly how that was diagnosed.

## Time-box environment/infra blockers (hard rule)

If a single environment-level blocker (Docker/SSL/proxy/network issue, a broken dependency install, anything NOT about the actual lesson's own code logic) survives 2 genuinely different fix attempts, STOP immediately. Do not try a 3rd variation solo. Either:
- delegate the diagnosis to a subagent with a fresh angle (a different model perspective can spot something repeated attempts miss), while continuing other work in parallel, or
- document it plainly as an open, unresolved, time-boxed-out limitation (what was tried, what each attempt's real result was) and move on to the next day.

Never spend more than ~20-30 minutes of wall-clock effort chasing one infra blocker before doing one of the above. Real example this rule exists because of: Day 24's Docker container build hit a persistent SSL certificate error reaching PyPI that survived 4+ variations (system CA update, exact host CA bundle copy, `--network=host` test, curl isolation test) before being properly time-boxed out and delegated instead of continuing solo.

## Standing engineering rules that apply to every day

- A dependency introducing a CRITICAL vulnerability that `npm audit fix` (or the Python equivalent) can't resolve gets removed and reimplemented with existing deps - never accepted.
- A MODERATE vulnerability with no available fix is an acceptable, EXPLICITLY DOCUMENTED trade-off for a dev-only tool - state it in the doc/commit, don't silently ignore it.
