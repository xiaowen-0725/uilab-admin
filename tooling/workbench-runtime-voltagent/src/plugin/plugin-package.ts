/**
 * Builtin Plugin Package — a bundled registration seam (#49).
 *
 * A package groups one or more PluginManifests with package-level metadata
 * (brand icon key, deterministic Fake catalog). Packages are trusted builtin
 * sources declared in code; external plugin.json files cannot form packages.
 *
 * Design constraints:
 * - brandIconKey is a pure string key. The sidecar NEVER resolves it to a file
 *   path — the Renderer maps it to an actual icon asset.
 * - fakeCatalog contains only non-secret data (status hints, login prompts).
 * - Package manifests must have kind: 'builtin'.
 */

import type { PluginManifest } from './manifest.js'

/** Deterministic Fake catalog entry for a connector declared by this package. */
export type FakeCatalogEntry = {
  /** The connector id this entry projects (must match a ConnectorContribution.id). */
  connectorId: string
  /** Fake projection state — never 'connected' (Fake must not claim live auth). */
  connectionState: 'missing' | 'unavailable'
  /** Non-secret login hint shown when the connector is not connected. */
  loginHint: string
}

/** A package bundling manifests + metadata + Fake catalog for unified registration. */
export type BuiltinPluginPackage = {
  /** Stable package id (e.g. 'demo.example'). */
  id: string
  /** Manifests contributed by this package. All must have kind: 'builtin'. */
  manifests: PluginManifest[]
  /**
   * Brand icon key. The Renderer maps this to an actual icon asset.
   * The sidecar never resolves this to a file path.
   */
  brandIconKey?: string
  /** Deterministic Fake catalog entries for connectors declared by this package. */
  fakeCatalog?: FakeCatalogEntry[]
}
