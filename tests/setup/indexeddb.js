// Imported from a file rather than listed as a bare package in setupFiles:
// vitest resolves a bare entry from the root URL, which inside a nested git
// worktree (.claude/worktrees/*) walks up into the parent checkout's
// node_modules and Vite refuses to load it.
import 'fake-indexeddb/auto';
