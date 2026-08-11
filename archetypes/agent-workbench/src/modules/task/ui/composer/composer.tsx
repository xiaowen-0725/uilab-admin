import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import {
  CapabilityAddMenu,
  CapabilityChips,
  CapabilityToolbarConnectors,
  formatStartAuthNotice,
  formatTaskConnectorSelectionNotice,
  waitForConnectorAuth,
  useCapabilitySnapshot,
  type CapabilityController,
} from '@/modules/capabilities'
import {
  Check,
  CircleAlert,
  FileText,
  Folder,
  FolderOpen,
  FolderX,
  GitBranch,
  HardDrive,
  Image as ImageIcon,
  Lightbulb,
  ListTodo,
  Mic,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Composer,
  ComposerAccessChip,
  ComposerAttachmentChip,
  ComposerAttachments,
  ComposerAutonomyDial,
  ComposerContextBar,
  ComposerContextGauge,
  ComposerDictation,
  ComposerEffortSlider,
  ComposerFloatingPanel,
  ComposerIconButton,
  ComposerMenuButton,
  ComposerMenuItem,
  ComposerMenuSection,
  ComposerModeBadge,
  ComposerModelPicker,
  ComposerPanelItem,
  ComposerPanelSection,
  ComposerSendButton,
  ComposerSkillChip,
  ComposerTextarea,
  ComposerToolbar,
} from '@/components/motion/agent-composer'
import type { RunStatus } from '../../model/lifecycle'
import type {
  CommandAcknowledgement,
  TurnComposerContext,
} from '../../protocol/commands'
import {
  previewText,
  runtimeHonestyCopy,
  type RuntimeHonestyMode,
} from '../../runtime/runtime-honesty'

export interface ComposerProps {
  /** Context chip — project / workspace name (local fixture state). */
  projectLabel?: string
  /** Context chip — environment (local fixture). */
  environmentLabel?: string
  /** Context chip — branch (local fixture). */
  branchLabel?: string
  /** Model display name (local fixture). */
  modelLabel?: string
  /**
   * Show token-budget gauge (48K/200K style). Off by default to match Codex density;
   * host can enable per scenario.
   */
  showContextGauge?: boolean
  /**
   * Scenario toggles for the context rail.
   * Product: project chip defaults on; env/branch chips default **off** until a
   * real environment / Git port is wired (no fake 「本地」「main」 without backend).
   * Even when flags are true, env/branch stay hidden if no project is selected.
   */
  showContextBar?: boolean
  showProjectChip?: boolean
  showEnvironmentChip?: boolean
  showBranchChip?: boolean
  /**
   * `local-sim` (default): local timer feedback; notice contains「不会调用 Agent Runtime」.
   * `runtime`: Application Command → Fake Runtime; no local timer as domain authority.
   */
  mode?: 'local-sim' | 'runtime'
  /** Active run status from TaskReadModel (runtime mode). */
  runStatus?: RunStatus | null
  /** Runtime mode: submit user text via controller. */
  onSubmitText?: (
    text: string,
    composerContext?: TurnComposerContext
  ) => Promise<CommandAcknowledgement | null>
  /** Runtime mode: cancel active run via controller. */
  onCancelRun?: () => void | Promise<void>
  /** Optional notice override from runtime controller. */
  runtimeNotice?: string | null
  /**
   * Honesty mode when `mode === 'runtime'`.
   * Controls interim notices before controller notice arrives.
   */
  honestyMode?: RuntimeHonestyMode
  /** Capability Surface controller (Composition). */
  capabilityController?: CapabilityController | null
  /** Task id for capability selection. */
  capabilityTaskId?: string | null
}

const ACCESS_LEVELS = ['只读', '需确认', '作用域自动', '完全访问'] as const
const EFFORT_LABELS = ['最低', '低', '标准', '高', '极高'] as const
const AUTONOMY_LABELS = ['仅建议', '先询问', '作用域自动', '完全自动'] as const
const ENVIRONMENTS = ['本地', '沙箱', '预发'] as const
const BRANCHES = ['main', 'develop', 'feat/workbench'] as const
const MODELS = [
  { id: '5.6-sol', label: '5.6 Sol' },
  { id: '5.4-pro', label: '5.4 Pro' },
  { id: '4.5-fast', label: '4.5 Fast' },
] as const

/**
 * Seed catalog for the project picker (mirror navigator folders).
 * Kept inline to avoid task → config circular import via fixtures.
 */
const FIXTURE_PROJECT_NAMES = [
  'ui-components',
  'zhoujw-skills',
  'parking-agent',
  'ake-hermes-agent',
] as const

type SlashKind = 'command' | 'mode' | 'skill'

interface SlashItem {
  id: string
  label: string
  description?: string
  trailing?: string
  kind: SlashKind
  Icon: typeof Target
}

/** Built-in `/` commands (local Runtime simulation). */
const SLASH_COMMANDS: SlashItem[] = [
  {
    id: 'new-chat',
    label: '新聊天',
    description: '在同一工作空间中开启空白聊天',
    kind: 'command',
    Icon: ListTodo,
  },
  {
    id: 'model',
    label: '模型',
    description: '打开模型与推理设置',
    kind: 'command',
    Icon: Zap,
  },
  {
    id: 'goal',
    label: '目标',
    description: '设置要持续追求的目标',
    kind: 'mode',
    Icon: Target,
  },
  {
    id: 'plan',
    label: '计划模式',
    description: '开启计划模式',
    kind: 'mode',
    Icon: Lightbulb,
  },
]

