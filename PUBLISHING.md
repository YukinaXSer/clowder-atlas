# Publishing

The initial release is hosted at [YukinaXSer/clowder-atlas](https://github.com/YukinaXSer/clowder-atlas), under the MIT license. Repository publication and the Community directory listing are separate steps.

## Local trial before every publication

Starting with the Lens redesign, the operator must try the development build locally and explicitly approve publication before a change is merged into `main`, tagged or published as a GitHub Release. Automated checks and an independent review prepare a candidate; they do not replace that approval. Keep the candidate on its feature branch until then.

1. Build and test the feature checkout, validate the actual UI in an isolated synthetic Obsidian vault, and obtain a non-author review of the exact committed candidate.
2. Install that candidate with `npm run stage:local -- --vault /absolute/path/to/vault` (repeat `--vault` for each intended local vault). This command requires a clean committed checkout and matching build outputs. It backs up the three previously installed files in the plugin's `.backup-last-release/` directory, then updates only `main.js`, `styles.css` and `manifest.json`. It records the candidate commit and hashes in `.atlas-local-stage.json`. It never copies or restores `data.json` or note content.
3. Ask the operator to reload the plugin or reopen Obsidian, with concrete short steps for trying the changed behavior. The script installs binaries; it does not attach to or restart the user's running Obsidian process. Further iterations keep the same stable backup.
4. Roll back when needed with `npm run rollback:local -- --vault /absolute/path/to/vault`. It restores the verified stable binary backup and preserves settings changed during the trial. Both commands preflight all named vaults before writing.
5. Wait for the operator's explicit approval to publish this candidate. If the candidate changes afterward, have the operator try the changed version again. Only then follow the release steps below.
6. After approved publication, verify the downloaded release against the candidate, synchronize its binaries, and archive the local staging receipt and stable backup before starting the next release's trial. Do not silently replace a trial's baseline with another development build.

Do not commit local staging receipts, vault paths, backup directories or user data to this repository. Local trial, GitHub publication and Community directory cache availability are distinct states; report the one actually verified.

## Approved release

1. Run `npm ci --ignore-scripts`, `npm run build`, and `npm test`. Commit the generated `package-lock.json` even though the project has no npm dependencies, so the directory can select its npm build-verification path. Inspect `dist/`; it must contain only `main.js`, `manifest.json`, and `styles.css`.
2. Publish this source repository, with the README, LICENSE, manifest, and versions file at its root. Never include a vault, `data.json`, private notes, or local acceptance logs.
3. Create a GitHub release whose tag is exactly the current manifest version, without a `v` (for example, **0.0.2**). Attach the three individual files from `dist/`. Use the matching section of `RELEASE_NOTES.md` for the release text.
4. Sign in to the [Obsidian Community directory](https://community.obsidian.md), connect the GitHub account that owns the repository, and add the plugin. Follow the directory's current review feedback before publishing the listing.

The directory submission is separate from the GitHub release. Local tests do not establish acceptance by Obsidian's scanner. Future releases must keep package, manifest, and release-tag versions aligned; update `versions.json` when the compatibility floor changes.

Checked against the official [submission guide](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin), [developer policies](https://docs.obsidian.md/community-directory/developer-policies), [plugin requirements](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins), and [version selection](https://docs.obsidian.md/Reference/Versions) on 2026-11-03. Recheck these sources before an actual submission; do not assume the older releases-repository PR workflow.
