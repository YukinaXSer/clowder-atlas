# 0.0.3 — seminars in a conversation of their own

- Starting a seminar now asks where it takes place: **🆕 新开对话** (the default) or **💬 用现有对话**. Before, every seminar was posted to the first conversation in the vault's list, whatever the chat panel showed.
- A new conversation is created in the Cat Cafe under the vault's path, so it appears in the chat panel's list, with a temporary title such as `🎓 研讨会 · 《Note》`. The first cat to answer then names it after the discussion, as for conversations started in the Cat Cafe itself.
- An existing conversation defaults to the one the chat panel shows; any other conversation of the vault can be picked.
- If sending fails, the dialog stays open, and starting again reuses the conversation already created for it instead of opening another. Repeated clicks are ignored while a start is under way.
- When the chat panel is switched to another conversation (by a seminar or another entry point), the previous conversation's messages leave the screen before the new ones load.

Privacy: a seminar in a new conversation sends the vault path (as the conversation's project) and the temporary title to the configured Cat Cafe. See PRIVACY.md.

Install the three individual assets from the same release: `main.js`, `manifest.json`, `styles.css`.

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
