/**
 * Capability Surface (sidecar) — snapshot, selection, startAuth, tool gate.
 */

export type {
  AuthStatusProbeResult,
  CapabilitySnapshot,
  CapabilitySnapshotConnector,
  CapabilitySnapshotExpert,
  CapabilitySnapshotSkill,
  ConnectorAuthTransition,
  ConnectorConnectionState,
  StartAuthRequest,
  StartAuthResult,
  TaskCapabilitySelection,
} from './types.js'

export {
  createCapabilitySelectionStore,
  emptyTaskCapabilitySelection,
  getDefaultCapabilitySelectionStore,
  setDefaultCapabilitySelectionStore,
  type CapabilitySelectionStore,
} from './selection-store.js'

export {
  buildCapabilitySnapshot,
  TEMP_EXPERT_CATALOG,
  type BuildCapabilitySnapshotInput,
} from './snapshot.js'

export {
  BUILTIN_EXPERT_FALLBACK,
  expertDefinitionToSnapshot,
  getDefaultExpertSnapshotCatalog,
  getExpertInstruction,
  loadExpertCatalog,
  parseExpertJson,
  type ExpertCatalogLoadResult,
  type ExpertDefinition,
} from './expert-catalog.js'

export { startConnectorAuth, type StartAuthOptions } from './start-auth.js'

export {
  createConnectorCliAuthRuntime,
  createDefaultCliAuthProcessRunner,
  type CliAuthProcessHandle,
  type CliAuthProcessResult,
  type CliAuthProcessRunner,
  type ConnectorCliAuthRuntime,
  type ConnectorCliAuthStart,
  type ConnectorCliAuthTransition,
} from './connector-cli-auth.js'

export {
  findConnectorForTool,
  filterToolsForTaskSelection,
  gateConnectorToolInvoke,
  type ConnectorAuthLookup,
  type ConnectorToolGateOptions,
  type ToolGateResult,
} from './tool-gate.js'
export {
  CAPABILITY_CONNECTOR_IDS_CONTEXT_KEY,
  readCapabilityTurnContext,
  type CapabilityTurnContext,
} from './turn-context.js'

export {
  loadExpertsForHttp,
  mountCapabilityRoutes,
  probePluginAuthResource,
  type CapabilityHttpContext,
} from './http-routes.js'
