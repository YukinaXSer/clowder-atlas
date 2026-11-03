# Publishing

The initial release is hosted at [YukinaXSer/clowder-atlas](https://github.com/YukinaXSer/clowder-atlas), under the MIT license. Repository publication and the Community directory listing are separate steps.

1. Run `npm ci --ignore-scripts`, `npm run build`, and `npm test`. Commit the generated `package-lock.json` even though the project has no npm dependencies, so the directory can select its npm build-verification path. Inspect `dist/`; it must contain only `main.js`, `manifest.json`, and `styles.css`.
2. Publish this source repository, with the README, LICENSE, manifest, and versions file at its root. Never include a vault, `data.json`, private notes, or local acceptance logs.
3. Create a GitHub release whose tag is exactly the current manifest version, without a `v` (for example, **0.0.2**). Attach the three individual files from `dist/`. Use the matching section of `RELEASE_NOTES.md` for the release text.
4. Sign in to the [Obsidian Community directory](https://community.obsidian.md), connect the GitHub account that owns the repository, and add the plugin. Follow the directory's current review feedback before publishing the listing.

The directory submission is separate from the GitHub release. Local tests do not establish acceptance by Obsidian's scanner. Future releases must keep package, manifest, and release-tag versions aligned; update `versions.json` when the compatibility floor changes.

Checked against the official [submission guide](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin), [developer policies](https://docs.obsidian.md/community-directory/developer-policies), [plugin requirements](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins), and [version selection](https://docs.obsidian.md/Reference/Versions) on 2026-11-03. Recheck these sources before an actual submission; do not assume the older releases-repository PR workflow.
