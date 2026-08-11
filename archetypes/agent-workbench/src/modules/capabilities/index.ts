/**
 * Capabilities Module — public Interface.
 *
 * Owns: Capability Surface catalog/selection/startAuth ports + Fake/HTTP adapters.
 * Does not own: RuntimePort events, PluginRegistry packaging, secrets, effective tool truth
 * (sidecar computes effective; this module only queries snapshot + sends selection/auth intent).
 */

export type {
  CapabilityConnectionState,
  CapabilitySnapshot,
  CapabilityAuthRefreshResult,
  ConnectorAuthTransition,
  CapabilitySnapshotConnector,
  CapabilitySnapshotExpert,
  CapabilitySnapshotListener,
  CapabilitySnapshotPort,
  CapabilitySnapshotSkill,
  StartAuthResult,
  TaskCapabilitySelection,
} from './ports/capability-snapshot-port'

export {
  CONNECTOR_GITHUB_ID,
  CONNECTOR_FEISHU_ID,
  EXPERT_OFFICE_MEETING_ID,
  emptyTaskCapabilitySelection,
  mergeTaskCapabilitySelection,
  toggleConnectorSelection,
  type TaskCapabilitySelectionStore,
} from './model/task-selection'

export { createBrowserTaskCapabilitySelectionStore } from './adapters/browser-task-selection-store'

export {
  createFakeCapabilitySnapshotPort,
  type FakeCapabilitySnapshotOptions,
} from './adapters/fake-capability-snapshot'

export {
  createHttpCapabilitySnapshotPort,
  offlineCapabilitySnapshot,
  type HttpCapabilitySnapshotPortOptions,
} from './adapters/http-capability-snapshot'

export {
  createCapabilityController,
  type CapabilityController,
  type CapabilityControllerError,
} from './application/capability-controller'

export {
  useCapabilitySnapshot,
  useCapabilitySnapshotError,
} from './application/use-capability-snapshot'
export { waitForConnectorAuth } from './application/wait-for-connector-auth'

export {
  formatStartAuthNotice,
  formatTaskConnectorSelectionNotice,
} from './ui/start-auth-notice'

export {
  CapabilityAddMenu,
  type CapabilityAddMenuProps,
} from './ui/capability-add-menu'

export {
  CapabilityChips,
  CapabilityToolbarConnectors,
  type CapabilityChipsProps,
} from './ui/capability-chips'

export {
  ConnectorBrandBadge,
  FeishuBrandIcon,
  GitHubBrandIcon,
} from './ui/brand-icons'
