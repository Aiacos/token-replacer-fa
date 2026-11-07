# TODO

Open work only. Finished items are removed: `CHANGELOG.md` and git history remember them.

## 🔄 CI/CD and releases

- [ ] Add the `FOUNDRY_PACKAGE_TOKEN` repository secret so releases reach the Foundry package registry. Until then `release.yml` skips the announcement with a warning. Run `gh secret set FOUNDRY_PACKAGE_TOKEN -R Aiacos/token-replacer-fa` with the token from foundryvtt.com → Packages → token-replacer-fa.

## ✨ Features

- [ ] Map the `--trfa-*` colour tokens onto Foundry's light theme. v13 themes UI through the `.themed` class plus a theme class ([13.333 notes](https://foundryvtt.com/releases/13.333)), but the exact class names are undocumented: read them from a real v13/v14 world's DOM before writing the selectors (Constitution, Article VI).
- [ ] Ask Forgotten Adventures whether a Foundry module may search and link Live Gallery tokens. Their license does not cover hotlinking, so nothing is built until they answer.
