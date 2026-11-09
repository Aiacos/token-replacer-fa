# TODO

Open work only. Finished items are removed: `CHANGELOG.md` and git history remember them.

## 🔄 CI/CD and releases

- [ ] Add the `FOUNDRY_PACKAGE_TOKEN` repository secret so releases reach the Foundry package registry. Until then `release.yml` skips the announcement with a warning. Run `gh secret set FOUNDRY_PACKAGE_TOKEN -R Aiacos/token-replacer-fa` with the token from foundryvtt.com → Packages → token-replacer-fa.

## ✨ Features

- [ ] Ask Forgotten Adventures whether a Foundry module may search and link Live Gallery tokens. Their license does not cover hotlinking, so nothing is built until they answer.
