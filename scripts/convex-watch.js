#!/usr/bin/env node
/**
 * convex-watch.js — auto-push Convex backend changes.
 *
 * Watches src/convex/ for edits and runs `npx convex dev --once` so the
 * deployment and the generated client API stay in sync while you code.
 *
 * Usage:
 *   npm run convex:watch        # or: bun run convex:watch
 *
 * Behavior notes:
 * - Edits are debounced, so a burst of saves (e.g. an IDE multi-file save)
 *   triggers a single push.
 * - src/convex/_generated/ is ignored, so running codegen never re-triggers
 *   a push (no infinite loop).
 * - Editor temp files (dotfiles, *.swp/*.swx, trailing ~) are ignored.
 * - Set CONVEX_WATCH_DIR to watch a different directory.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const WATCH_DIR = process.env.CONVEX_WATCH_DIR
  ? path.resolve(process.env.CONVEX_WATCH_DIR)
  : path.join(ROOT, "src", "convex");

const IGNORED_DIRS = new Set(["_generated", "node_modules", ".git", ".convex-data"]);
const DEBOUNCE_MS = 750;

let timer = null;
let running = false;
let queued = false;
const watchers = [];

function isIgnored(relPath) {
  const segments = relPath.split(path.sep);
  if (segments.some((seg) => IGNORED_DIRS.has(seg))) return true;
  const base = segments[segments.length - 1];
  return (
    base.startsWith(".") || // dotfiles (vim swap, .gitkeep noise, etc.)
    base.endsWith("~") || // emacs backups
    base.endsWith(".swp") ||
    base.endsWith(".swx") ||
    base.endsWith(".tmp")
  );
}

function handle(fullPath) {
  const rel = path.relative(WATCH_DIR, fullPath);
  if (!rel || isIgnored(rel)) return;
  schedule();
}

function schedule() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(flush, DEBOUNCE_MS);
}

function flush() {
  timer = null;
  if (running) {
    // A push is already in flight — coalesce this change into it.
    queued = true;
    return;
  }
  runPush();
}

function runPush() {
  running = true;
  const startedAt = Date.now();
  console.log(`\n[convex-watch] Change detected — running "npx convex dev --once" ...`);
  const child = spawn("npx", ["convex", "dev", "--once"], {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, CI: "1" },
  });
  child.on("close", (code) => {
    const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    running = false;
    console.log(`[convex-watch] "convex dev --once" finished in ${seconds}s (exit ${code}).`);
    if (queued) {
      queued = false;
      runPush();
    }
  });
}

function startWatching() {
  // Preferred: recursive watch (supported on Linux since Node 20).
  try {
    watchers.push(
      fs.watch(WATCH_DIR, { recursive: true }, (event, filename) => {
        if (filename) handle(path.join(WATCH_DIR, filename.toString()));
      })
    );
    console.log(`[convex-watch] Watching ${WATCH_DIR} (recursive)...`);
    return;
  } catch {
    // Fallback: watch every directory in the tree individually.
    const seen = new Set();
    const watchDir = (dir) => {
      if (seen.has(dir)) return;
      seen.add(dir);
      try {
        watchers.push(
          fs.watch(dir, (event, filename) => {
            if (filename) {
              const full = path.join(dir, filename.toString());
              try {
                if (fs.statSync(full).isDirectory()) watchDir(full);
              } catch {
                // Directory may have been removed before we could stat it.
              }
              handle(full);
            }
          })
        );
      } catch {
        // Directory disappeared between walk and watch.
      }
    };
    const walk = (dir) => {
      let entries = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        if (entry.isDirectory()) walk(path.join(dir, entry.name));
      }
      watchDir(dir);
    };
    walk(WATCH_DIR);
    console.log(`[convex-watch] Watching ${WATCH_DIR} (per-directory fallback)...`);
  }
}

function shutdown() {
  console.log("\n[convex-watch] Stopped.");
  for (const w of watchers) w.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

if (!fs.existsSync(WATCH_DIR)) {
  console.error(`[convex-watch] Directory not found: ${WATCH_DIR}`);
  process.exit(1);
}

console.log(`[convex-watch] Every edit under ${WATCH_DIR} will push to Convex.`);
startWatching();
