---
language: typescript
prefix: TS
version: 1.0.0
---

# Bulletproof React: TypeScript rules

Rules for `.ts`, `.mts`, `.cts` and `.tsx` files. Written in this project's own words; follow the source links for the full background.

### TS-004 — External data used without runtime validation

- **severity**: major
- **status**: active
- **applies-to**: HTTP responses, request bodies, query params, storage, environment variables
- **look-for**: data from outside the program typed directly with an interface (`await res.json() as User`, `req.body as Dto`) and used without validation
- **why**: types do not exist at runtime; malformed or malicious input reaches business logic
- **fix**: validate at the boundary with a schema and derive the type from it
- **sources**: https://github.com/alan2207/bulletproof-react/blob/master/docs/api-layer.md, https://www.patterns.dev/

```ts
// bad
const user: User = await res.json();
// good
const user = UserSchema.parse(await res.json()); // type User = z.infer<typeof UserSchema>
```

### TS-014 — Import cycle through barrel files

- **severity**: minor
- **status**: active
- **applies-to**: imports, `index.ts` re-exports
- **look-for**: a module importing from its own feature's `index.ts`, or two modules importing each other directly or through barrels
- **why**: causes `undefined` at import time, slow builds and accidental coupling between features
- **fix**: import from the concrete file inside a feature; keep barrels only as a feature's public API
- **sources**: https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md

```ts
// bad (inside features/cart/components/CartItem.tsx)
import { useCart } from '@/features/cart';
// good
import { useCart } from '../hooks/use-cart';
```
