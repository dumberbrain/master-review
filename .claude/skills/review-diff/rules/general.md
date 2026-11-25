---
language: general
prefix: GEN
version: 1.1.0
---

# General Review Rules

Apply to every reviewed file, in any language. Prefer a language-specific rule when one fits
better; use a `GEN-*` rule only when no language rule describes the problem.

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

### GEN-013 — Missing or wrong authorization check

- **severity**: major
- **status**: active
- **applies-to**: request handlers, controllers, resolvers, service methods, jobs triggered by users
- **look-for**: a resource loaded, changed or deleted by an id from the request without checking that the caller owns it or may access it; a handler that checks only "is signed in" for an action that needs a role or ownership; a user, tenant, role or price field taken from the request body and trusted; a second path to the same action (bulk, export, import, admin, internal API) with a weaker check than the main one; a query that forgets the tenant filter
- **why**: any signed-in user can read or change other users' or tenants' data by changing an id; broken access control is the most common serious web vulnerability
- **fix**: derive the user and tenant from the authenticated session, never from the request; check ownership or permission for the specific resource on every path, including bulk and export; scope queries by owner or tenant
- **sources**: https://owasp.org/Top10/A01_2021-Broken_Access_Control/, https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html, https://cwe.mitre.org/data/definitions/639.html

```text
bad:  GET /invoices/:id  ->  return db.invoices.find(req.params.id)
good: GET /invoices/:id  ->  return db.invoices.find({ id: req.params.id, ownerId: session.userId }) ?? 404
```

### GEN-014 — Untrusted URL fetched or redirected to

- **severity**: major
- **status**: active
- **applies-to**: HTTP clients, webhooks, URL previews, image or file import, login and logout redirects
- **look-for**: the server making a request to a URL, host or IP that comes from user input (webhook targets, "import from URL", avatar URLs, PDF or preview renderers) without an allowlist; an allowlist checked on the string but bypassed by redirects or by DNS resolving to an internal address; a redirect to a `returnUrl`, `next` or `redirect` parameter without checking that it is a local path or an allowed host
- **why**: SSRF lets an outsider reach internal services and cloud metadata endpoints through your server; an open redirect makes phishing links look like they come from your domain and can leak OAuth codes
- **fix**: allow only known hosts and schemes; resolve the host and reject private, loopback and link-local addresses on every redirect hop, or disable redirects; for redirects accept only relative paths or a fixed list of hosts
- **sources**: https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html, https://cheatsheetseries.owasp.org/cheatsheets/Unvalidated_Redirects_and_Forwards_Cheat_Sheet.html, https://cwe.mitre.org/data/definitions/918.html

```text
bad:  const res = await fetch(req.body.webhookUrl);                 res.redirect(req.query.next);
good: const res = await safeFetch(assertAllowedHost(req.body.webhookUrl)); res.redirect(localPathOr(req.query.next, "/"));
```

### GEN-015 — Untrusted data deserialized into objects

- **severity**: major
- **status**: active
- **applies-to**: request bodies, cookies, queue messages, cache entries, uploaded files and archives
- **look-for**: data from outside the trust boundary passed to a deserializer that can create arbitrary types or run code: Java `ObjectInputStream`, .NET `BinaryFormatter` or `NetDataContractSerializer`, Json.NET `TypeNameHandling` other than `None`, Python `pickle` or `yaml.load` without a safe loader, PHP `unserialize`, YAML loaders with custom tags; archive extraction that writes entries without checking their path (zip slip)
- **why**: the attacker chooses which classes are created, which often leads to remote code execution; zip slip writes files outside the target folder
- **fix**: use data-only formats (JSON into fixed DTOs) and safe loaders; if a type must be chosen, use an explicit allowlist; when extracting archives, resolve each entry path and reject it if it leaves the target folder
- **sources**: https://cheatsheetseries.owasp.org/cheatsheets/Deserialization_Cheat_Sheet.html, https://cwe.mitre.org/data/definitions/502.html, https://cwe.mitre.org/data/definitions/22.html

```text
bad:  var order = (Order)new BinaryFormatter().Deserialize(request.Body);
good: var order = await JsonSerializer.DeserializeAsync<OrderDto>(request.Body);
```

### GEN-016 — Weak randomness or cryptography for a security value

- **severity**: major
- **status**: active
- **applies-to**: tokens, password reset and invite links, session ids, OTP codes, API keys, password storage, signatures, encryption
- **look-for**: a non-cryptographic random generator (`Math.random`, `java.util.Random`, `System.Random`, Go `math/rand`, Python `random`) used for a secret or unguessable value; passwords stored with MD5, SHA-1, SHA-256 or another fast hash instead of a password hash; hand-written crypto, ECB mode, a fixed or reused IV or nonce, a hard-coded key; secrets, tokens or HMACs compared with `==` instead of a constant-time comparison
- **why**: predictable tokens let an attacker guess reset links and sessions; fast hashes are cracked quickly after a database leak; broken modes and reused nonces expose the plaintext
- **fix**: use the platform's cryptographic generator (`crypto.randomBytes`, `SecureRandom`, `RandomNumberGenerator`, `crypto/rand`, `secrets`); store passwords with Argon2id, scrypt or bcrypt; use a vetted library with authenticated encryption (AES-GCM, ChaCha20-Poly1305) and a fresh nonce; compare secrets in constant time
- **sources**: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html, https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html, https://cwe.mitre.org/data/definitions/338.html

