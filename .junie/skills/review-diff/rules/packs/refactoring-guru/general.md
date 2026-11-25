---
language: general
prefix: GEN
version: 1.1.0
---

# Refactoring.Guru and SourceMaking: General rules

Apply to every reviewed file, in any language. Written in this project's own words; follow the source links for the full background.

### GEN-001 — Function grows too long

- **severity**: minor
- **status**: active
- **applies-to**: functions, methods
- **look-for**: a changed function that now exceeds roughly 40–50 lines or mixes several steps (validate, load, transform, save, notify) in one body
- **why**: long functions hide intent, are hard to test in isolation and attract more unrelated changes
- **fix**: extract each step into a well-named function; keep the original as a short coordinator
- **sources**: https://refactoring.guru/smells/long-method, https://refactoring.guru/extract-method

```text
bad:  handleOrder() { 60 lines: parse input, check stock, compute tax, write DB, send mail }
good: handleOrder() { const o = parse(input); ensureInStock(o); const t = taxFor(o); save(o, t); notify(o); }
```

### GEN-002 — Class or module takes on too many responsibilities

- **severity**: minor
- **status**: active
- **applies-to**: classes, modules, services, components
- **look-for**: new fields or methods added to a type that already handles unrelated concerns (e.g. persistence, formatting and HTTP in one class); file growing past several hundred lines
- **why**: large classes change for many reasons, so every edit risks breaking another feature
- **fix**: split by responsibility (extract class / module); move the new behaviour to where its data lives
- **sources**: https://refactoring.guru/smells/large-class, https://sourcemaking.com/antipatterns/the-blob

```text
bad:  UserService { register(), hashPassword(), renderWelcomeEmail(), exportCsv() }
good: UserService { register() }  PasswordHasher { hash() }  WelcomeEmail { render() }  UserCsvExporter { export() }
```

### GEN-003 — Long or growing parameter list

- **severity**: suggestion
- **status**: active
- **applies-to**: function and constructor signatures
- **look-for**: a signature with more than about four parameters, several of the same type, or boolean flags that switch behaviour
- **why**: callers mix up argument order, and flag parameters mean the function does two jobs
- **fix**: group related values into a parameter object; split flag-driven functions into two named functions
- **sources**: https://refactoring.guru/smells/long-parameter-list, https://refactoring.guru/introduce-parameter-object

```text
bad:  createUser(name, email, phone, city, zip, isAdmin, sendMail)
good: createUser(profile: UserProfile, options: CreateUserOptions)
```

### GEN-004 — Duplicated logic

- **severity**: minor
- **status**: active
- **applies-to**: any code
- **look-for**: added code that repeats an existing block in the diff or the same file with only names or literals changed
- **why**: fixes must be applied in several places and copies drift apart over time
- **fix**: extract the shared part into one function and pass the differences as parameters
- **sources**: https://refactoring.guru/smells/duplicate-code

```text
bad:  priceA = base * 1.18 + shipping(a);   priceB = base * 1.18 + shipping(b);
good: const withTax = (base, item) => base * TAX_RATE + shipping(item);
```

### GEN-005 — Dead or commented-out code

- **severity**: minor
- **status**: active
- **applies-to**: any code
- **look-for**: added commented-out code blocks, unreachable branches, unused variables, parameters, imports or private functions
- **why**: dead code misleads readers and survives refactors that should have removed it; version control already keeps history
- **fix**: delete it; if it must come back later, reference the commit or ticket instead
- **sources**: https://refactoring.guru/smells/dead-code, https://sourcemaking.com/antipatterns/lava-flow

```text
bad:  // const legacyTotal = computeOld(items);
      // if (useLegacy) return legacyTotal;
good: (lines removed)
```

### GEN-006 — Magic numbers and strings

- **severity**: suggestion
- **status**: active
- **applies-to**: any code
- **look-for**: unexplained literals in logic (timeouts, limits, status codes, role names, tax rates) that are not obvious from context
- **why**: the meaning is lost, and changing the value means hunting for every copy
- **fix**: replace with a named constant, enum or configuration value
- **sources**: https://refactoring.guru/replace-magic-number-with-symbolic-constant

```text
bad:  if (attempts > 5) sleep(86400000)
good: if (attempts > MAX_LOGIN_ATTEMPTS) sleep(LOCKOUT_DURATION_MS)
```

### GEN-007 — Unclear or misleading names

- **severity**: suggestion
- **status**: active
- **applies-to**: variables, functions, types, files
- **look-for**: new names such as `data`, `tmp`, `obj`, `handle2`, single letters outside short loops, names whose meaning contradicts what the code does, or inconsistent naming with the surrounding code
- **why**: readers have to reverse-engineer intent; wrong names cause wrong changes
- **fix**: rename to describe what the value is or what the function does, using the project's existing vocabulary
- **sources**: https://refactoring.guru/rename-method

```text
bad:  const d = getData(); process2(d);
good: const unpaidInvoices = fetchUnpaidInvoices(); sendReminders(unpaidInvoices);
```

### GEN-008 — Errors swallowed or hidden

