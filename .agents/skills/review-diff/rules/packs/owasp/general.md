---
language: general
prefix: GEN
version: 1.1.0
---

# OWASP Cheat Sheets and CWE: General rules

Apply to every reviewed file, in any language. Written in this project's own words; follow the source links for the full background.

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
