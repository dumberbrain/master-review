---
language: typescript
prefix: TS
version: 1.0.0
---

# patterns.dev: TypeScript rules

Rules for `.ts`, `.mts`, `.cts` and `.tsx` files. Written in this project's own words; follow the source links for the full background.

### TS-005 — Floating promise

- **severity**: major
- **status**: active
- **applies-to**: calls to async functions
- **look-for**: an async call whose promise is neither awaited, returned, nor handled with `.catch`, outside an intentional `void` fire-and-forget
- **why**: errors become unhandled rejections and the code continues before the work is done
- **fix**: `await` it, return it, or handle errors explicitly; mark deliberate fire-and-forget with `void` and a catch
- **sources**: https://www.patterns.dev/, https://refactoring.guru/design-patterns/typescript

```ts
// bad
saveDraft(doc);
navigate('/next');
// good
await saveDraft(doc);
navigate('/next');
```

### TS-011 — Exported mutable module state

- **severity**: minor
- **status**: active
- **applies-to**: module-level variables
- **look-for**: `export let`, exported objects or arrays that other modules mutate, or module-level caches used as hidden singletons
- **why**: any importer can change shared state, which causes order-dependent bugs and leaks between tests and server requests
- **fix**: export functions that own the state, or create instances explicitly (factory, dependency injection)
- **sources**: https://www.patterns.dev/vanilla/singleton-pattern, https://refactoring.guru/design-patterns/singleton/typescript/example

```ts
// bad
export let currentUser: User | null = null;
// good
let currentUser: User | null = null;
export const getCurrentUser = () => currentUser;
export const setCurrentUser = (u: User | null) => { currentUser = u; };
```
