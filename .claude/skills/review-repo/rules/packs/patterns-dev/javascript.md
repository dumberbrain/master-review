---
language: javascript
prefix: JS
version: 1.0.0
---

# patterns.dev: JavaScript rules

Rules for `.js`, `.mjs`, `.cjs` and `.jsx` files. Written in this project's own words; follow the source links for the full background.

### JS-001 — Loose equality

- **severity**: minor
- **status**: active
- **applies-to**: comparisons
- **look-for**: `==` or `!=` (except an intentional `x == null` check for null-or-undefined)
- **why**: type coercion makes `'' == 0`, `'0' == false` true and hides bugs
- **fix**: use `===` / `!==`
- **sources**: https://www.patterns.dev/, https://frontendpatterns.dev/

```js
// bad
if (qty == '0') return;
// good
if (qty === 0) return;
```

### JS-002 — var or implicit global

- **severity**: minor
- **status**: active
- **applies-to**: variable declarations
- **look-for**: new `var` declarations, or assignments to undeclared variables
- **why**: function scoping and hoisting cause surprising values in loops and closures; implicit globals leak between modules
- **fix**: use `const` by default and `let` when reassignment is needed
- **sources**: https://www.patterns.dev/vanilla/module-pattern

```js
// bad
for (var i = 0; i < btns.length; i++) btns[i].onclick = () => select(i);
// good
for (let i = 0; i < btns.length; i++) btns[i].onclick = () => select(i);
```

### JS-003 — Nested callbacks

- **severity**: suggestion
- **status**: active
- **applies-to**: asynchronous code
- **look-for**: callbacks nested three or more levels deep, or promise chains nested inside `.then`
- **why**: error handling is duplicated or missing at each level and the flow is hard to follow
- **fix**: use `async`/`await` with try/catch, or flat promise chains
- **sources**: https://www.patterns.dev/, https://sourcemaking.com/antipatterns/software-development-antipatterns

```js
// bad
getUser(id, (u) => getOrders(u, (o) => getInvoice(o[0], (inv) => send(inv))));
// good
const user = await getUser(id);
const [first] = await getOrders(user);
await send(await getInvoice(first));
```

### JS-005 — Independent awaits run one after another

- **severity**: suggestion
- **status**: active
- **applies-to**: async functions, loops
- **look-for**: `await` inside a `for` loop, or several consecutive awaits, where the operations do not depend on each other
- **why**: total time becomes the sum of all calls instead of the slowest one
- **fix**: start them together with `Promise.all` / `Promise.allSettled` (bounded if there can be many)
- **sources**: https://www.patterns.dev/

```js
// bad
for (const id of ids) results.push(await fetchUser(id));
// good
const results = await Promise.all(ids.map(fetchUser));
```

### JS-006 — Promise rejection not handled

- **severity**: major
- **status**: active
- **applies-to**: promises
- **look-for**: async calls that are not awaited/returned and have no `.catch`, or `.then` chains without a final `.catch`, in event handlers, timers or module top level
- **why**: failures become unhandled rejections (crashing Node processes) or silent no-ops in the browser
- **fix**: await inside try/catch, return the promise, or attach `.catch` with real handling
- **sources**: https://www.patterns.dev/

```js
// bad
button.addEventListener('click', () => { save(form); });
// good
button.addEventListener('click', async () => {
  try { await save(form); } catch (err) { showError(err); }
});
```

### JS-010 — Hidden module singleton state

- **severity**: suggestion
- **status**: active
- **applies-to**: module-level variables
- **look-for**: module-level `let` or objects holding per-user or per-request data, especially in server code
- **why**: shared by every importer and every request; leaks data between users and between tests
- **fix**: keep per-request state in function scope or request context; for real singletons, export an explicit instance with a clear API
- **sources**: https://www.patterns.dev/vanilla/singleton-pattern

```js
// bad (server)
let currentUser;
export function handle(req) { currentUser = req.user; return render(); }
// good
export function handle(req) { return render({ user: req.user }); }
```

### JS-011 — Number parsing pitfalls

- **severity**: minor
- **status**: active
- **applies-to**: numeric conversion
- **look-for**: `parseInt` without radix, `parseInt` on floats, `+value` / `Number(value)` without a `NaN` check on user input
- **why**: `parseInt('08')` quirks, `parseInt('1e3') === 1`, and `NaN` flows silently into calculations
- **fix**: use `Number.parseInt(s, 10)` or `Number(s)` and check `Number.isFinite`
- **sources**: https://www.patterns.dev/

```js
// bad
const page = parseInt(query.page);
// good
const page = Number.parseInt(query.page, 10);
if (!Number.isFinite(page) || page < 1) throw new BadRequest('page');
```

### JS-012 — for...in over an array

- **severity**: minor
- **status**: active
- **applies-to**: loops
- **look-for**: `for (const x in array)` used to iterate array elements
- **why**: iterates string keys, includes inherited enumerable properties and gives no ordering guarantee
- **fix**: use `for...of`, `forEach`, or array methods
- **sources**: https://www.patterns.dev/

```js
// bad
for (const i in items) total += items[i].price;
// good
for (const item of items) total += item.price;
```

### JS-014 — Listener, timer or subscription never removed

- **severity**: minor
- **status**: active
- **applies-to**: event listeners, intervals, observers, sockets
- **look-for**: `addEventListener`, `setInterval`, `subscribe`, `observe` or `on(...)` without a matching removal when the owner goes away
- **why**: memory leaks and handlers firing for objects that no longer exist
- **fix**: keep the handle and remove it in the matching teardown (or pass an `AbortSignal` to `addEventListener`)
- **sources**: https://www.patterns.dev/vanilla/observer-pattern

```js
// bad
window.addEventListener('resize', layout);
// good
const ac = new AbortController();
window.addEventListener('resize', layout, { signal: ac.signal });
// later: ac.abort();
```

### JS-015 — Date parsed from a non-ISO string

- **severity**: minor
- **status**: active
- **applies-to**: date handling
- **look-for**: `new Date('03/04/2026')`, `Date.parse` on locale-formatted strings, or date math done by hand with milliseconds
- **why**: parsing differs between engines and time zones; day/month order is ambiguous
- **fix**: exchange dates as ISO 8601 strings, and use `Intl` or a date library for parsing and formatting
- **sources**: https://www.patterns.dev/

```js
// bad
const due = new Date(form.dueDate); // "04/03/2026"
// good
const due = new Date(`${form.dueDateIso}T00:00:00Z`); // "2026-03-04"
```
