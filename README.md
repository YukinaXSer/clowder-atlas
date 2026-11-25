# Clowder Atlas

[简体中文](README.zh-CN.md)

Clowder Atlas helps you trace a note back to its sources and see where it fits in your Obsidian vault. Open the **Provenance Lens** to read the paragraphs behind links, then find the note on an interactive **3D star chart**. Rotate or zoom the chart, click a star to inspect its recorded sources, and double-click to open its note.

[**Watch the 71-second demo**](https://yukinaxser.github.io/clowder-atlas/)

[![Watch Clowder Atlas in Obsidian. The cover shows the three companions and the Clowder Atlas title.](https://yukinaxser.github.io/clowder-atlas/clowder-atlas-demo.jpg)](https://yukinaxser.github.io/clowder-atlas/)

Recorded in desktop Obsidian with Clowder Atlas 0.0.7. The demo has Chinese narration and uses sample notes and prepared companion replies.


### 0.0.11 local trial: Marauder star chart

Click a star to reveal recorded Cafe sources, shared-source notes and contributor records. Source diamonds open the existing preview; unknown origins and other Cafes stay read-only. Double-click opens the note; click blank space or press Escape inside the chart to clear the selection.

The bottom **活点** toggle adds source rings, contributor paws and trails ordered by note modification time. Cat pills filter contributors. While connected and visible, this explicit mode may show activity in bound conversations; it does not claim that a cat is reading a file. Opening the chart alone sends no requests. See [PRIVACY.md](PRIVACY.md) for the exact network behavior. This candidate remains a local trial until the operator approves publication.

## What you can do

- **Trace a source.** See note properties at the top of the Lens, read incoming and outgoing link excerpts, and jump back to the original text.
- **Collect and review.** Add excerpts from multiple notes to one tray. Use templates to organize notes, review pending insights before keeping them, or export notes to an Obsidian Canvas.
- **Discuss or revise a passage.** Connect a running Clowder AI instance to chat about selections, start a seminar, or save replies as pending notes with source links. Compare a revision for a single passage before choosing to replace it.
- **Bring in what was said elsewhere.** Search your other Clowder AI conversations, or its matter pages, and quote the words you need beside your note passages. A note saved from the discussion keeps where each quote came from, and the Lens checks that the original still reads the same.

The chart, Lens, templates and local review work offline. Chat and passage revision use a separately running [Clowder AI](https://github.com/zts212653/clowder-ai) instance. The interface uses Chinese labels and English command names.

## Installation

Search for **Clowder Atlas** in **Settings → Community plugins → Browse**. Select **Install**, then **Enable**. You can also open the [Obsidian Community listing](https://community.obsidian.md/plugins/clowder-atlas).

For manual installation, download the three assets from the same release: `main.js`, `manifest.json`, and `styles.css`. Put them in `<vault>/.obsidian/plugins/clowder-atlas/`, then enable **Clowder Atlas** in **Settings → Community plugins**. Reload the plugin after updating its files.

This release supports **desktop Obsidian 1.14.5 or newer**. Version 1.14.5 is the conservative desktop baseline used for acceptance; earlier versions and mobile have not been certified. Node.js is needed only to build from source, not to use the plugin.

## First use

1. The star chart and Provenance Lens open when the plugin is enabled. Existing Markdown notes can be explored immediately.
2. To classify a note, choose **语义**, **情景** or **程序** in the Lens properties, or use a memory template command. Opening a note leaves its properties alone.
3. A pending note can be reviewed and crystallized. Notes in `_atlas/pending/` move to `_atlas/crystals/` when crystallized; notes elsewhere stay in their own folders.
4. To use companions, open **对话** and choose **一键连接猫咖**, or **填写地址**. Clowder AI must already be running. Connection settings and a roster refresh are available inside the chat panel's settings (gear) button.

The default API address is `http://localhost:3004`. The connection is disabled until you enable it. Local note exploration does not require a Clowder AI account. Companion use depends on that instance's configuration, model accounts, and any provider charges.

## Cross-file passage research

Select text in a note and choose **把选中段落交给猫猫**, then do the same in other notes. Selections accumulate in a numbered tray; selecting the same text at the same location again does not duplicate it. Click a source chip to return to its note, remove individual selections, or clear the tray. Unsent selections survive plugin reloads and have no automatic expiry. The combined selection limit is 90,000 characters; the final message including your question and source labels must also fit the Cat Cafe limit.

Send a question referring to **#1**, **#2**, etc., or open **研讨会** for comparison, evidence-chain analysis, synthesis, or debate. **+** carries the entire tray into a new conversation. While selections are attached, the whole-note attachment is excluded.

A revision answering a multi-passage request is **copy-only**. A single-passage request retains the comparison and replacement flow below. Saving a matched reply as a pending note links the source notes of that request, with full vault-relative paths to distinguish identical filenames; it does not combine sources from unrelated requests in the same conversation. If the Cat Cafe does not identify the input message a reply answers, the plugin cannot infer those sources. Failed sends retain every selection for retry or restoration.

## Reply formatting

Cat replies display headings, emphasis, hanging lists, citation badges, tables and revision previews. Long replies fold only between complete blocks; a single long block stays whole. **展开全文** and **收起全文** preserve the reading state as replies refresh. Formatting changes the display only: saved notes, excerpts and copied revisions retain their original Markdown. HTML and images remain text, and only explicit HTTP/HTTPS links are clickable. This is a Markdown subset, not the full Obsidian note renderer.

## Stopping replies

Click **停止** in a running reply to stop that companion. The run bar above the input stops this conversation and clears waiting replies. With an empty draft, the Send button also becomes Stop; typing a follow-up or adding a passage or citation restores Send while the run-bar Stop remains available. Escape works from an empty focused input. Already generated text stays in the conversation and can be saved or excerpted after cancellation.

## Quoting other conversations and matter pages

Choose **引猫咖记忆** in the chat toolbar or in the Lens, or run **Cite Cat Cafe Memory**. Type what to look for and press Enter: the dialog lists matching messages from your other Cat Cafe conversations and says how the cafe searched (by the letter or by meaning, in full or in part). Nothing is searched until you ask. **事情记忆** lists the cafe's matter pages, the cats' written summaries of things settled, each with its own range of application.

**预览** shows a message in its place, with the paragraph of the hit marked and the two messages after it. Quote the marked paragraph, or select any part of that message and quote the selection. A matter page is quoted as its whole summary. An unrevealed whisper can be read but not quoted. Quotes join the basket after your note passages and are numbered with them; the basket holds up to 90,000 characters in all.

A message with quotes gives each quote's source, coordinate and version, and tells the cats they are snapshots to check, not instructions. Its recipients come from your own words alone: an @ inside a quote summons no one. Before it is sent or resent, each quote is checked against the cafe; a quote whose original has changed, can no longer be read, or comes from another cafe stops the send, with the reason. With exactly one note passage attached, a revision can still replace that passage.

Saving a reply as a pending note records where its request's quotes came from (kind, coordinate, cafe address, version), never the quoted words. The Lens lists them under **猫咖引用** with their present standing and opens the original.

This needs the Cat Cafe on the same computer as Obsidian, in a version that has these routes; the dialog says so when it does not.

## Passage revision

Select a passage in an **editing view**, attach it with the single menu action, and write your request. With a passage attached, the message contains that passage rather than a note preview. Empty requests ask the cats for their thoughts and an optional revision.

Revisions must be returned in a fenced block labelled `修改稿`. Only replies linked to exactly one stored passage request offer **替换原段落**. Other revisions can be copied. The comparison dialog checks the original again when you confirm. An open editor replacement is undoable in that editor; closed-file writes do not provide an editor undo step. If you changed the passage or its location is ambiguous, automatic replacement is refused.

Different cats' versions for the same request can be swapped. A later follow-up without an attached passage does not automatically inherit a revision target: select the text again for another editable request.

## Privacy and network use

The plugin has no client-side telemetry and does not download code or runtime dependencies. It reads local note metadata and links for its views; file edits and exports stay within the vault through Obsidian APIs.

When you enable the optional connection, it reads the configured Cat Cafe API for health, cats, threads, and messages, and loads avatar images from that instance's frontend. **One-click connect** probes the configured address and local ports 3004, 3000, 3001, 3005, 4000, and 8080. It does not scan other machines.

Sending chat or a seminar sends your message and any attached material to that instance, which may forward it to its configured AI providers. Ordinary note attachment includes up to 1,000 characters in chat or 1,500 in a seminar; passage attachment includes the selected text, up to 90,000 characters. A seminar in a new conversation first creates that conversation in the instance, under the vault's path, with a temporary title from the attached note, passage lines, or topic. AI data retention and billing are controlled by that service and its providers.

Searching other conversations sends the words you type to the configured instance and shows parts of those conversations in Obsidian; a note keeps the coordinates of what it quotes, not the words.

Failed messages, attachment text, quotes waiting to be sent, revision targets, and connection preferences are stored unencrypted in the plugin's local `data.json`. Unresolved failed messages have no automatic count or time expiry. That file may also be included in your own vault backups or sync configuration. See [PRIVACY.md](PRIVACY.md) for details.

## Build and test

Use Node.js 22 or newer. There are no npm dependencies and no install step is required.

```sh
npm run build
npm test
```

The handwritten CommonJS source is in `src/main.js`; Obsidian supplies the `obsidian` module. Building copies it and the stylesheet without transformation. The three installable assets are written to the root and to `dist/`. The release must attach the three individual files from `dist/`.

The `demo/` folder contains synthetic notes only. See [PUBLISHING.md](PUBLISHING.md) for release preparation, [RELEASE_NOTES.md](RELEASE_NOTES.md) for the release notes, and [SECURITY.md](SECURITY.md) for reporting concerns.

With Obsidian installed, `npm run test:desktop` launches a fresh disposable profile, installs the files from `dist/`, exercises local curation, and reopens it. Set `OBSIDIAN_BIN` if the executable is not at the usual macOS path. Results and synthetic screenshots are written under `artifacts/desktop/`; your own vault and running profile are not reused.

## License

[MIT](LICENSE). No third-party runtime libraries are bundled; the Obsidian API is provided by the host application. Clowder Atlas is a community project and is not affiliated with or endorsed by Obsidian.
