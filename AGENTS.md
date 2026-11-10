# Clowder Atlas delivery

- Develop nontrivial changes in a sibling Git worktree. Test against synthetic vaults and a dedicated Obsidian profile; do not attach experiments to the operator's notes, Cafe or running Obsidian instance.
- Run the affected checks, inspect actual UI changes in isolated Obsidian, and obtain a non-author review of the committed candidate before installing a trial.
- Every plugin iteration is **local trial first**. Build and use `npm run stage:local -- --vault <absolute-vault-path>` for the explicitly intended local vaults. Give the operator concrete steps to try the changed behavior, including reloading the plugin. Provide `npm run rollback:local` with the same vault arguments.
- **Do not merge into main, push a release tag or create/publish a GitHub Release until the operator has tried that candidate and explicitly allowed publication.** Automated tests, review approval and an earlier version's permission do not satisfy this requirement. Keep the work Task open while publication is awaiting that decision. Rework stays on the feature branch and is staged again.
- Preserve the stable binary backup across trial iterations. Never copy/restore `data.json` or notes as part of installing or rolling back plugin code. Before a new release cycle, archive the completed cycle's staging receipt and backup as described in `PUBLISHING.md`.
- Use the canonical `gh` CLI for GitHub reads/writes. PR review is distinct from release publication; report local files, a running app, a GitHub release and the Community cache as separate verified states.
