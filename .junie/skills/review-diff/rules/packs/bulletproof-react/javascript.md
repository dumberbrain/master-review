---
language: javascript
prefix: JS
version: 1.0.0
---

# Bulletproof React: JavaScript rules

Rules for `.js`, `.mjs`, `.cjs` and `.jsx` files. Written in this project's own words; follow the source links for the full background.

### JS-008 — HTML built from untrusted data

- **severity**: blocker
- **status**: active
- **applies-to**: DOM manipulation
- **look-for**: `innerHTML`, `outerHTML`, `insertAdjacentHTML` or `document.write` with values from users, URLs or APIs
- **why**: cross-site scripting: attackers run code in your users' sessions
- **fix**: use `textContent` / DOM APIs, or sanitise with a vetted library (e.g. DOMPurify) when HTML is required
- **sources**: https://github.com/alan2207/bulletproof-react/blob/master/docs/security.md

```js
// bad
list.innerHTML += `<li>${comment.text}</li>`;
// good
const li = document.createElement('li');
li.textContent = comment.text;
list.append(li);
```
