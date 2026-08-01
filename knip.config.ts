import type { KnipConfig } from 'knip'

/**
 * Repository-wide knip policy.
 * When knip runs via `pnpm --filter @uilab/admin knip` (package cwd),
 * paths are relative to the Admin package. Prefixes for monorepo-root
 * invocation are handled by knip workspace discovery when present.
 *
 * Config packages listed in ignoreDependencies are consumed by root
 * ESLint/Prettier policy (workspace-external) but must remain on the
 * Admin package so copy-and-own derived apps stay self-contained.
 */
const adminIgnore = [
  'src/components/ui/**',
  'src/components/layout/app-title.tsx',
  'src/tanstack-table.d.ts',
]

const adminIgnoreDependencies = [
  '@eslint/js',
  '@tanstack/eslint-plugin-query',
  '@trivago/prettier-plugin-sort-imports',
  'eslint-plugin-react-hooks',
  'eslint-plugin-react-refresh',
  'globals',
  'prettier-plugin-tailwindcss',
  'typescript-eslint',
]

const config: KnipConfig = {
  // Default (single package / filter cwd = admin)
  ignore: adminIgnore,
  ignoreDependencies: adminIgnoreDependencies,
  // Monorepo-root discovery (path-prefix adaptation)
  workspaces: {
    'archetypes/admin': {
      ignore: adminIgnore,
      ignoreDependencies: adminIgnoreDependencies,
    },
  },
}

export default config
