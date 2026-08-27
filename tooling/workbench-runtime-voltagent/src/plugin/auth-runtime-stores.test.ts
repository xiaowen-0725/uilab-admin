import assert from 'node:assert/strict'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { createAuthBindingStore } from './auth-binding-store.js'
import {
  isAuthBindingPersistEnabled,
  resolveAuthRuntimeStores,
} from './auth-runtime-stores.js'
import { createMemorySecretStore } from './secret-store.js'

async function tempDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'uilab-auth-runtime-'))
}

describe('resolveAuthRuntimeStores', () => {
  it('disables persist when persistAuthBindings is false or UILAB_PERSIST_AUTH=0', () => {
    assert.equal(isAuthBindingPersistEnabled(false, {}), false)
    assert.equal(
      isAuthBindingPersistEnabled(undefined, { UILAB_PERSIST_AUTH: '0' }),
      false,
    )
    assert.equal(isAuthBindingPersistEnabled(undefined, {}), true)
  })

  it('keeps injected stores and still reports persist policy', async () => {
    const secretStore = createMemorySecretStore()
    const authBindingStore = createAuthBindingStore()
    const stores = await resolveAuthRuntimeStores({
      env: {},
      secretStore,
      authBindingStore,
    })
    assert.equal(stores.secretStore, secretStore)
    assert.equal(stores.authBindingStore, authBindingStore)
    assert.equal(stores.persistEnabled, true)
  })

  it('uses an in-memory binding store when persist is off', async () => {
    const stores = await resolveAuthRuntimeStores({
      env: { UILAB_PERSIST_AUTH: '0' },
    })
    assert.equal(stores.persistEnabled, false)
    assert.equal(stores.authBindingStore.list().length, 0)
  })

  it('rejects a persisted root under WORKSPACE_ROOT unless skipWorkspaceGuard', async () => {
    const root = await realpath(await tempDir())
    try {
      await assert.rejects(
        () =>
          resolveAuthRuntimeStores({
            env: { WORKSPACE_ROOT: root },
            runtimeConfigDir: path.join(root, '.uilab', 'runtime'),
          }),
        /WORKSPACE_ROOT|不得/,
      )
      const allowed = await resolveAuthRuntimeStores({
        env: { WORKSPACE_ROOT: root },
        runtimeConfigDir: path.join(root, '.uilab', 'runtime'),
        skipWorkspaceGuard: true,
      })
      assert.equal(allowed.persistEnabled, true)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
