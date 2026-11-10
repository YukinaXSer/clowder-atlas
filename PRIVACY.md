# Data and network behavior

The Lens reads local links and source paragraphs to display research context. Viewing or collecting them does not send anything; they are sent only through an explicit chat or seminar action. Newly saved pending notes include the originating Cat Cafe address in `atlas_source_cafe`, so their original conversation is not inferred on a different connection. Older notes without it are not assigned an origin from their title alone.

Local trial staging backs up and replaces only the three plugin binaries, with local commit/hash receipts. It does not copy or roll back settings, chats or note content.

The connection starts disabled. Local graph, provenance, metadata curation, and Canvas features run inside Obsidian without a remote service.

## Local data

The plugin reads Markdown notes, frontmatter, and link caches to build its views. Explicit curation actions can update frontmatter, create notes, append quoted replies, replace a selected passage after confirmation, or generate Canvas files. A pending note inside the configured pending folder moves to the crystals folder when you crystallize it.

The star chart enumerates Markdown file paths across the vault to show local links. Enumeration does not send those paths or note contents to an external service. The plugin writes a revision to the system clipboard only when you click a copy-revision button; it never reads the clipboard.

The plugin uses Obsidian's vault and file-manager APIs for these writes. It does not open arbitrary files outside your vault. The desktop vault path is used locally to match the Cat Cafe thread list; that filtering does not add the path to an outgoing request. The one kind of request that sends the path is opening a new conversation — for a seminar, or with ＋ in the chat header — described below.

Plugin preferences, summoned companion IDs, failed message content and attachments, and revision request targets live in the plugin folder's `data.json`, without encryption. Failed sends remain until you resend, put them back into the composer, or delete them. Revision request records are retained for matching later replies and have no automatic expiry. The operating system, other plugins, and your backup/sync tools may have access to these files.

## Optional requests

After connection is enabled, the plugin reads health, cats, threads, and messages from the configured Cat Cafe API. Roster checks repeat every 30 seconds while connected; open chat also reads its conversation's messages every 5 seconds, and every 1.5 seconds while a cat's reply is being written or just after you send. Avatar URLs use that instance's frontend origin. The client uses the existing Cat Cafe `default-user` convention; it is not a general-purpose authenticated multi-user client.

The one-click connection action probes the saved address and these loopback ports: 3004, 3000, 3001, 3005, 4000, 8080. No automatic connection probe runs in a fresh install. User-clicked download/help links open GitHub in your browser; paper links open arXiv.

Sending chat or starting a seminar posts the message to the configured Cat Cafe. Included material is visible to that instance and may be sent to its model providers. Normal note previews are limited to 1,000 characters for chat and 1,500 for seminars. A selected passage is sent in full, with a 90,000-character input limit. Failures can retain that same material locally for recovery.

A seminar starts in a new conversation unless you pick an existing one. A new conversation is first created in the configured Cat Cafe with the desktop vault path as its project, so it is listed with the vault's other conversations, and with a temporary title naming the attached note or passage lines, or the start of the topic. The first cat to answer may rename it. A seminar in an existing conversation posts only the message. ＋ (新开对话) in the chat header, or the New Cat Cafe Conversation command, creates a conversation the same way, titled from the passage attached in the chat or the note being read.

The plugin does not include analytics, advertising requests, remote script execution, or a self-updater. It cannot control the retention, logging, model training policies, or charges of a separately configured service. Connect only to an instance you intend to trust with the material you send.

## Multi-passage research

The unsent passage tray and request-bound source snapshots (selected text, vault-relative paths, and selection positions) persist in unencrypted local `data.json` without automatic expiry. Explicit removal or sending consumes the tray; failed sends and request history are retained. Selecting additional notes does not send them until you send a message or start a seminar. Multi-passage messages include only the selected excerpts and their source labels/relative paths, not surrounding note content. These messages go to the configured Cat Cafe, which may forward them to its AI providers. Saving a reply creates explicit local source links only for the requests that reply identifies.
