# Security Policy

## 🔒 Supported versions

Only the latest release receives security fixes.

## 🔒 Reporting a vulnerability

Report it privately through [GitHub's private vulnerability reporting](https://github.com/Aiacos/token-replacer-fa/security/advisories/new) (the **Security → Report a vulnerability** tab). Do not open a public issue for a vulnerability.

## 🔒 Guarantees

- Templates render through Handlebars, whose auto-escaping is the XSS boundary.
- Data loaded from IndexedDB or `localStorage` is sanitized before use.
- Fuse.js is validated by shape after it loads from the CDN.
- The module ships with zero runtime dependencies beyond that one CDN load.

## 🔒 Known limits

- Fuse.js loads from the jsDelivr CDN without Subresource Integrity. The shape check catches a broken or replaced library, not a malicious copy that keeps the same shape.
- Stored data is sanitized but has no schema validation.
