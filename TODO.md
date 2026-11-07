# TODO

Open work only. Finished items are removed: `CHANGELOG.md` and git history remember them.

## 🔄 CI/CD and releases

- [ ] Add the `FOUNDRY_PACKAGE_TOKEN` repository secret so releases reach the Foundry package registry. Until then `release.yml` skips the announcement with a warning.
- [ ] Decide how to protect `main` and `develop`. Neither has branch protection, so a failing change can still be pushed. `release.yml` pushes its release commit directly to `main`, so plain protection would break it unless that push is allowed through a bypass or the release flow changes.

## 🔒 Security

- [ ] Enable GitHub private vulnerability reporting, then update the reporting section of `SECURITY.md`.

## 🧹 Repository hygiene

- [ ] Decide whether `.planning/` (110 tracked files of planning state) stays in version control. Constitution Article VIII.1 says session state does not belong there.
- [ ] Decide whether `MIGRATION_V13.md` is still needed now that v13 is the supported floor.

## ✨ Features

- [ ] Ask Forgotten Adventures whether a Foundry module may search and link Live Gallery tokens. Their license does not cover hotlinking, so nothing is built until they answer.
