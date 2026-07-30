# Git Status and Diff View — Implementation Plan

## Goal

Add a read-only **Changes** view that shows the current Git branch and every changed path in the Git worktree, alphabetized relative to the repository root. Each path displays its staged and/or unstaged unified diff. Untracked-file previews are required.

This is a shared project view: all connected tabs see the same Git snapshot for the Web Agent launch directory. It must not create another HTTP server, Pi session, or Pi child process.

## UX

Use a `GitStatusDrawer.svelte` modal drawer, consistent with the existing session-tree drawer.

- Add a **Changes** action to the desktop header and mobile action sheet.
- Fetch status when the drawer opens; provide a touch-sized **Refresh** button.
- Show the branch name, repository root, changed-file count, and refresh timestamp.
- Render changed files in deterministic alphabetical order by repository-relative path.
- For each file, show its path, status badges, and separate **Staged** and **Unstaged** sections when applicable.
- Reuse the safe whitespace-preserving unified-diff presentation from `DiffView.svelte` (or extract a shared safe diff primitive if its API needs to grow).
- Show a clear empty state for a clean worktree, a distinct state when the launch directory is not inside a Git worktree, and a recoverable error state for Git failures.
- Keep the view strictly read-only: no stage, unstage, discard, checkout, commit, or arbitrary command controls.

A snapshot is current only when it was collected. Display its refresh time; Git can change externally or through Pi tools, so opening the view and pressing Refresh must request a new snapshot rather than trusting a reconnect cache.

## Protocol and state

Add a parameterless `get_git_status` browser command.

- Add it to `browserCommands` in `src/lib/client/protocol.ts` and document it in `SPECIFICATION.md` as an internal, read-only Git query.
- Do **not** map it to Pi RPC in `mapCommandToPi`.
- Add a `GitStatusProvider` option to `RpcBroker`, analogous to the session-list provider.
- `RpcBroker` handles `get_git_status` internally, sends the command response only to the requesting client, and stores/broadcasts a `git_status` snapshot to every tab.
- Do not add it to bootstrap requests: Git execution should be lazy. A retained snapshot may be sent on reconnect, but the drawer refreshes it when opened.
- Add `gitStatusDrawerOpen` to `LayoutState` and a typed `AppState` accessor for the `git_status` snapshot.

Suggested JSON-compatible snapshot shape:

```ts
type GitFileStatus = {
	path: string;
	originalPath?: string;
	indexStatus?: string;
	worktreeStatus?: string;
	stagedDiff?: string;
	unstagedDiff?: string;
	untracked?: boolean;
	conflicted?: boolean;
	binary?: boolean;
};

type GitStatusSnapshot =
	| {
			state: 'ready';
			repositoryRoot: string;
			branch: { name: string; detached: boolean; oid?: string };
			refreshedAt: string;
			files: GitFileStatus[];
	  }
	| { state: 'not_repository'; refreshedAt: string }
	| { state: 'error'; refreshedAt: string; message: string };
```

The provider, not the browser, chooses the repository root and all Git arguments. The browser sends no path, ref, or command parameters.

## Server-side Git provider

Create `src/server/git-status.ts`, with an injectable command runner for unit tests. Construct it from `src/server/main.ts` using the same `cwd` supplied to Pi.

1. Resolve the repository root with a fixed `git -C <cwd> rev-parse --show-toplevel` invocation.
   - Return `state: 'not_repository'` for Git's normal not-a-worktree result.
   - Treat missing Git, permission failures, timeouts, and unexpected exits as `state: 'error'` with a safe message.
2. Read branch and file state with:

   ```text
   git -C <repository-root> status --porcelain=v2 --branch -z --untracked-files=all
   ```

   Parse the NUL-delimited format directly. It preserves paths containing spaces and newlines and identifies ordinary, rename/copy, unmerged, untracked, and ignored records. Omit ignored files from the view.

3. Derive the branch from the porcelain-v2 branch records.
   - Display the current symbolic branch when available.
   - For detached HEAD, display a clear detached label plus a short OID when available.
   - Handle unborn repositories without treating them as a provider crash.
4. For each tracked path with an index change, obtain its staged patch with a fixed command equivalent to:

   ```text
   git -C <repository-root> diff --cached --no-ext-diff --no-color --binary -- <path>
   ```

5. For each tracked path with a worktree change, obtain its unstaged patch with a fixed command equivalent to:

   ```text
   git -C <repository-root> diff --no-ext-diff --no-color --binary -- <path>
   ```

   A file changed in both areas receives both patches.

