---
created: 2026-03-01T07:01:00.498Z
title: Guard innerHTML assignments against triple-brace templates
area: security
files:
  - scripts/ui/UIManager.js:156-157
  - scripts/ui/UIManager.js:195-196
---

## Problem

`TokenReplacerDialog._renderHTML()` and `updateContent()` assign rendered Handlebars output to `innerHTML`. Currently safe because all templates use `{{variable}}` (auto-escaped), but if any future template uses `{{{variable}}}` (unescaped), this becomes an XSS vector. The broad attack surface covers all dialog content methods.

## Solution

Add a project convention: never use triple-brace syntax in templates. Consider using `DOMParser` or a sanitizer before `innerHTML` assignment, or add a linting rule to catch `{{{` in `.hbs` files.
