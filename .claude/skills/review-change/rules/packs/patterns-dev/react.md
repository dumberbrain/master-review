---
language: react
prefix: REACT
version: 1.0.0
---

# patterns.dev: React rules

Rules for `.jsx` and `.tsx` files, applied together with the JavaScript or TypeScript rules. Written in this project's own words; follow the source links for the full background.

### REACT-004 — Effect without cleanup

- **severity**: major
- **status**: active
- **applies-to**: `useEffect`
- **look-for**: effects that subscribe, add listeners, start timers or intervals, open sockets, or fetch, without returning a cleanup function
- **why**: leaks, duplicated handlers in Strict Mode, and state updates from requests that finished after the user moved on
- **fix**: return a cleanup that unsubscribes / clears / aborts (`AbortController` for fetch)
- **sources**: https://www.patterns.dev/react/hooks-pattern

```tsx
// bad
useEffect(() => { const id = setInterval(tick, 1000); }, []);
// good
useEffect(() => { const id = setInterval(tick, 1000); return () => clearInterval(id); }, []);
```

### REACT-005 — Missing or unstable list keys

- **severity**: minor
- **status**: active
- **applies-to**: rendering arrays
- **look-for**: `.map(...)` returning elements without `key`, keys from array index on lists that can be reordered, filtered or inserted into, or random keys (`Math.random()`, `crypto.randomUUID()` during render)
- **why**: React reuses the wrong components, so input values and local state jump between rows
- **fix**: use a stable unique id from the data
- **sources**: https://www.patterns.dev/react

```tsx
// bad
{items.map((item, i) => <Row key={i} item={item} />)}
// good
{items.map((item) => <Row key={item.id} item={item} />)}
```

### REACT-006 — State mutated directly

- **severity**: major
- **status**: active
- **applies-to**: `useState`, `useReducer`, external stores
- **look-for**: `state.push(...)`, `state.x = ...`, `sort()` / `splice()` on state arrays, then calling the setter with the same object
- **why**: React compares by reference, so the UI does not update or updates unpredictably
- **fix**: create new arrays and objects (`[...items, x]`, `{ ...obj, x }`, `toSorted`)
- **sources**: https://www.patterns.dev/react

```tsx
// bad
items.push(newItem); setItems(items);
// good
setItems((prev) => [...prev, newItem]);
```

### REACT-007 — Hook called conditionally

- **severity**: blocker
- **status**: active
- **applies-to**: hooks
- **look-for**: hooks called inside `if`, loops, after an early `return`, inside callbacks, or from non-component functions
- **why**: breaks the rules of hooks; state gets attached to the wrong hook and the app crashes or misbehaves
- **fix**: call hooks unconditionally at the top level of the component or custom hook; branch inside them
- **sources**: https://www.patterns.dev/react/hooks-pattern

```tsx
// bad
if (!user) return null;
const [tab, setTab] = useState('info');
// good
const [tab, setTab] = useState('info');
if (!user) return null;
```

### REACT-008 — Component defined inside another component

- **severity**: major
- **status**: active
- **applies-to**: component declarations
- **look-for**: a function returning JSX declared inside another component's body and used as `<Inner />`
- **why**: a new component type is created on every render, so it remounts, loses state and focus, and re-runs effects
- **fix**: move it to module level and pass what it needs as props
- **sources**: https://www.patterns.dev/react

```tsx
// bad
function List({ items }) { const Item = ({ it }) => <li>{it.name}</li>; return <ul>{items.map((it) => <Item key={it.id} it={it} />)}</ul>; }
// good
const Item = ({ it }) => <li>{it.name}</li>;
function List({ items }) { return <ul>{items.map((it) => <Item key={it.id} it={it} />)}</ul>; }
```

### REACT-009 — Props drilled through many layers

- **severity**: suggestion
- **status**: active
- **applies-to**: component trees
- **look-for**: a prop passed through three or more components that do not use it themselves
- **why**: intermediate components change for unrelated reasons and become hard to reuse
- **fix**: use composition (pass children/slots), the compound component pattern, or context for truly shared values
- **sources**: https://www.patterns.dev/react/compound-pattern, https://github.com/alan2207/bulletproof-react/blob/master/docs/state-management.md

```tsx
// bad
<Page user={user} />  →  <Layout user={user} />  →  <Sidebar user={user} />  →  <Avatar user={user} />
// good
<Layout sidebar={<Sidebar avatar={<Avatar user={user} />} />} />
```

### REACT-010 — Component mixes data fetching, logic and UI

- **severity**: suggestion
- **status**: active
- **applies-to**: components
- **look-for**: a component that grows past ~150 lines or combines fetching, data transformation, business rules and large JSX
- **why**: hard to test and reuse; any change touches everything
- **fix**: move logic into custom hooks and split presentational parts into smaller components
- **sources**: https://www.patterns.dev/react/hooks-pattern, https://www.patterns.dev/react/presentational-container-pattern, https://github.com/alan2207/bulletproof-react/blob/master/docs/components-and-styling.md

```tsx
// bad
function OrdersPage() { /* 200 lines: fetch, filter, sort, totals, table, modals */ }
// good
function OrdersPage() { const orders = useOrders(filters); return <OrdersTable orders={orders} onOpen={openOrder} />; }
```

### REACT-019 — Input switches between controlled and uncontrolled

- **severity**: minor
- **status**: active
- **applies-to**: form inputs
- **look-for**: `value={x}` where `x` can be `undefined` or `null`, or both `value` and `defaultValue` on the same input
- **why**: React warns and the field stops reflecting state correctly
- **fix**: always pass a defined value (`value={x ?? ''}`) or use an uncontrolled input with `defaultValue`
- **sources**: https://www.patterns.dev/react

```tsx
// bad
<input value={user.nickname} onChange={onChange} />
// good
<input value={user.nickname ?? ''} onChange={onChange} />
```