6. For every untracked file, generate a required preview patch against `/dev/null` with Git's no-index mode, equivalent to:

   ```text
   git -C <repository-root> diff --no-index --no-ext-diff --no-color --binary -- /dev/null <path>
   ```

   Exit code `1` is the expected “differences found” result and must be accepted. Store the output as that file's `unstagedDiff` and mark the record `untracked: true`.

   The provider must construct this from the status-derived path only; it must never accept a browser-provided path. For robust handling of raw/non-UTF-8 filenames, retain NUL-delimited path bytes internally and use NUL-delimited Git pathspec input where necessary, while exposing a safely escaped display path in JSON.

7. Sort final records by their repository-relative display path before creating the snapshot. Preserve rename/copy source paths in `originalPath` for display.

Run Git with argument arrays and `shell: false`; never interpolate a path into a shell command. Disable paging and external diff helpers (`--no-ext-diff`, `--no-color`, and a noninteractive pager environment). Bound command duration, concurrent per-file diff work, and total/per-diff output. If a limit is reached, make the affected file visibly report that its preview could not be loaded; do not silently present an incomplete patch as complete.

The provider may use short-lived `git` subprocesses. These are read-only, allowlisted queries and are not additional Pi children or active agent sessions.

## UI implementation locations

- `src/lib/client/protocol.ts`: add `get_git_status`.
- `src/server/git-status.ts`: Git querying, porcelain parsing, patch generation, and typed provider interface.
- `src/server/git-status.spec.ts`: provider parsing and runner behavior.
- `src/server/rpc-broker.ts`: internal command handler and `git_status` snapshot storage.
- `src/server/main.ts`: create and inject the provider with the launch `cwd`.
- `src/lib/state/app-state.svelte.ts`: layout flag and typed Git snapshot accessor.
- `src/lib/components/GitStatusDrawer.svelte`: new drawer and refresh behavior.
- `src/lib/components/AppShell.svelte`: desktop Changes action, drawer mounting, and lazy load on open.
- `src/lib/components/MobileActionSheet.svelte`: mobile Changes action and lazy load.
- `src/routes/page.svelte.e2e.ts`: fake-WebSocket Changes scenario.

Do not add a second HTTP endpoint solely for this feature; it belongs on the existing authenticated-by-network-boundary WebSocket protocol and broker flow.

## Rendering details

- Render paths and diffs as text, never as HTML.
- Preserve diff whitespace in `<pre><code>` and retain the existing added/removed/hunk styling.
- Label binary patches clearly; render Git's textual binary patch safely when provided.
- For conflicts, display the Git status and any available patch without claiming the file is cleanly diffable.
- For a rename/copy, show both the destination `path` and the source `originalPath`.
- Do not collapse away required untracked previews. Very large previews may use a scrollable diff region, but any enforced truncation/limit must be explicit in the UI.

Untracked-file previews can reveal newly created credentials or other sensitive local content. This is intentional for the requested feature and must be documented alongside the existing non-loopback exposure warning.

## Tests

Add focused unit tests for the Git provider using an injected fake runner:

- clean worktree;
- non-repository directory;
- normal, detached, and unborn branch states;
- staged-only, unstaged-only, and mixed index/worktree changes;
- added, deleted, renamed/copied, unmerged, and submodule records;
- untracked file preview generation, including accepting `git diff --no-index` exit code `1`;
- spaces, newlines, leading dashes, and rename source paths;
- deterministic path ordering;
- missing Git, nonzero unexpected exits, timeout, and output-limit handling;
- confirmation that no shell is used and no browser parameter controls a Git path.

Extend broker/protocol tests to verify `get_git_status`:

- is accepted by frame validation;
- does not write to the fake Pi transport;
- broadcasts a `git_status` snapshot to all clients;
- routes its response only to the initiating client.

Add state/component tests for snapshot reduction and staged/unstaged/untracked rendering. Extend the deterministic fake-WebSocket E2E fixture with a Git snapshot and verify:

1. the Changes drawer opens from desktop and mobile controls;
2. branch and repository root appear;
3. file sections are alphabetized;
4. staged and unstaged patches render separately;
5. an untracked file's required preview renders;
6. Refresh sends `get_git_status`.

## Documentation and verification

Update `SPECIFICATION.md`, `CONTEXT.md`, and `README.md` to describe the read-only Changes view, its shared-tab snapshot behavior, and the fact that it displays tracked and untracked content. Preserve the loopback default and do not enable CORS.

After implementation, run the narrow tests first, then:

```sh
npm run check
npm run lint
npm run test:unit
npm run test:e2e
npm run build
```