```text
bad:  const resetToken = Math.random().toString(36).slice(2);    user.password = sha256(password);
good: const resetToken = crypto.randomBytes(32).toString("hex"); user.password = await argon2.hash(password);
```

### GEN-017 — Sensitive data in logs, errors or responses

- **severity**: major
- **status**: active
- **applies-to**: logging, error handlers, API responses, analytics and tracing
- **look-for**: passwords, tokens, API keys, session cookies, `Authorization` headers, card numbers or personal data written to logs or traces; whole request bodies or headers logged; stack traces, SQL errors or internal paths returned to clients; an entity serialized whole into a response so that fields like `passwordHash`, `resetToken` or other users' data leak
- **why**: logs and traces are read by many people and tools and kept for a long time, so data in them is effectively leaked; detailed errors help attackers map the system
- **fix**: log ids instead of values and redact sensitive fields; return a generic error with a correlation id and keep the details in server logs; return explicit response DTOs that list only the fields the caller may see
- **sources**: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html, https://cheatsheetseries.owasp.org/cheatsheets/Error_Handling_Cheat_Sheet.html, https://cwe.mitre.org/data/definitions/532.html

```text
bad:  log.info("login", { email, password });   return res.json(user);
good: log.info("login", { userId: user.id });   return res.json(toPublicUser(user));
```

### GEN-018 — Security check disabled

- **severity**: major
- **status**: active
- **applies-to**: HTTP and database clients, security middleware, framework configuration
- **look-for**: TLS certificate or host-name verification turned off (`rejectUnauthorized: false`, `NODE_TLS_REJECT_UNAUTHORIZED=0`, `InsecureSkipVerify: true`, a trust-all `TrustManager` or `HostnameVerifier`, a certificate validation callback that returns `true`, `verify=False`); CSRF protection disabled for cookie-authenticated endpoints; CORS that reflects any origin or uses `*` together with credentials; authentication or validation switched off by a debug flag that can reach production
- **why**: each check exists to stop a specific attack; turning it off, often "temporarily" to make something work, lets a network attacker read or change traffic, or lets another site act as the user
- **fix**: keep the check on; trust a specific CA or certificate instead of all; list allowed CORS origins explicitly; tie debug switches to the environment so they cannot be enabled in production
- **sources**: https://cheatsheetseries.owasp.org/cheatsheets/Transport_Layer_Security_Cheat_Sheet.html, https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html, https://cwe.mitre.org/data/definitions/295.html

```text
bad:  https.request(url, { rejectUnauthorized: false })
good: https.request(url, { ca: fs.readFileSync(INTERNAL_CA_PATH) })
```

### GEN-019 — Token or signed message trusted without verification

- **severity**: major
- **status**: active
- **applies-to**: JWT and other bearer tokens, webhooks, signed URLs, OAuth and OIDC callbacks, SAML
- **look-for**: a JWT decoded without verifying the signature, or verified while accepting `alg: none` or the algorithm named in the token header; missing checks of expiry, issuer or audience; a webhook handler that does not verify the provider's signature and timestamp; an OAuth callback without `state` or PKCE checks; a password-reset or invite token that never expires or can be used twice
- **why**: anyone can forge the claims and act as any user, or replay an old message
- **fix**: verify with a vetted library and a fixed algorithm and key; check `exp`, `iss` and `aud`; verify webhook HMACs over the raw body in constant time and reject old timestamps; make one-time tokens expire and invalidate them after use
- **sources**: https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html, https://cheatsheetseries.owasp.org/cheatsheets/OAuth2_Cheat_Sheet.html, https://cwe.mitre.org/data/definitions/347.html

```text
bad:  const claims = jwt.decode(token);
good: const claims = jwt.verify(token, PUBLIC_KEY, { algorithms: ["RS256"], issuer: ISSUER, audience: AUDIENCE });
```

### GEN-020 — Unbounded work from untrusted input

- **severity**: minor
- **status**: active
- **applies-to**: public endpoints, uploads, parsers, queries, login and OTP flows
- **look-for**: a request that controls how much work the server does, with no limit: page size, item count, upload or body size, recursion or nesting depth, archive expansion, or a regular expression with nested quantifiers run on user input (ReDoS); login, OTP, password-reset or invite endpoints with no rate limit or lockout
- **why**: one request can exhaust CPU, memory or disk for all users, and unlimited attempts let an attacker brute-force short codes and passwords
- **fix**: cap sizes, counts and depth at the boundary; use a linear-time regex engine or limit input length first; add rate limits and lockout to authentication flows. Raise to `major` when an anonymous actor can stop a shared service or brute-force a login or OTP
- **sources**: https://cheatsheetseries.owasp.org/cheatsheets/Denial_of_Service_Cheat_Sheet.html, https://owasp.org/www-community/attacks/Regular_expression_Denial_of_Service_-_ReDoS, https://cwe.mitre.org/data/definitions/770.html

```text
bad:  const items = await db.items.find().limit(Number(req.query.limit));
good: const items = await db.items.find().limit(Math.min(parseLimit(req.query.limit), MAX_PAGE_SIZE));
```
