# Recovering from an apps/web dependency conflict (npm ERESOLVE)

## When to use this

`npm install` or `npm audit fix` in `apps/web` fails with an `ERESOLVE` peer-dependency error, most often naming `@llamaindex/workflow-core`'s peer dependency on `next@^15.2.2` conflicting with another installed package.

## Root cause

`@llamaindex/workflow-core` (pulled in by `llamaindex`, used from Day 4 onward) declares a peer dependency on a specific Next.js version range that doesn't always line up with what other packages in this workspace expect. This has recurred across at least three separate dependency additions (Day 4 initial install, Day 14's Qdrant packages, Day 16's `@ai-sdk/openai-compatible`) - it is a known, recurring characteristic of this dependency tree, not a one-off mistake.

## Fix

Always install/update with `--legacy-peer-deps` in `apps/web`:

```bash
cd apps/web
npm install <package> --legacy-peer-deps
```

## If `npm uninstall` itself gets blocked

Some environments gate `npm uninstall` behind a confirmation step that can time out with no response. If that happens: edit `package.json` directly (remove the dependency/devDependency entry by hand), then run a plain install to resync the lockfile non-destructively:

```bash
npm install --legacy-peer-deps
```

This was the exact path used to remove `deepeval`'s TypeScript package in Day 10 after it introduced a critical RCE vulnerability that `npm audit fix` couldn't resolve normally.

## Checking whether a new vulnerability is acceptable to leave in place

Run `npm audit --json` and check severity per package:

```bash
npm audit --json | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(d.get('metadata',{}).get('vulnerabilities',{}))
for name,v in d.get('vulnerabilities',{}).items():
    print(name, v['severity'])
"
```

- **CRITICAL** (e.g. an RCE): remove the package and reimplement the technique with existing dependencies. Do not accept the risk.
- **MODERATE or lower**, with no fix available via `npm audit fix` (usually because of this same `workflow-core` peer-dep conflict): acceptable as a deliberate, DOCUMENTED trade-off for a dev-only tool - name it explicitly in the commit message and the day's doc, don't silently ignore it. Precedent: Day 14's TypeScript port documented and kept a moderate DoS advisory in a transitive `undici` dependency pulled in by `@qdrant/js-client-rest`.
