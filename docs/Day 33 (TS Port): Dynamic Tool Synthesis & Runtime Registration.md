Day 33's TypeScript port builds the same dynamic tool-synthesis pipeline using Node's `vm` module for sandboxing, and independently verifies the same name-mismatch recovery mechanism the Python side genuinely needed.

---

## Agent Autonomy — Day 33 (TS Port): Dynamic Tool Synthesis & Runtime Registration

### The Problem We're Solving

Predefined tools cannot cover every task. If no existing tool fits, the agent can build a new tool function during the same run, test it in an isolated context (a safe temporary code area), and then add it to the live tool registry.

Focus: mirroring the Python pipeline with Node's built-in sandboxing, and independently verifying the same defensive recovery mechanism
Time investment: 15 minutes

| What it's called in Python | What it's called in TypeScript |
| --- | --- |
| the schema for the model's output (`class SynthesizedToolCode(BaseModel)`) | the schema for the model's output (`const SynthesizedToolCodeSchema = z.object({...})`) |
| asking the AI to write the code (`await tool_author_agent.run(author_prompt)`) | asking the AI to write the code (`await generateObject({ model, schema, prompt })`) |
| the isolated namespace the generated code runs in (`exec(code, {}, local_scope)`) | the isolated namespace the generated code runs in (`vm.runInContext(code, vm.createContext({}))`) |
| finding the real function when the model's own name field is wrong (`[v for v in local_scope.values() if callable(v)]`) | finding the real function when the model's own name field is wrong (`Object.keys(sandboxContext).filter(k => typeof sandboxContext[k] === "function")`) |

### Step 1: Build the Pipeline Using Node's `vm` Module

`apps/web/src/agents/dynamic-tool-synthesis.ts` uses the same `vm.createContext()` isolation approach as Day 27's self-healing agent - a genuinely separate global object, no `isolated-vm`/`vm2` dependency needed.

```typescript
compileAndRegister(codePayload: SynthesizedToolCode): void {
  const sandboxContext = vm.createContext({});
  vm.runInContext(codePayload.jsCode, sandboxContext, { timeout: 5000 });
  const definedNames = Object.keys(sandboxContext).filter((k) => typeof sandboxContext[k] === "function");
  let func = sandboxContext[codePayload.toolName];
  if (typeof func !== "function") {
    if (definedNames.length === 1) {
      resolvedName = definedNames[0];
      func = sandboxContext[resolvedName];
      // recovered - same pattern as the Python side
    }
  }
}
```

### Step 2: Real Run - Correct Output

```
Step 2: Synthesized Tool Definition:
Name: reverseAndUppercaseString
Code:
function reverseAndUppercaseString(input) {
    if (typeof input !== 'string') { throw new TypeError('Input must be a string'); }
    return input.split('').reverse().join('').toUpperCase();
}

[TOOL REGISTERED] Successfully added 'reverseAndUppercaseString' to runtime registry.

Step 3: Executing newly synthesized tool...
Runtime Execution Output: OMED BUH ECNEGILLETNI NGIEREVOS
```

Correct string reversal and uppercasing of the test input - this particular run's model output happened to be internally consistent (unlike the Python side's two runs), so the name-mismatch recovery path wasn't naturally triggered here.

### Step 3: Verify the Recovery Path Directly, Since the Live Model Didn't Trigger It Naturally

Rather than assume the TS recovery logic works just because it compiles, tested it directly with a deliberately mismatched claim - the same honesty discipline this repo used on Day 27 when the live model wouldn't fail on demand:

```typescript
const { resolvedName, func } = compileAndRegister("DoesNotMatchAtAll", "function actualRealName(x) { return x + '!'; }");
// RECOVERED: claimed 'DoesNotMatchAtAll' -> actual 'actualRealName'
// Resolved name: actualRealName
// Call result: works!
```

Real result: the mechanism correctly finds and uses the actual defined function when the claimed name doesn't match, independent of whether the live model happened to produce a mismatch on this particular run.

`tsc --noEmit` and `oxlint` both clean. `npm audit` unchanged (1 high, 1 moderate, both pre-existing).

---

## Best Practices

- **When a live model doesn't naturally reproduce a bug found on another day/language, verify the DEFENSE mechanism directly with a controlled test rather than assuming it works because it "should."** This is the same principle Day 27 established (test the mechanism, don't wait for a lucky failure) - applied here because THIS run's model output happened to be self-consistent, unlike both of Python's runs.
- **A defensive fix ported to a second language deserves its own verification, even when the underlying bug (model self-inconsistency) is described in general terms rather than reproduced exactly.** The Python side found this by a real crash; the TS side confirms the SAME fix logic holds by direct test, since waiting for an identical live failure isn't guaranteed.

## Why This Matters in Production

A defensive recovery mechanism copied from another language's real bug fix isn't automatically correct just because the logic looks the same - verifying it directly, especially when the live model in THIS run didn't happen to trigger the original failure, is what actually confirms the port is faithful rather than merely plausible.
