---
language: go
prefix: GO
version: 1.0.0
---

# Refactoring.Guru and SourceMaking: Go rules

Rules for `.go` files. Written in this project's own words; follow the source links for the full background.

### GO-009 — Large interface defined by the producer

- **severity**: suggestion
- **status**: active
- **applies-to**: interface declarations
- **look-for**: a new interface with many methods declared next to its only implementation, or consumers depending on methods they never call
- **why**: makes testing and swapping implementations hard; Go interfaces work best small and owned by the consumer
- **fix**: declare small interfaces (1–3 methods) where they are used; return concrete types
- **sources**: https://refactoring.guru/design-patterns/adapter/go/example, https://refactoring.guru/smells/refused-bequest

```go
// bad
type UserService interface { Create(); Get(); Update(); Delete(); List(); Export(); Import() }
// good (in the package that needs it)
type userGetter interface { Get(ctx context.Context, id int) (*User, error) }
```

### GO-010 — Side effects in init()

- **severity**: minor
- **status**: active
- **applies-to**: `func init()`
- **look-for**: network or database connections, reading files or env-dependent setup, or registering global state in `init`
- **why**: runs on import, cannot return errors, and makes tests and tools that import the package slow or flaky
- **fix**: do setup in an explicit constructor called from `main`
- **sources**: https://refactoring.guru/design-patterns/singleton/go/example

```go
// bad
var db *sql.DB
func init() { db, _ = sql.Open("postgres", os.Getenv("DSN")) }
// good
func NewStore(dsn string) (*Store, error) { db, err := sql.Open("postgres", dsn); ... }
```

### GO-011 — Package-level mutable state

- **severity**: minor
- **status**: active
- **applies-to**: package variables
- **look-for**: new exported or unexported package-level `var` that is modified at runtime (caches, clients, config)
- **why**: hidden coupling between callers, races, and tests that affect each other
- **fix**: put the state in a struct created by a constructor and pass it where needed
- **sources**: https://refactoring.guru/design-patterns/singleton/go/example

```go
// bad
var cache = map[string]Item{}
func Get(k string) Item { return cache[k] }
// good
type Cache struct { mu sync.RWMutex; items map[string]Item }
func NewCache() *Cache { return &Cache{items: map[string]Item{}} }
```

### GO-012 — Constructor with many parameters

- **severity**: suggestion
- **status**: active
- **applies-to**: `New...` functions
- **look-for**: constructors with many positional parameters, several of the same type, or frequent zero values passed for optional settings
- **why**: call sites are unreadable and every new option breaks all callers
- **fix**: use a config struct or functional options (`New(addr string, opts ...Option)`)
- **sources**: https://refactoring.guru/design-patterns/builder/go/example

```go
// bad
srv := NewServer(":8080", 30, 60, true, false, nil)
// good
srv := NewServer(":8080", WithReadTimeout(30*time.Second), WithTLS(cfg))
```

### GO-013 — defer inside a loop

- **severity**: minor
- **status**: active
- **applies-to**: loops
- **look-for**: `defer f.Close()` (or unlock, cancel) inside a `for` loop in a long-running function
- **why**: deferred calls run only when the function returns, so resources pile up for the whole loop
- **fix**: move the loop body into a helper function, or close explicitly at the end of each iteration
- **sources**: https://refactoring.guru/extract-method

```go
// bad
for _, p := range paths { f, _ := os.Open(p); defer f.Close(); process(f) }
// good
for _, p := range paths { if err := processFile(p); err != nil { return err } }
```