/** Fixture skills for `/` palette — not a real Skill Runtime. */
const SLASH_SKILLS: SlashItem[] = [
  {
    id: 'skill-api-design',
    label: 'API Design',
    description: 'API 设计规范（模块化 RPC 风格）',
    trailing: '个人',
    kind: 'skill',
    Icon: Sparkles,
  },
  {
    id: 'skill-code-review',
    label: 'Code Review',
    description: '按仓库约定审查改动与风险点',
    trailing: '个人',
    kind: 'skill',
    Icon: Sparkles,
  },
]

const RUN_DURATION_MS = 2200

/** Last `/query` token at end of draft (Codex-style slash palette). */
function getTrailingSlashQuery(
  text: string
): { start: number; query: string } | null {
  const match = text.match(/(^|[\s\n])\/([^\s]*)$/)
  if (!match || match.index === undefined) return null
  return {
    start: match.index + match[1].length,
    query: match[2] ?? '',
  }
}

function filterSlashItems(items: SlashItem[], query: string): SlashItem[] {
  const q = query.toLowerCase()
  if (!q) return items
  return items.filter(
    (item) =>
      item.label.toLowerCase().includes(q) ||
      item.description?.toLowerCase().includes(q) ||
      item.id.toLowerCase().includes(q)
  )
}

/** Flatten sections while keeping stable highlight indices for keyboard nav. */
function indexSlashSections(commands: SlashItem[], skills: SlashItem[]) {
  let index = 0
  return {
    commands: commands.map((item) => ({ item, index: index++ })),
    skills: skills.map((item) => ({ item, index: index++ })),
    flat: [...commands, ...skills],
  }
}

function uniqueProjectNames(
  ...groups: Array<string | null | undefined>
): string[] {
  return Array.from(
    new Set(groups.filter((n): n is string => Boolean(n && n.trim())))
  )
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name: string }).name === 'AbortError'
  )
}

async function pickLocalDirectoryName(): Promise<string | null> {
  const picker = (
    window as Window & {
      showDirectoryPicker?: () => Promise<{ name: string }>
    }
  ).showDirectoryPicker

  if (typeof picker === 'function') {
    try {
      const handle = await picker.call(window)
      return handle.name?.trim() || null
    } catch (error) {
      if (isAbortError(error)) return null
      // Fall through to <input webkitdirectory> when API is blocked.
    }
  }

  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.setAttribute('webkitdirectory', '')
    input.setAttribute('directory', '')
    input.style.display = 'none'
    const cleanup = () => {
      input.remove()
    }
    input.addEventListener('change', () => {
      const file = input.files?.[0]
      const relative = file?.webkitRelativePath?.split('/')[0]
      const name = relative || file?.name || null
      cleanup()
      resolve(name?.trim() || null)
    })
    // User cancel: some browsers fire no change — drop after focus returns.
    window.addEventListener(
      'focus',
      () => {
        window.setTimeout(() => {
          if (document.body.contains(input)) {
            cleanup()
            resolve(null)
          }
        }, 400)
      },
      { once: true }
    )
    document.body.appendChild(input)
    input.click()
  })
}

/**
 * Task Composer — UI Lab agent-composer, fully interactive local Runtime simulation.
 * Remote backend is not connected; all menus/state are local product experience.
 */
