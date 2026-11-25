---
language: react
prefix: REACT
version: 1.0.0
---

# React documentation: React rules

Rules for `.jsx` and `.tsx` files, applied together with the JavaScript or TypeScript rules. Written in this project's own words; follow the source links for the full background.

### REACT-001 — Effect used to compute derived state

- **severity**: minor
- **status**: active
- **applies-to**: `useEffect` / `useLayoutEffect`
- **look-for**: an effect whose only job is to `setState` from other props or state (filtering, totals, formatting, copying a prop)
- **why**: causes an extra render with stale values first, and the two pieces of state can drift apart
- **fix**: compute the value during render (with `useMemo` only if it is expensive)
- **sources**: https://react.dev/learn/you-might-not-need-an-effect, https://www.patterns.dev/react/hooks-pattern

```tsx
// bad
const [visible, setVisible] = useState<Todo[]>([]);
useEffect(() => { setVisible(todos.filter((t) => !t.done)); }, [todos]);
// good
const visible = todos.filter((t) => !t.done);
```

### REACT-002 — Effect used to respond to a user action

- **severity**: minor
- **status**: active
- **applies-to**: `useEffect`
- **look-for**: state set in an event handler only so that an effect can react to it (send request, show toast, navigate)
- **why**: indirect, runs again on unrelated re-renders or remounts, and makes the action hard to follow
- **fix**: do the work directly in the event handler
- **sources**: https://react.dev/learn/you-might-not-need-an-effect

```tsx
// bad
const [submitted, setSubmitted] = useState(false);
useEffect(() => { if (submitted) post(form); }, [submitted]);
// good
const onSubmit = () => post(form);
```

### REACT-003 — Missing or wrong effect dependencies

- **severity**: major
- **status**: active
- **applies-to**: `useEffect`, `useMemo`, `useCallback`
- **look-for**: values from props, state or the component body used inside a hook but missing from its dependency array, or a lint suppression for `react-hooks/exhaustive-deps`
- **why**: the hook keeps reading stale values and misses updates
- **fix**: list every reactive value; move stable helpers outside the component or use a functional state update
- **sources**: https://react.dev/learn/you-might-not-need-an-effect, https://www.patterns.dev/react/hooks-pattern

```tsx
// bad
useEffect(() => { fetchResults(query, page); }, [query]);
// good
useEffect(() => { fetchResults(query, page); }, [query, page]);
```

### REACT-014 — Props copied into state

- **severity**: minor
- **status**: active
- **applies-to**: `useState` initialisers
- **look-for**: `useState(props.something)` where the component should keep following later prop changes
- **why**: state keeps the first value and ignores updates, showing stale data
- **fix**: use the prop directly; if a reset is intended, give the component a `key` or name the prop `initialX`
- **sources**: https://react.dev/learn/you-might-not-need-an-effect

```tsx
// bad
function Price({ amount }) { const [value] = useState(amount); return <span>{value}</span>; }
// good
function Price({ amount }) { return <span>{amount}</span>; }
```
