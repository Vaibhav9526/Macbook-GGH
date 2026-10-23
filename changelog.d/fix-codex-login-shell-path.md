### Fixed

- Find and start a Codex CLI that npm, Volta, Bun or pnpm installed when you open Jargon from
  Finder, the Dock, or a login item. Before, Jargon reported that Codex was not found or could not
  start, because the CLI did not get your shell `PATH`. Jargon now reads the `PATH` of the shell in
  `$SHELL`, such as bash or fish, not only zsh.
- Say whether the downloaded copy or your own copy of Codex or Claude could not start, instead of
  always asking you to reinstall Jargon.
- On Windows, pick a runnable file when `where` finds a Claude, Codex or other CLI with more than
  one extension.