export function TaskComposer({
  projectLabel = 'app',
  environmentLabel = '本地',
  branchLabel = 'main',
  modelLabel = '5.6 Sol',
  showContextGauge = false,
  showContextBar = true,
  showProjectChip = true,
  showEnvironmentChip = false,
  showBranchChip = false,
  mode = 'local-sim',
  runStatus = null,
  onSubmitText,
  onCancelRun,
  runtimeNotice = null,
  honestyMode = 'fake',
  capabilityController = null,
  capabilityTaskId = null,
}: ComposerProps) {
  const honesty = runtimeHonestyCopy(honestyMode)
  const noticeId = useId()
  const [text, setText] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const isRuntimeMode = mode === 'runtime'
  /**
   * Send acts as Stop only while the run is actively executing / queued / cancelling.
   * `waiting_for_input` must accept clarification text (→ provideRunInput via submitText).
   * `waiting_for_approval` is resolved on the bottom ApprovalDock (Composer hidden), not via Send-as-Stop.
   */
  const sendActsAsStop =
    isRuntimeMode &&
    (runStatus === 'running' ||
      runStatus === 'queued' ||
      runStatus === 'cancelling')
  /** null = no project selected → chip shows「选择项目」. */
  const [project, setProject] = useState<string | null>(projectLabel || null)
  const [projectCatalog, setProjectCatalog] = useState<string[]>(() =>
    uniqueProjectNames(projectLabel, ...FIXTURE_PROJECT_NAMES)
  )
  const [projectQuery, setProjectQuery] = useState('')
  const [environment, setEnvironment] = useState(
    (ENVIRONMENTS.includes(environmentLabel as (typeof ENVIRONMENTS)[number])
      ? environmentLabel
      : '本地') as (typeof ENVIRONMENTS)[number]
  )
  const [branch, setBranch] = useState(
    (BRANCHES.includes(branchLabel as (typeof BRANCHES)[number])
      ? branchLabel
      : 'main') as (typeof BRANCHES)[number]
  )
  const [modelId, setModelId] = useState<string>(
    MODELS.find((m) => modelLabel.startsWith(m.label))?.id ?? MODELS[0].id
  )
  const [effort, setEffort] = useState(4)
  const [autonomy, setAutonomy] = useState(3)
  const [accessIndex, setAccessIndex] = useState(3)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [projectOpen, setProjectOpen] = useState(false)
  const [createProjectOpen, setCreateProjectOpen] = useState(false)
  const [createProjectName, setCreateProjectName] = useState('')
  const [envOpen, setEnvOpen] = useState(false)
  const [branchOpen, setBranchOpen] = useState(false)
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [attachments, setAttachments] = useState<
    { id: string; name: string; meta: string; icon: 'file' | 'image' }[]
  >([])
  const [skillTokens, setSkillTokens] = useState<
    { id: string; label: string }[]
  >([])
  const [goalMode, setGoalMode] = useState(false)
  const [planMode, setPlanMode] = useState(false)
  const [slashHighlight, setSlashHighlight] = useState(0)
  const [capabilityBusy, setCapabilityBusy] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const capabilitySnapshot = useCapabilitySnapshot(
    capabilityController,
    capabilityTaskId
  )

  const runTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recordIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const slashQuery = useMemo(() => getTrailingSlashQuery(text), [text])
  const slashOpen = Boolean(slashQuery) && !addOpen

  const slashPalette = useMemo(() => {
    const q = slashQuery?.query ?? ''
    return indexSlashSections(
      filterSlashItems(SLASH_COMMANDS, q),
      filterSlashItems(SLASH_SKILLS, q)
    )
  }, [slashQuery])

  const flatSlashItems = slashPalette.flat

  useEffect(() => {
    setSlashHighlight(0)
  }, [slashQuery?.query, slashOpen])

  useEffect(() => {
    if (!projectLabel) return
    setProject(projectLabel)
    setProjectCatalog((prev) => uniqueProjectNames(projectLabel, ...prev))
  }, [projectLabel])

  useEffect(() => {
    if (!projectOpen) setProjectQuery('')
  }, [projectOpen])

  useEffect(() => {
    return () => {
      if (runTimerRef.current) clearTimeout(runTimerRef.current)
      if (recordIntervalRef.current) clearInterval(recordIntervalRef.current)
    }
  }, [])

  useEffect(() => {
    if (isRuntimeMode && runtimeNotice) setNotice(null)
  }, [isRuntimeMode, runtimeNotice])

  const stopRecording = useCallback(() => {
    if (recordIntervalRef.current) clearInterval(recordIntervalRef.current)
    recordIntervalRef.current = null
    setRecording(false)
    setSeconds(0)
  }, [])

  const startRecording = useCallback(() => {
    setRecording(true)
    setSeconds(0)
    setNotice(null)
    recordIntervalRef.current = setInterval(
      () => setSeconds((s) => s + 1),
      1000
    )
  }, [])

  const handleSend = useCallback(async () => {
    if (recording) stopRecording()

    // Runtime path: Application Command → RuntimePort (Fake or VoltAgent).
    if (isRuntimeMode) {
      // Stop only while actively running / queued / cancelling (not HITL waits).
      if (sendActsAsStop) {
        await onCancelRun?.()
        setNotice(honesty.cancelRequested)
        return
      }
      if (!text.trim()) return
      const payload = text.trim()
      const clarifying = runStatus === 'waiting_for_input'
      const preview = previewText(payload)
      setNotice(
        clarifying
          ? honesty.clarifyingSubmit(preview)
          : honesty.submitWithPreview(preview)
      )
      const mode: TurnComposerContext['mode'] =
        goalMode && planMode
          ? 'goal+plan'
          : goalMode
            ? 'goal'
            : planMode
              ? 'plan'
              : 'default'
      const capabilitySkills =
        capabilitySnapshot?.skills
          .filter((s) => s.taskSelected)
          .map((s) => ({ id: s.id, label: s.name })) ?? []
      const mergedSkills = [
        ...skillTokens.map(({ id, label }) => ({ id, label })),
        ...capabilitySkills.filter(
          (s) => !skillTokens.some((t) => t.id === s.id)
        ),
      ]
      const capabilityConnectors =
        capabilitySnapshot?.connectors
          .filter((c) => c.taskSelected)
          .map((c) => ({
            id: c.id,
            label: c.name,
            connected: c.connected,
            capabilityEffective: c.capabilityEffective,
          })) ?? []
      const selectedExpert = capabilitySnapshot?.experts.find(
        (e) => e.taskSelected
      )
      const acknowledgement = await onSubmitText?.(payload, {
        attachments: attachments.map(({ name, meta, icon }) => ({
          name,
          meta,
          kind: icon,
        })),
        skills: mergedSkills,
        connectors: capabilityConnectors,
        expert: selectedExpert
          ? {
              id: selectedExpert.id,
              label: selectedExpert.name,
              instruction: selectedExpert.instruction,
            }
          : null,
        mode,
      })
      if (
        acknowledgement?.status === 'accepted' ||
        acknowledgement?.status === 'duplicate'
      ) {
        setText('')
        setAttachments([])
        setSkillTokens([])
        setGoalMode(false)
        setPlanMode(false)
      }
      return
    }

    // Local-sim path (default / capture): timer-only feedback; no RuntimePort.
    if (running) {
      if (runTimerRef.current) clearTimeout(runTimerRef.current)
      runTimerRef.current = null
      setRunning(false)
      setNotice('已停止本地模拟运行')
      return
    }
    if (!text.trim()) return
    setRunning(true)
    setNotice(
      `本地模拟已接收：${text.trim().slice(0, 40)}${text.trim().length > 40 ? '…' : ''}（不会调用 Agent Runtime）`
    )
    runTimerRef.current = setTimeout(() => {
      setRunning(false)
      setText('')
      setNotice('本地模拟完成（不会调用 Agent Runtime）')
      runTimerRef.current = null
    }, RUN_DURATION_MS)
  }, [
    recording,
    running,
    stopRecording,
    text,
    isRuntimeMode,
    sendActsAsStop,
    runStatus,
    onCancelRun,
    onSubmitText,
    honesty,
    attachments,
    skillTokens,
    goalMode,
    planMode,
    capabilitySnapshot,
  ])

  // The latest local interaction must be announced even when the Runtime keeps
  // a historical notice. A new Runtime notice clears the local one above.
  const displayNotice =
    notice ??
    (isRuntimeMode && runtimeNotice != null && runtimeNotice.length > 0
      ? runtimeNotice
      : null)

  const model = MODELS.find((m) => m.id === modelId) ?? MODELS[0]
  const modelTriggerLabel = (
    <span className='text-violet-500 dark:text-violet-400'>
      {model.label} · {EFFORT_LABELS[effort]}
    </span>
  )

  const filteredProjects = useMemo(() => {
    const q = projectQuery.trim().toLowerCase()
    if (!q) return projectCatalog
    return projectCatalog.filter((name) => name.toLowerCase().includes(q))
  }, [projectCatalog, projectQuery])

  const selectProject = useCallback((name: string, noticeText: string) => {
    setProject(name)
    setProjectCatalog((prev) => uniqueProjectNames(name, ...prev))
    setProjectOpen(false)
    setNotice(noticeText)
  }, [])

  const clearProject = useCallback(() => {
    setProject(null)
    setProjectOpen(false)
    setNotice('已取消使用项目（本地）')
  }, [])

  const openCreateProjectDialog = useCallback(() => {
    setProjectOpen(false)
    setCreateProjectName('')
    setCreateProjectOpen(true)
  }, [])

  const confirmCreateProject = useCallback(() => {
    const name = createProjectName.trim()
    if (!name) return
    selectProject(
      name,
      `已新建项目「${name}」（本地模拟，未真实创建磁盘文件夹）`
    )
    setCreateProjectOpen(false)
    setCreateProjectName('')
  }, [createProjectName, selectProject])

  const openLocalFolder = useCallback(async () => {
    setProjectOpen(false)
    const name = await pickLocalDirectoryName()
    if (!name) {
      setNotice('未选择文件夹（已取消或浏览器不支持）')
      return
    }
    selectProject(
      name,
      `已打开本地文件夹「${name}」（仅记录目录名，未挂载完整文件系统）`
    )
  }, [selectProject])

  const accessLabel = ACCESS_LEVELS[accessIndex]
  const accessTone =
    accessIndex >= ACCESS_LEVELS.length - 1 ? 'warning' : 'default'

  const cycleAccess = () => {
    setAccessIndex((i) => (i + 1) % ACCESS_LEVELS.length)
    setNotice(null)
  }

  const stripTrailingSlash = useCallback(() => {
    const q = getTrailingSlashQuery(text)
    if (!q) return
    setText(text.slice(0, q.start))
  }, [text])

  const enableMode = useCallback((mode: 'goal' | 'plan') => {
    setAddOpen(false)
    if (mode === 'goal') {
      setGoalMode(true)
      setNotice('已开启目标模式（本地）')
      return
    }
    setPlanMode(true)
    setNotice('已开启计划模式（本地）')
  }, [])

  const applySlashItem = useCallback(
    (item: SlashItem) => {
      const q = getTrailingSlashQuery(text)
      if (q) {
        const before = text.slice(0, q.start).replace(/\s+$/, '')
        setText(before.length ? `${before} ` : '')
      }

      switch (item.id) {
        case 'goal':
          enableMode('goal')
          return
        case 'plan':
          enableMode('plan')
          return
        case 'model':
          setPickerOpen(true)
          setNotice('已打开模型设置（本地）')
          return
        case 'new-chat':
          setText('')
          setSkillTokens([])
          setAttachments([])
          setGoalMode(false)
          setPlanMode(false)
          setNotice('已清空为新聊天草稿（本地，未接会话后端）')
          return
        default:
          break
      }

      if (item.kind === 'skill') {
        setSkillTokens((prev) =>
          prev.some((s) => s.id === item.id)
            ? prev
            : [...prev, { id: item.id, label: item.label }]
        )
        setNotice(
          `已附加技能「${item.label}」（本地 token，未接 Skill Runtime）`
        )
        return
      }

      setNotice(`已选择「${item.label}」（本地模拟）`)
    },
    [text, enableMode]
  )

  const pickFiles = useCallback(() => {
    setAddOpen(false)
    fileInputRef.current?.click()
  }, [])

  const onFilesPicked = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files
      if (!files?.length) return
      const next = Array.from(files).map((file, index) => ({
        id: `file-${Date.now()}-${index}`,
        name: file.name,
        meta: '本地附件',
        icon: (file.type.startsWith('image/') ? 'image' : 'file') as
          | 'file'
          | 'image',
      }))
      setAttachments((prev) => [...prev, ...next])
      setNotice(`已添加 ${next.length} 个本地附件（未上传远程）`)
      event.target.value = ''
    },
    []
  )

  const onComposerKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if (!slashOpen || flatSlashItems.length === 0) return
      const count = flatSlashItems.length

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSlashHighlight((i) => (i + 1) % count)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSlashHighlight((i) => (i - 1 + count) % count)
        return
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        const item = flatSlashItems[slashHighlight] ?? flatSlashItems[0]
        if (item) applySlashItem(item)
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        stripTrailingSlash()
      }
    },
    [
      slashOpen,
      flatSlashItems,
      slashHighlight,
      applySlashItem,
      stripTrailingSlash,
    ]
  )

  const handleToggleConnector = (connectorId: string, selected: boolean) => {
    const taskId = capabilityTaskId
    if (!taskId || !capabilityController) return
    const connectorName =
      capabilitySnapshot?.connectors.find((connector) => connector.id === connectorId)
        ?.name ?? '连接器'
    setCapabilityBusy(true)
    void capabilityController
      .toggleConnector(taskId, connectorId, selected)
      .then(() => {
        setNotice(
          formatTaskConnectorSelectionNotice(connectorName, selected)
        )
      })
      .catch((err) => {
        setNotice(err instanceof Error ? err.message : '更新连接器选用失败')
      })
      .finally(() => setCapabilityBusy(false))
  }

  const handleToggleSkill = (skillId: string, selected: boolean) => {
    const taskId = capabilityTaskId
    if (!taskId || !capabilityController) return
    const prev = capabilitySnapshot?.selection.skillIds ?? []
    const next = selected
      ? [...new Set([...prev, skillId])]
      : prev.filter((id) => id !== skillId)
    setCapabilityBusy(true)
    void capabilityController
      .setSelection(taskId, { skillIds: next })
      .finally(() => setCapabilityBusy(false))
  }

  const handleSelectExpert = (expertId: string | null) => {
    const taskId = capabilityTaskId
    if (!taskId || !capabilityController) return
    setCapabilityBusy(true)
    void capabilityController
      .setSelection(taskId, { expertId })
      .then(() => {
        setNotice(expertId ? '已选用专家（仅后续 Turn 生效）' : '已清除专家')
      })
      .finally(() => setCapabilityBusy(false))
  }

  const handleStartAuth = async (connectorId: string) => {
    if (!capabilityController) return
    const connectorName =
      capabilitySnapshot?.connectors.find((item) => item.id === connectorId)
        ?.name ?? '连接器'
    const authWindow =
      typeof window !== 'undefined'
        ? window.open('about:blank', '_blank')
        : null
    if (authWindow) authWindow.opener = null
    setCapabilityBusy(true)
    try {
      const result = await capabilityController.startAuth(connectorId)
      setNotice(formatStartAuthNotice(result))
      if (
        result.ok &&
        result.phase === 'login_started' &&
        result.verificationUrl &&
        typeof window !== 'undefined'
      ) {
        if (authWindow) {
          authWindow.location.replace(result.verificationUrl)
        } else {
          window.open(result.verificationUrl, '_blank', 'noopener,noreferrer')
        }
        if (capabilityTaskId) {
          void waitForConnectorAuth({
            connectorId,
            refresh: () =>
              capabilityController.refreshAuth(capabilityTaskId, connectorId),
            onAuthorizationRequired: (transition) => {
              if (!transition.verificationUrl) return
              if (authWindow && !authWindow.closed) {
                authWindow.location.replace(transition.verificationUrl)
              } else {
                window.open(
                  transition.verificationUrl,
                  '_blank',
                  'noopener,noreferrer'
                )
              }
              setNotice(transition.message)
            },
          }).then((connected) => {
            if (connected && authWindow && !authWindow.closed) {
              authWindow.close()
            }
            setNotice(
              connected
                ? `「${connectorName}」授权已完成，连接器现在可以选用。`
                : `尚未检测到「${connectorName}」授权完成；可点击「刷新连接状态」重试。`
            )
          })
        }
      } else {
        authWindow?.close()
      }
    } catch (err) {
      authWindow?.close()
      setNotice(err instanceof Error ? err.message : '启动登录失败')
    } finally {
      setCapabilityBusy(false)
    }
  }

  const handleRefreshAuth = async () => {
    const taskId = capabilityTaskId
    if (!taskId || !capabilityController) return
    setCapabilityBusy(true)
    try {
      const result = await capabilityController.refreshAuth(taskId)
      const continuation = result.transitions.find(
        (transition) =>
          transition.phase === 'authorization_required' &&
          transition.verificationUrl
      )
      if (continuation?.verificationUrl && typeof window !== 'undefined') {
        window.open(
          continuation.verificationUrl,
          '_blank',
          'noopener,noreferrer'
        )
      }
      setNotice(continuation?.message ?? '已刷新所有连接器状态')
    } catch (err) {
      setNotice(err instanceof Error ? err.message : '刷新连接状态失败')
    } finally {
      setCapabilityBusy(false)
    }
  }

  // WorkBuddy-style compact + menu with lateral submenus (not full-width panel).
  const addMenu = (
    <CapabilityAddMenu
      open={addOpen}
      onOpenChange={(next) => {
        setAddOpen(next)
        if (next && slashQuery) stripTrailingSlash()
      }}
      trigger={
        <ComposerIconButton
          aria-label='添加文件等内容'
          data-testid='composer-add'
          aria-expanded={addOpen}
          aria-haspopup='menu'
        >
          <Plus className='size-4' />
        </ComposerIconButton>
      }
      snapshot={capabilitySnapshot}
      busy={capabilityBusy}
      onPickFiles={pickFiles}
      onEnableGoal={() => {
        enableMode('goal')
        setAddOpen(false)
      }}
      onEnablePlan={() => {
        enableMode('plan')
        setAddOpen(false)
      }}
      onToggleConnector={handleToggleConnector}
      onToggleSkill={handleToggleSkill}
      onSelectExpert={handleSelectExpert}
      onStartAuth={handleStartAuth}
      onRefreshAuth={handleRefreshAuth}
      onManageConnectors={() => {
        setNotice(
          '连接器管理页后置：当前请在「连接器」列表内开关选用或点「连接」完成 CLI 登录。'
        )
      }}
    />
  )

  const sendRunning = isRuntimeMode ? sendActsAsStop : running
  const sendButton = (
    <ComposerSendButton
      running={sendRunning}
      disabled={!sendRunning && !recording && text.trim().length === 0}
      onClick={handleSend}
      data-testid='composer-submit'
      data-send-mode={sendRunning ? 'stop' : 'send'}
      aria-label={sendRunning ? '停止' : '发送'}
      aria-describedby={noticeId}
    />
  )

  // Env/branch only make sense when a workspace is selected.
  const showEnv = showEnvironmentChip && project !== null
  const showBranch = showBranchChip && project !== null
  // Keep the rail after the first Turn even when no chips remain; the project
  // chip is empty-hub-only, but the two-layer Composer depth is persistent.
  const renderContextBar = showContextBar

  const renderSlashSection = (
    title: string,
    rows: { item: SlashItem; index: number }[]
  ) => {
    if (rows.length === 0) return null
    return (
      <ComposerPanelSection key={title} title={title}>
        {rows.map(({ item, index }) => (
          <ComposerPanelItem
            key={item.id}
            icon={<item.Icon className='size-4' />}
            description={item.description}
            trailing={item.trailing}
            active={index === slashHighlight}
            data-testid={`composer-slash-${item.id}`}
            onSelect={() => applySlashItem(item)}
          >
            {item.label}
          </ComposerPanelItem>
        ))}
      </ComposerPanelSection>
    )
  }

  return (
    <div
      className='sticky bottom-0 z-30 shrink-0 px-4 pt-2 pb-4'
      data-slot='composer'
      data-testid='composer'
      data-composer-mode={mode}
    >
      {/*
        Do not wrap the dock in pointer-events-none: upward popovers (project /
        model menus) extend over EmptyHub and must remain hit-testable.
        Sticky only covers the dock band, so stream clicks above still work.
      */}
      <div className='relative mx-auto w-full max-w-[var(--content-max-width)]'>
        {renderContextBar ? (
          <ComposerContextBar
            data-testid='composer-context-bar'
            className='mx-0'
          >
            {showProjectChip ? (
              <ComposerMenuButton
                label={
                  <span className='flex items-center gap-1.5'>
                    <Folder className='size-4' />
                    {project ?? '选择项目'}
                  </span>
                }
                aria-label={project ? '切换项目' : '选择项目'}
                align='start'
                open={projectOpen}
                onOpenChange={setProjectOpen}
                data-testid='composer-chip-project'
              >
                {/* Codex-like workspace picker: search → list → create/open → clear */}
                <div
                  className='flex flex-col gap-0.5 p-0.5'
                  data-testid='composer-project-menu'
                >
                  <label className='flex h-9 items-center gap-2 rounded-lg px-2 text-muted-foreground'>
                    <Search className='size-4 shrink-0' aria-hidden />
                    <input
                      type='search'
                      value={projectQuery}
                      onChange={(e) => setProjectQuery(e.target.value)}
                      placeholder='搜索工作空间'
                      data-testid='composer-project-search'
                      className='min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground'
                      onKeyDown={(e) => e.stopPropagation()}
                    />
                  </label>

                  <div
                    className='max-h-48 overflow-y-auto'
                    data-testid='composer-project-list'
                  >
                    {filteredProjects.length === 0 ? (
                      <p className='px-2 py-2 text-[13px] text-muted-foreground'>
                        无匹配项目
                      </p>
                    ) : (
                      filteredProjects.map((name) => {
                        const selected = name === project
                        return (
                          <button
                            key={name}
                            type='button'
                            data-testid={`composer-project-option-${name}`}
                            onClick={() =>
                              selectProject(
                                name,
                                `项目已切换为「${name}」（本地，未接远程）`
                              )
                            }
                            className='flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-[var(--wb-hover)]'
                          >
                            <Folder
                              className='size-4 shrink-0 text-muted-foreground'
                              aria-hidden
                            />
                            <span className='min-w-0 flex-1 truncate'>
                              {name}
                            </span>
                            {selected ? (
                              <Check
                                className='size-4 shrink-0 text-foreground'
                                aria-label='当前'
                              />
                            ) : null}
                          </button>
                        )
                      })
                    )}
                  </div>

                  <div
                    className='my-1 h-px bg-[var(--wb-divider)]'
                    role='separator'
                  />

                  <ComposerMenuItem
                    icon={<Plus className='size-4' />}
                    onSelect={openCreateProjectDialog}
                    data-testid='composer-project-create'
                  >
                    新建项目
                  </ComposerMenuItem>
                  <ComposerMenuItem
                    icon={<FolderOpen className='size-4' />}
                    onSelect={() => {
                      void openLocalFolder()
                    }}
                    data-testid='composer-project-open-folder'
                  >
                    打开本地文件夹
                  </ComposerMenuItem>

                  {project ? (
                    <>
                      <div
                        className='my-1 h-px bg-[var(--wb-divider)]'
                        role='separator'
                      />
                      <ComposerMenuItem
                        icon={<FolderX className='size-4' />}
                        onSelect={clearProject}
                        data-testid='composer-project-clear'
                      >
                        不使用项目
                      </ComposerMenuItem>
                    </>
                  ) : null}
                </div>
              </ComposerMenuButton>
            ) : null}

            {showEnv ? (
              <ComposerMenuButton
                label={
                  <span className='flex items-center gap-1.5'>
                    <HardDrive className='size-4' />
                    {environment}
                  </span>
                }
                aria-label='切换环境'
                align='start'
                open={envOpen}
                onOpenChange={setEnvOpen}
                data-testid='composer-chip-env'
              >
                <ComposerMenuSection title='环境'>
                  {ENVIRONMENTS.map((env) => (
                    <ComposerMenuItem
                      key={env}
                      onSelect={() => {
                        setEnvironment(env)
                        setEnvOpen(false)
                        setNotice(`环境已切换为「${env}」（本地）`)
                      }}
                    >
                      {env}
                      {env === environment ? ' · 当前' : ''}
                    </ComposerMenuItem>
                  ))}
                </ComposerMenuSection>
              </ComposerMenuButton>
            ) : null}

            {showBranch ? (
              <ComposerMenuButton
                label={
                  <span className='flex items-center gap-1.5'>
                    <GitBranch className='size-4' />
                    {branch}
                  </span>
                }
                aria-label='切换分支'
                align='start'
                open={branchOpen}
                onOpenChange={setBranchOpen}
                data-testid='composer-chip-branch'
              >
                <ComposerMenuSection title='分支'>
                  {BRANCHES.map((b) => (
                    <ComposerMenuItem
                      key={b}
                      onSelect={() => {
                        setBranch(b)
                        setBranchOpen(false)
                        setNotice(`分支已切换为 ${b}（本地）`)
                      }}
                    >
                      {b}
                      {b === branch ? ' · 当前' : ''}
                    </ComposerMenuItem>
                  ))}
                </ComposerMenuSection>
              </ComposerMenuButton>
            ) : null}
          </ComposerContextBar>
        ) : null}

        <Composer data-testid='composer-shell'>
          <ComposerFloatingPanel
            open={slashOpen}
            data-testid='composer-slash-panel'
          >
            {flatSlashItems.length === 0 ? (
              <p className='px-2 py-3 text-[13px] text-muted-foreground'>
                无匹配命令或技能
              </p>
            ) : (
              <>
                {renderSlashSection('命令', slashPalette.commands)}
                {renderSlashSection('技能', slashPalette.skills)}
              </>
            )}
          </ComposerFloatingPanel>

          {attachments.length > 0 ? (
            <ComposerAttachments data-testid='composer-tokens'>
              {attachments.map((file) => (
                <ComposerAttachmentChip
                  key={file.id}
                  icon={
                    file.icon === 'file' ? (
                      <FileText className='size-3.5' />
                    ) : (
                      <ImageIcon className='size-3.5' />
                    )
                  }
                  name={file.name}
                  meta={file.meta}
                  onRemove={() =>
                    setAttachments((prev) =>
                      prev.filter((f) => f.id !== file.id)
                    )
                  }
                />
              ))}
            </ComposerAttachments>
          ) : null}

          {/* Expert / skill text chips above input; connectors live next to + (WorkBuddy). */}
          {capabilityController && capabilityTaskId ? (
            <CapabilityChips
              variant='stack'
              snapshot={capabilitySnapshot}
              onRemoveConnector={(connectorId) => {
                handleToggleConnector(connectorId, false)
              }}
              onRemoveExpert={() => {
                void capabilityController.setSelection(capabilityTaskId, {
                  expertId: null,
                })
              }}
              onRemoveSkill={(skillId) => {
                const prev = capabilitySnapshot?.selection.skillIds ?? []
                void capabilityController.setSelection(capabilityTaskId, {
                  skillIds: prev.filter((id) => id !== skillId),
                })
              }}
            />
          ) : null}

          <ComposerTextarea
            id='workbench-composer-input'
            data-testid='composer-input'
            value={text}
            onChange={(next) => {
              setText(next)
              if (addOpen) setAddOpen(false)
              if (notice) setNotice(null)
            }}
            onKeyDown={onComposerKeyDown}
            onSubmit={handleSend}
            placeholder='随心输入，输入 / 调用命令与技能'
            aria-label='编写消息'
            leading={
              skillTokens.length > 0
                ? skillTokens.map((skill) => (
                    <ComposerSkillChip
                      key={skill.id}
                      icon={<Sparkles className='size-3.5' />}
                      label={skill.label}
                      data-testid={`composer-skill-${skill.id}`}
                      onRemove={() =>
                        setSkillTokens((prev) =>
                          prev.filter((s) => s.id !== skill.id)
                        )
                      }
                    />
                  ))
                : undefined
            }
          />

          <ComposerToolbar>
            {recording ? (
              <>
                {addMenu}
                <ComposerDictation
                  seconds={seconds}
                  onStop={stopRecording}
                  className='min-w-0 flex-1 px-1'
                  aria-label='停止听写'
                />
                {sendButton}
              </>
            ) : (
              <>
                {addMenu}
                {/* WorkBuddy: selected connector brand icons sit beside + */}
                {capabilityController && capabilityTaskId ? (
                  <CapabilityToolbarConnectors
                    snapshot={capabilitySnapshot}
                    onRemoveConnector={(connectorId) => {
                      handleToggleConnector(connectorId, false)
                    }}
                    onOpenConnector={() => {
                      setAddOpen(true)
                    }}
                  />
                ) : null}
                {goalMode ? (
                  <ComposerModeBadge
                    data-testid='composer-mode-goal'
                    onClear={() => {
                      setGoalMode(false)
                      setNotice('已关闭目标模式（本地）')
                    }}
                  >
                    目标
                  </ComposerModeBadge>
                ) : null}
                {planMode ? (
                  <ComposerModeBadge
                    data-testid='composer-mode-plan'
                    onClear={() => {
                      setPlanMode(false)
                      setNotice('已关闭计划模式（本地）')
                    }}
                  >
                    计划模式
                  </ComposerModeBadge>
                ) : null}
                <ComposerAccessChip
                  icon={<CircleAlert className='size-4' />}
                  tone={accessTone}
                  data-testid='composer-access'
                  title='切换访问级别（本地）'
                  onClick={cycleAccess}
                >
                  {accessLabel}
                </ComposerAccessChip>
                <div className='ms-auto' />
                {showContextGauge ? (
                  <ComposerContextGauge used={48_000} limit={200_000} />
                ) : null}
                {isRuntimeMode ? (
                  <span
                    className='inline-flex min-h-7 items-center rounded-lg px-2 text-[12px] font-medium text-violet-500 dark:text-violet-400'
                    data-testid='composer-model'
                    title='模型由当前 Runtime 决定'
                  >
                    {modelLabel}
                  </span>
                ) : (
                  <ComposerModelPicker
                    label={modelTriggerLabel}
                    open={pickerOpen}
                    onOpenChange={setPickerOpen}
                    data-testid='composer-model'
                    title='模型与推理设置（本地）'
                  >
                    <div className='flex items-center justify-between px-2 pt-1 text-xs text-muted-foreground'>
                      <span>模型</span>
                    </div>
                    <ComposerMenuSection>
                      {MODELS.map((m) => (
                        <ComposerMenuItem
                          key={m.id}
                          onSelect={() => {
                            setModelId(m.id)
                            setNotice(`模型已切换为 ${m.label}（本地）`)
                          }}
                        >
                          {m.label}
                          {m.id === modelId ? ' · 当前' : ''}
                        </ComposerMenuItem>
                      ))}
                    </ComposerMenuSection>
                    <div className='mt-1 flex items-center justify-between border-t border-border/60 px-2 pt-2 text-xs text-muted-foreground'>
                      <span>推理力度</span>
                      <Zap className='size-3.5' />
                    </div>
                    <div className='px-2 pt-1 pb-2'>
                      <ComposerEffortSlider
                        value={effort}
                        onChange={setEffort}
                        labels={[...EFFORT_LABELS]}
                        aria-label='推理力度'
                      />
                    </div>
                    <div className='flex items-center justify-between px-2 text-xs text-muted-foreground'>
                      <span>自主度</span>
                      <ShieldCheck className='size-3.5' />
                    </div>
                    <div className='px-2 pb-2'>
                      <ComposerAutonomyDial
                        value={autonomy}
                        onChange={(next) => {
                          setAutonomy(next)
                          setAccessIndex(
                            Math.min(next, ACCESS_LEVELS.length - 1)
                          )
                        }}
                        labels={[...AUTONOMY_LABELS]}
                        aria-label='自主度'
                      />
                    </div>
                  </ComposerModelPicker>
                )}
                <ComposerIconButton
                  aria-label='语音输入'
                  data-testid='composer-mic'
                  onClick={startRecording}
                >
                  <Mic className='size-4' />
                </ComposerIconButton>
                {sendButton}
              </>
            )}
          </ComposerToolbar>
        </Composer>

        <input
          ref={fileInputRef}
          type='file'
          multiple
          className='hidden'
          data-testid='composer-file-input'
          onChange={onFilesPicked}
        />

        <p
          id={noticeId}
          className='sr-only'
          data-testid='composer-notice'
          role='status'
          aria-live='polite'
        >
          {displayNotice ?? ''}
        </p>
      </div>

      <Dialog
        open={createProjectOpen}
        onOpenChange={(next) => {
          setCreateProjectOpen(next)
          if (!next) setCreateProjectName('')
        }}
      >
        <DialogContent
          className='sm:max-w-md'
          data-testid='composer-create-project-dialog'
        >
          <DialogHeader>
            <DialogTitle>新建项目</DialogTitle>
            <DialogDescription>
              为项目命名。当前为本地模拟：不会在磁盘创建同名文件夹，仅写入工作台状态。
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={createProjectName}
            onChange={(e) => setCreateProjectName(e.target.value)}
            placeholder='输入项目名称'
            data-testid='composer-create-project-input'
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                confirmCreateProject()
              }
            }}
          />
          <DialogFooter className='border-0 bg-transparent p-0 sm:justify-end'>
            <Button
              type='button'
              variant='outline'
              data-testid='composer-create-project-cancel'
              onClick={() => {
                setCreateProjectOpen(false)
                setCreateProjectName('')
              }}
            >
              取消
            </Button>
            <Button
              type='button'
              data-testid='composer-create-project-confirm'
              disabled={!createProjectName.trim()}
              onClick={confirmCreateProject}
            >
              确认
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Public export name used by Task Surface. */
export { TaskComposer as Composer }
