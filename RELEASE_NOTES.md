# 0.0.2 — directory metadata and build verification

- Remove the optional author URL, which incorrectly pointed to this plugin's repository. The author name remains Clowder AI.
- Include a standard npm lockfile for the dependency-free project, so the directory can attempt build verification with `npm ci`.
- Clarify local Markdown-path enumeration and user-triggered, write-only clipboard access in the privacy documentation.

The plugin's JavaScript, stylesheet, minimum supported Obsidian version, and runtime behavior are unchanged from 0.0.1. Existing CSS and behavior recommendations remain for review; this release does not claim artifact attestations or official review approval.

Install the three individual assets from the same release: `main.js`, `manifest.json`, `styles.css`.

# 0.0.1 — first public release

The first public version starts at 0.0.1. Its feature code and stylesheet match the locally accepted 0.8.16 development implementation.

- Explore linked Markdown notes in the memory star chart and inspect provenance in the Lens.
- Curate draft, pending, and crystallized notes and export Atlas notes to Canvas.
- Optionally connect a Clowder AI instance for companion chat and seminars.
- Attach a selected passage through one action. Tell the companions whether to discuss or revise it; compare a correctly associated revision before applying it.
- Keep failed messages for explicit recovery, without an automatic retention cap.

Packaging adds public documentation, privacy disclosures, an MIT license, source-based deterministic builds, clean release assets, and local validation. The manifest uses a conservative desktop Obsidian 1.14.5 baseline instead of promising unverified 1.4.0 compatibility. The old, unverified author profile link is omitted.

The UI currently includes Chinese labels. Mobile and earlier desktop versions are not certified. Companion integration depends on a separately running Cat Cafe and its model configuration. Model adherence to the revision format is not guaranteed by the plugin's fixture tests.

Install the three individual assets from the same release: `main.js`, `manifest.json`, `styles.css`.
