---
language: react
prefix: REACT
version: 1.0.0
---

# Bulletproof React: React rules

Rules for `.jsx` and `.tsx` files, applied together with the JavaScript or TypeScript rules. Written in this project's own words; follow the source links for the full background.

### REACT-011 — Server data fetched by hand in effects

- **severity**: minor
- **status**: active
- **applies-to**: data fetching
- **look-for**: `useEffect` + `useState` pairs that fetch API data inside components, with hand-written loading/error flags, in a project that has (or should have) a data-fetching layer
- **why**: no caching, deduplication, race-condition handling or retries; the same request logic is copied everywhere
- **fix**: put API calls in the API layer and use the project's query library (e.g. TanStack Query) through a hook
- **sources**: https://github.com/alan2207/bulletproof-react/blob/master/docs/api-layer.md, https://github.com/alan2207/bulletproof-react/blob/master/docs/state-management.md

```tsx
// bad
useEffect(() => { setLoading(true); fetch(`/api/users/${id}`).then((r) => r.json()).then(setUser).finally(() => setLoading(false)); }, [id]);
// good
const { data: user, isPending } = useUser(id); // useQuery({ queryKey: ['user', id], queryFn: () => getUser(id) })
```

### REACT-012 — Import across feature boundaries

- **severity**: minor
- **status**: active
- **applies-to**: imports in feature-based projects
- **look-for**: `features/a/...` importing internal files from `features/b/...`, or shared code (`components/`, `lib/`) importing from a feature
- **why**: features become entangled, so one cannot change or be removed without breaking others
- **fix**: compose features at the app/route level; move truly shared code to shared folders; import only a feature's public API
- **sources**: https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md

```tsx
// bad (in features/comments/)
import { DiscussionCard } from '@/features/discussions/components/discussion-card';
// good (in app/routes/discussion.tsx)
<DiscussionView discussionId={id} comments={<CommentsList discussionId={id} />} />
```

### REACT-013 — Global store used for local or server state

- **severity**: suggestion
- **status**: active
- **applies-to**: Redux, Zustand, context stores
- **look-for**: form input, modal open flags or fetched API data put into a global store when only one component tree uses it
- **why**: every update touches global state, causes broad re-renders and duplicates the server cache
- **fix**: keep UI state local (`useState`, lifted to the nearest common parent), server state in the query cache, and only truly global state in the store
- **sources**: https://github.com/alan2207/bulletproof-react/blob/master/docs/state-management.md

```tsx
// bad
dispatch(setNewCommentText(e.target.value));
// good
const [text, setText] = useState('');
```

### REACT-015 — dangerouslySetInnerHTML with untrusted content

- **severity**: blocker
- **status**: active
- **applies-to**: JSX
- **look-for**: `dangerouslySetInnerHTML` with user, CMS or API content that is not sanitised
- **why**: cross-site scripting
- **fix**: render text normally, or sanitise with a vetted library (e.g. DOMPurify) right before rendering
- **sources**: https://github.com/alan2207/bulletproof-react/blob/master/docs/security.md

```tsx
// bad
<div dangerouslySetInnerHTML={{ __html: comment.body }} />
// good
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(comment.body) }} />
```

### REACT-016 — Auth token stored in localStorage

- **severity**: major
- **status**: active
- **applies-to**: authentication code
- **look-for**: access or refresh tokens written to `localStorage` / `sessionStorage` or kept in readable cookies set from JavaScript
- **why**: any XSS can read and steal the token
- **fix**: prefer `HttpOnly`, `Secure`, `SameSite` cookies set by the server; keep short-lived tokens in memory if needed
- **sources**: https://github.com/alan2207/bulletproof-react/blob/master/docs/security.md

```tsx
// bad
localStorage.setItem('token', res.accessToken);
// good
// server sets: Set-Cookie: session=...; HttpOnly; Secure; SameSite=Lax
```

### REACT-017 — Inaccessible interactive element

- **severity**: minor
- **status**: active
- **applies-to**: JSX markup
- **look-for**: `onClick` on `div`/`span` without role and keyboard support, images without `alt`, inputs without a label, icon-only buttons without `aria-label`
- **why**: keyboard and screen-reader users cannot use the feature
- **fix**: use semantic elements (`button`, `a`, `label`), add `alt` text and accessible names
- **sources**: https://github.com/alan2207/bulletproof-react/blob/master/docs/components-and-styling.md

```tsx
// bad
<div onClick={remove}><TrashIcon /></div>
// good
<button type="button" onClick={remove} aria-label="Remove item"><TrashIcon aria-hidden /></button>
```

### REACT-018 — New object or function props break memoised children

- **severity**: suggestion
- **status**: active
- **applies-to**: props passed to `memo` components or hook dependency arrays
- **look-for**: inline objects, arrays or arrow functions passed to a `React.memo` child or used as hook dependencies, in a component that re-renders often
- **why**: a new reference each render defeats memoisation and re-runs effects
- **fix**: hoist constants out of the component, or wrap with `useMemo` / `useCallback` where it matters
- **sources**: https://github.com/alan2207/bulletproof-react/blob/master/docs/performance.md

```tsx
// bad
<Chart options={{ animate: true }} onSelect={(p) => select(p.id)} />
// good
const CHART_OPTIONS = { animate: true };
const onSelect = useCallback((p) => select(p.id), [select]);
<Chart options={CHART_OPTIONS} onSelect={onSelect} />
```

### REACT-020 — Feature has no error boundary

- **severity**: suggestion
- **status**: active
- **applies-to**: routes, feature roots
- **look-for**: a new route or major feature area that renders data-dependent UI with no error boundary around it
- **why**: one rendering error blanks the whole app instead of only the broken part
- **fix**: wrap the feature (or route) in an error boundary with a useful fallback
- **sources**: https://github.com/alan2207/bulletproof-react/blob/master/docs/error-handling.md

```tsx
// bad
<Route path="/reports" element={<ReportsPage />} />
// good
<Route path="/reports" element={<ErrorBoundary fallback={<ReportsError />}><ReportsPage /></ErrorBoundary>} />
```
