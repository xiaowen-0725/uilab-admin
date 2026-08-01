#!/usr/bin/env node
/**
 * Compatibility wrapper — canonical implementation lives at
 * tooling/template-cli/uilab-admin.mjs
 *
 * Same process: preserves argv, stdout/stderr, signals, and exit codes.
 * Do not spawn a child process or duplicate CLI logic.
 */
import '../tooling/template-cli/uilab-admin.mjs'
