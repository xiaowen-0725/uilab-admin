#!/usr/bin/env node
/**
 * Compatibility wrapper — canonical implementation lives at
 * tooling/quality-gates/check-ai.mjs
 *
 * Same process: preserves argv, stdout/stderr, signals, and exit codes.
 * Do not spawn a child process or duplicate gate logic.
 */
import '../tooling/quality-gates/check-ai.mjs'
