# Upstream review — 2026-10-03

Downstream baseline: 0161352; previous import 9566c06 names prettier-vscode 11.0.0.
Reviewed upstream: prettier/prettier-vscode v11.0.0 through b3d5ea136fadf5a4cac835df074dc12fcb398b0c.
This is a selective semantic port, not a claim of complete parity.

- Ported 53a3b1c3451141273d2d7c46e04a14db918c4ea4: already-formatted documents return no text edits.
- Ported 8cfaab2f2bbd0b06a6eb1e6dba739bcf9eafaa65: file URI plugin references bypass package resolution.
- Ported 569cff4630974a4daf39ef1845c274da5a107a58: watch TypeScript Prettier configuration names. Actual parsing remains the selected Prettier/Node runtime's responsibility.
- Ported c58c958a2a1cddd53298c43ca9ab5fdb31d86f3e: watch ignore-file changes. Adapted cache invalidation to the existing Coc worker/main-thread resolver, await local cache clearing, and invalidate cached ignore/package paths.
- 6384d3929f62d23fbae929fca5cca7b424c8ee4e: file entry points already supported by downstream package-json lookup and require-based worker; retained.
- VS Code workspace trust, defaultFormatter/code actions, web plugins, publisher and localization changes omitted: these host contracts are not this extension's APIs.
- VS Code-specific watcher workaround 61b4780 omitted: Coc uses its own watcher implementation and supports the existing brace glob.
- ESM migration, bundled Prettier 3 default, build/package-manager overhaul and new formatter option defaults deferred: replacing the Coc CommonJS worker architecture or bundled formatter changes existing behavior and needs a separate compatibility effort. Existing local Prettier 3 support is retained.
- Logging-only additions and upstream test-runner changes are not required for these fixes.

Preserved: Coc formatter priority, disabled-language handling, force format command and applyEdits semantics, local-only mode, worker isolation, status bar, configuration defaults, activation, and all existing command/configuration IDs. Watchers remain returned for subscription disposal.

Validation: baseline production build and TypeScript check passed. Eight focused regression tests now cover no-op LF/CRLF edits, minimal edits, watcher disposal/cache invalidation, file URI plugins, awaited cache clearing, cleanup after rejection, lazy worker lifecycle, and formatter registration without terminating an active resolver. `npm test`, `tsc --noEmit`, `npm run prepare`, contract comparison, and `git diff --check` passed.

Lifecycle findings during verification: disposal now logs cache-clear failures and releases module references in finally. The shared Prettier worker starts only when a local Prettier 3 instance needs it and is explicitly terminated during resolver disposal. Formatter re-registration only disposes provider registrations, preserving active module workers.

Initial real editor checks did not complete: coc-test 0.1.2 reported ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING_FLAG from bundled Prettier, and 0.1.10 / 0.2.0 exceeded process limits. Those attempts are not counted as passing. The temporary integration script, added test-runner dependencies, badge and known-hanging CI were removed. Existing package/lock dependency versions remain unchanged. No force-exit was used. The follow-up diagnosis below establishes the remaining runner cleanup boundary; Windows watching remains unverified.

Follow-up diagnosis with fixed local coc-test 0.2.0 separated two pre-existing issues. An untitled JavaScript fixture cannot infer a parser on both baseline and current code; a real `.js` fixture formats correctly on both. The unmodified runner disposes the editor without unloading the extension, leaving the worker alive and waiting for the node:test stream summary. A minimal unrelated plugin with a disposable worker reproduces that omission; an empty plugin finishes. Adding explicit extension unload only in a temporary diagnostic runner allows the current patch to pass real-file formatting and unchanged-second-format checks on Neovim (1/1, exit 0) and Vim (1/1, exit 0). Baseline still hangs after unload because its original worker is never terminated. This verifies the current worker cleanup when the host invokes it; it is not an unmodified-runner CI pass. No production runner or CI was changed.
