# 0.0.7 — a research Lens, without note-body decorations

- Keep Markdown bodies, Live Preview tables and reading views free of Atlas-injected badges or luminance styling.
- Replace the sidebar metadata dashboard with actual incoming link paragraphs and outgoing source excerpts. Jump to their source positions or add them to the persistent multi-passage tray without leaving the Lens.
- Show derived pending/crystallized insights and conversations backed by exact local request records on the current Cafe. Newly saved insights record the source Cafe address; unknown older origins are not guessed from titles.
- Add note questions, seminars, exact-note star-chart location and explicit pending-note crystallization. Fold memory-type and pinned-star controls into the footer.
- Add explicit local trial staging and rollback commands. Only the three plugin binaries are backed up/restored; settings and notes are preserved. Operator trial and explicit approval precede merging, tagging and release publication.

# 0.0.6 — cross-file passage research

- Collect multiple selections across notes, with numbered source chips, exact-selection deduplication, jump/remove/clear controls and a persistent unsent tray.
- Send cross-referenced questions or start a seminar using comparison, evidence, synthesis and debate presets. New conversations keep the entire tray.
- Multi-passage revisions are copy-only. Single-passage revision checks and editor undo remain available.
- Failed sends retain all selections. Pending notes link the sources of the request a reply answers, using full relative paths to distinguish identical filenames; unrelated active notes and other requests are excluded.
- No new dependencies or network endpoints. Selected excerpts and relative source paths are sent to the configured Cat Cafe; the tray and source snapshots are stored locally. See PRIVACY.md.

# 0.0.5 — a new conversation from the chat

- **＋** in the chat header (or the command **New Cat Cafe Conversation**) opens a conversation of its own in the Cat Cafe and turns the chat to it. Before, only a seminar could open one, so after a seminar on one note, a passage of another note could only be discussed in that seminar's conversation.
- The new conversation is named for the passage attached in the chat (with its lines) or the note being read, such as `💬 新对话 · 《Note》第 3 行`, until the first cat to answer names it. An attached passage stays attached and goes with the first message there.
- It is opened the way a seminar's conversation is: under the vault's path, with an idempotency key (a request resent after a lost answer gets the same conversation back), one at a time, and only turning the chat if the connection is still the one it was opened on.

Privacy: ＋ sends the vault path (as the conversation's project) and the temporary title to the configured Cat Cafe, as a seminar in a new conversation does. See PRIVACY.md.

Install the three individual assets from the same release: `main.js`, `manifest.json`, `styles.css`.

# 0.0.4 — cats' replies appear as they are written

- A cat's reply now shows up in the chat by itself, without switching conversations or refreshing. The Cat Cafe adds a reply as soon as the cat starts, empty, and fills in its words in place until it is done; the chat only looked for new messages, so a reply first seen empty stayed that way. It now notices a reply's words and state changing too.
- While a cat is writing, its bubble says 正在回复… until the first words arrive, then shows them as they grow, marked 回复中…. Saving a reply as a pending note, excerpting it and replacing a passage become available once it is done. A reply that ended short is marked 回复失败, 回复已取消 or 回复中断.
- The conversation is read every 1.5 seconds while a reply is being written and right after you send, otherwise every 5 seconds as before.
- Updates keep your place: if you scrolled up to read, the view stays there; long messages you opened with 展开全文 stay open.

Install the three individual assets from the same release: `main.js`, `manifest.json`, `styles.css`.

# 0.0.3 — seminars in a conversation of their own

- Starting a seminar now asks where it takes place: **🆕 新开对话** (the default) or **💬 用现有对话**. Before, every seminar was posted to the first conversation in the vault's list, whatever the chat panel showed.
- A new conversation is created in the Cat Cafe under the vault's path, so it appears in the chat panel's list, with a temporary title such as `🎓 研讨会 · 《Note》`. The first cat to answer then names it after the discussion, as for conversations started in the Cat Cafe itself.
- An existing conversation defaults to the one the chat panel shows; any other conversation of the vault can be picked.
- If sending fails, the dialog stays open, and starting again reuses the conversation already created for it instead of opening another. Repeated clicks are ignored while a start is under way.
- Creating the conversation carries an idempotency key, as in the Cat Cafe's own new-conversation form: if the cafe's answer is lost and the request is sent again (Obsidian resends an interrupted request), the same conversation comes back instead of a second one.
- The dialog belongs to the Cat Cafe connection it was opened on. If the address changes or the cafe is disconnected while it is open, or while a seminar is being started, it sends nothing more, closes, and asks to be opened again; a seminar already sent stays with the cafe it went to, and the chat panel is not turned to it.
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
