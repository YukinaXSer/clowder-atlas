# Data and network behavior

The Lens reads local links and source paragraphs to display research context. Viewing or collecting them does not send anything; they are sent only through an explicit chat or seminar action. Newly saved pending notes include the originating Cat Cafe address in `atlas_source_cafe`, so their original conversation is not inferred on a different connection. Older notes without it are not assigned an origin from their title alone.

Local trial staging backs up and replaces only the three plugin binaries, with local commit/hash receipts. It does not copy or roll back settings, chats or note content.

The connection starts disabled. Local graph, provenance, metadata curation, and Canvas features run inside Obsidian without a remote service.

## Local data

The plugin reads Markdown notes, frontmatter, and link caches to build its views. Explicit curation actions can update frontmatter, create notes, append quoted replies, replace a selected passage after confirmation, or generate Canvas files. A pending note inside the configured pending folder moves to the crystals folder when you crystallize it.

The star chart enumerates Markdown file paths across the vault to show local links. Enumeration does not send those paths or note contents to an external service. The plugin writes a revision to the system clipboard only when you click a copy-revision button; it never reads the clipboard.

The plugin uses Obsidian's vault and file-manager APIs for these writes. It does not open arbitrary files outside your vault. The desktop vault path is used locally to match the Cat Cafe thread list; that filtering does not add the path to an outgoing request. The one kind of request that sends the path is opening a new conversation — for a seminar, or with + in the chat header — described below.

Plugin preferences, summoned companion IDs, failed message content and attachments, quotes from the Cat Cafe waiting to be sent, and revision request targets live in the plugin folder's `data.json`, without encryption. Failed sends remain until you resend, put them back into the composer, or delete them. Revision request records are retained for matching later replies and have no automatic expiry. The operating system, other plugins, and your backup/sync tools may have access to these files.

## Optional requests

After connection is enabled, the plugin reads health, cats, threads, and messages from the configured Cat Cafe API. Roster checks repeat every 30 seconds while connected; open chat also reads its conversation's messages every 5 seconds, and every 1.5 seconds while a cat's reply is being written or just after you send. Avatar URLs use that instance's frontend origin. The client uses the existing Cat Cafe `default-user` convention; it is not a general-purpose authenticated multi-user client. Each request has a time limit, after which the plugin stops waiting for it.

The one-click connection action probes the saved address and these loopback ports: 3004, 3000, 3001, 3005, 4000, 8080. No automatic connection probe runs in a fresh install. User-clicked download/help links open GitHub in your browser; paper links open arXiv.

Sending chat or starting a seminar posts the message to the configured Cat Cafe. Included material is visible to that instance and may be sent to its model providers. Normal note previews are limited to 1,000 characters for chat and 1,500 for seminars. A selected passage is sent in full, with a 90,000-character input limit. Failures can retain that same material locally for recovery.

A seminar starts in a new conversation unless you pick an existing one. A new conversation is first created in the configured Cat Cafe with the desktop vault path as its project, so it is listed with the vault's other conversations, and with a temporary title naming the attached note or passage lines, or the start of the topic. The first cat to answer may rename it. A seminar in an existing conversation posts only the message. + (新开对话) in the chat header, or the New Cat Cafe Conversation command, creates a conversation the same way, titled from the passage attached in the chat or the note being read.

The plugin does not include analytics, advertising requests, remote script execution, or a self-updater. It cannot control the retention, logging, model training policies, or charges of a separately configured service. Connect only to an instance you intend to trust with the material you send.

## Multi-passage research

The unsent passage tray and request-bound source snapshots (selected text, vault-relative paths, and selection positions) persist in unencrypted local `data.json` without automatic expiry. Explicit removal or sending consumes the tray; failed sends and request history are retained. Selecting additional notes does not send them until you send a message or start a seminar. Multi-passage messages include only the selected excerpts and their source labels/relative paths, not surrounding note content. These messages go to the configured Cat Cafe, which may forward them to its AI providers. Saving a reply creates explicit local source links only for the requests that reply identifies.

## Quotes from other Cat Cafe conversations and matter pages

**引猫咖记忆** reads beyond the conversations of this vault: the messages of your other Cat Cafe conversations, and the cafe's matter pages. It uses the routes the cafe's own web app reads them by, and they answer only a request made directly from the computer the cafe runs on.

- **Session.** The first search or read asks the cafe for its session (`/api/session`), as its web app does. The session cookie is kept in memory only, never written to `data.json` or anywhere else, and is sent with these reads alone, not with the roster, your messages or anything else.
- **Search words.** Nothing is searched automatically. The words in the search box are sent to the configured Cat Cafe when you press 搜索 or Enter, and to no one else. Opened from the Lens, the dialog puts the note's title, or the text selected in it, into the box; it is sent only if you search.
- **What is shown.** Results and previews show parts of your other conversations in Obsidian, including your own unrevealed whispers (which cannot be quoted). They are not written to the vault.
- **The basket.** A quote you add keeps the quoted words, its coordinate (the conversation and message ids, or the matter id), its version, a label (the other conversation's title, the speaker, the date) and the cafe address, in `data.json` without encryption, until it is sent or removed. A failed send keeps the quotes it carried until you resend, put back or delete it.
- **Sending.** A message with quotes posts the quoted words to the configured Cat Cafe, into the conversation you send to, which is usually not the one they were said in; that instance may forward them to its model providers. Before sending or resending, the plugin asks the cafe whether each quote can still be read and is unchanged; it sends nothing if not, or if the cafe cannot be asked.
- **Request records.** For matching later replies, the plugin keeps each quote's coordinate, label, version and cafe address with the request, without the quoted words and without expiry.
- **Notes.** A pending note saved from a reply lists, in its `atlas_evidence` property and in a line of its body, each quote's kind, coordinate, label, cafe address, version and the date. The label contains the other conversation's title and the speaker's name. The quoted words are not written into the note.
- **The Lens.** When a note with such evidence is shown, the Lens asks the cafe named in it whether each original can still be read and is unchanged (an answer serves for a minute). A citation from another cafe than the one connected is not asked about.

## Optional Marauder star chart

Opening the star chart makes no network requests. Source passages, shared-source links, contributor markers and dotted trails are derived locally from frontmatter, link caches and existing request records. Trails connect coauthored or maintained notes in note-modification order; they do not record a cat's visits or reading history. Unknown-origin historical coordinates are read-only. Sources from different Cafe addresses never share a passage, even when their ids match.

Selecting a star explicitly checks only that note's Cafe citations, through the same session reads and one-minute cache as the Lens. Previewing a source reads its original on demand. No note body or file path is sent for these checks, and the original text is not saved by the star chart.

Only after you enable **活点** while connected and the chart is visible does it read the project's active execution projection, using one known bound conversation as the route anchor. At most one request is in flight; subsequent reads wait at least ten seconds. Only executions matching the chart's explicitly bound current-Cafe conversations are displayed. A live marker means the bound conversation is active, not that a cat is reading that note. Switching off 活点, hiding or closing the chart, disconnecting or changing Cafe retires the loop and ignores late answers. Unsupported or failed reads leave the local contributor view available. Execution reads reuse the in-memory session cookie described above; no new persistent activity log is created.
