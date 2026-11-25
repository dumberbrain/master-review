---
language: javascript
prefix: JS
version: 1.0.0
---

# Refactoring.Guru and SourceMaking: JavaScript rules

Rules for `.js`, `.mjs`, `.cjs` and `.jsx` files. Written in this project's own words; follow the source links for the full background.

### JS-004 — Function mutates its arguments

- **severity**: minor
- **status**: active
- **applies-to**: functions receiving objects or arrays
- **look-for**: functions that `push`, `sort`, `splice`, `delete` or assign properties on parameters they did not create, when callers do not expect it
- **why**: callers' data changes behind their back; bugs appear far from the cause, and React/Redux state stops updating
- **fix**: return a new value (`[...arr]`, `{ ...obj }`, `toSorted`) or make the mutation explicit in the name
- **sources**: https://refactoring.guru/remove-assignments-to-parameters, https://www.patterns.dev/

```js
// bad
function topThree(scores) { return scores.sort((a, b) => b - a).slice(0, 3); }
// good
function topThree(scores) { return [...scores].sort((a, b) => b - a).slice(0, 3); }
```

### JS-007 — Unsafe deep merge of untrusted input

- **severity**: major
- **status**: active
- **applies-to**: object merge / assign helpers
- **look-for**: recursive merge, `Object.assign` or bracket assignment using keys from request bodies, query strings or JSON without filtering `__proto__`, `constructor`, `prototype`
- **why**: lets an attacker change `Object.prototype` (prototype pollution) and alter behaviour across the app
- **fix**: validate input against a schema, copy only known keys, or use `Object.create(null)` / `Map` for dynamic keys
- **sources**: https://sourcemaking.com/antipatterns/software-development-antipatterns

```js
// bad
function setPath(obj, path, value) { const [k, ...rest] = path; rest.length ? setPath(obj[k] ??= {}, rest, value) : (obj[k] = value); }
setPath(settings, req.body.path, req.body.value);
// good
const allowed = new Set(['theme', 'language']);
if (allowed.has(req.body.key)) settings[req.body.key] = String(req.body.value);
```

### JS-009 — eval or new Function

- **severity**: major
- **status**: active
- **applies-to**: dynamic code execution
- **look-for**: `eval`, `new Function`, or `setTimeout` / `setInterval` with a string argument
- **why**: runs arbitrary code, blocks optimisations and breaks content security policies
- **fix**: use data (JSON, lookup tables) and normal functions instead
- **sources**: https://sourcemaking.com/antipatterns/software-development-antipatterns

```js
// bad
const fn = new Function('a', 'b', `return a ${op} b`);
// good
const ops = { '+': (a, b) => a + b, '-': (a, b) => a - b };
const fn = ops[op];
```

### JS-013 — Deeply nested conditionals

- **severity**: suggestion
- **status**: active
- **applies-to**: functions with branching
- **look-for**: if/else nesting three or more levels deep, where the main path is buried inside
- **why**: the normal flow is hard to see and edge cases are easy to break
- **fix**: use guard clauses (early return/throw) for special cases
- **sources**: https://refactoring.guru/replace-nested-conditional-with-guard-clauses

```js
// bad
function pay(o) { if (o) { if (o.items.length) { if (!o.paid) { return charge(o); } } } }
// good
function pay(o) {
  if (!o || o.items.length === 0 || o.paid) return;
  return charge(o);
}
```