- **severity**: major
- **status**: active
- **applies-to**: error handling
- **look-for**: empty catch blocks, catches that only log and continue as if nothing happened, ignored error return values, or returning a default value that hides a failure
- **why**: failures become silent data corruption or confusing behaviour far from the cause
- **fix**: handle the specific error, or let it propagate with context; log with enough detail to act on
- **sources**: https://refactoring.guru/replace-error-code-with-exception, https://sourcemaking.com/antipatterns/software-development-antipatterns

```text
bad:  try { save(order) } catch (e) { }
good: try { save(order) } catch (e) { throw new SaveOrderError(order.id, e) }
```

### GEN-009 — Secret or credential in code

- **severity**: blocker
- **status**: active
- **applies-to**: any file
- **look-for**: added API keys, passwords, tokens, private keys, connection strings with passwords, or real personal data in code, config or test fixtures
- **why**: anything committed is copied to every clone and CI log and must be treated as leaked
- **fix**: remove it, rotate the secret, and load it from environment variables or a secret store
- **sources**: https://sourcemaking.com/antipatterns/software-development-antipatterns

```text
bad:  const API_KEY = "sk_live_51H...";
good: const API_KEY = process.env.PAYMENT_API_KEY;
```

### GEN-010 — External input used without validation

- **severity**: major
- **status**: active
- **applies-to**: request handlers, CLI input, file and message parsing, database queries
- **look-for**: user or network input concatenated into SQL, shell commands, file paths, HTML or URLs, or used without checking type, range or size
- **why**: leads to injection, path traversal, XSS and crashes on unexpected input
- **fix**: validate at the boundary; use parameterised queries, argument arrays and encoding APIs instead of string building
- **sources**: https://sourcemaking.com/antipatterns/software-development-antipatterns

```text
bad:  db.query("SELECT * FROM users WHERE id = " + req.query.id)
good: db.query("SELECT * FROM users WHERE id = $1", [parseId(req.query.id)])
```

### GEN-011 — New logic without tests

- **severity**: minor
- **status**: active
- **applies-to**: merge requests that add or change behaviour
- **look-for**: new branches, calculations or bug fixes in production code while the diff contains no new or changed tests, in a project that has tests
- **why**: untested changes regress silently, and a bug fix without a test can come back
- **fix**: add a test that fails without the change and passes with it; cover the new edge cases
- **sources**: https://refactoring.guru/refactoring/how-to

```text
bad:  diff changes discount calculation, no test files touched
good: diff also adds "applies 10% discount above 100" and "no discount at exactly 100" tests
```

### GEN-012 — Feature envy

- **severity**: suggestion
- **status**: active
- **applies-to**: methods, functions
- **look-for**: a new method that mostly reads or changes fields of another object (many `other.x`, `other.y` accesses) rather than its own
- **why**: behaviour ends up far from its data, so changes to that data break distant code
- **fix**: move the method (or the part that uses the other object) onto the object that owns the data
- **sources**: https://refactoring.guru/smells/feature-envy, https://refactoring.guru/move-method

```text
bad:  invoiceTotal(order) { return order.items.sum(i => i.price * i.qty) - order.discount + order.shipping }
good: order.total()
```

## Security

GEN-009, GEN-010 and GEN-013 to GEN-020 are security rules. They are judged by a stricter bar
than the rest, because a false security alarm costs as much reviewer time as a real one.

Report a security finding only when you can name the whole path, from the code you can see:

1. **who** — the less trusted actor (anonymous user, signed-in user, another tenant, a webhook
   sender, a file or message from outside);
2. **what they control** — the input or action;
3. **which control fails** — the check that is missing, wrong or bypassable;
4. **what they gain** — the concrete result for another user, tenant or the system (read or
   change data they should not, run code, take over an account, stop a shared service).

Do not report:

- a missing best practice when another visible layer already blocks the attack. That is a
  hardening note: use `suggestion` at most;
- an actor harming only themselves, or doing what their own role already allows;
- guesses about the deployment (proxy, gateway, framework middleware, cloud policy) that the
  diff and repository do not show. If the outcome depends on such a fact, say exactly which
  fact the author must check, and lower the severity one step;
- an impact stronger than the code supports. A parser error is not remote code execution.

Severity follows the demonstrated impact, not the rule's name:

| Severity | Security meaning |
|-|-|
| `blocker` | an anonymous actor can run code, read or change the whole data store, or take over any account; a committed live secret |
| `major` | an actor fully defeats an explicit control: authentication bypass, access to another user's or tenant's data, stored script injection that runs for other users, code execution for a signed-in user |
| `minor` | a real boundary break with a small blast radius, unusual preconditions, or limited to a few resources; disclosure of non-secret internals |
| `suggestion` | hardening with no reachable path today |

Write the comment so the author can verify it: name the actor, the input, the line where the
check is missing, and the smallest fix at the last trusted decision point. Never put a real
secret, token or personal data in a comment, not even as an example. Prefer a language rule
(for example `JS-009`, `REACT-016`) when it describes the problem exactly.
