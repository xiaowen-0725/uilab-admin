## [Unreleased]

### Added

- **Phase 3C Workbench Composer fidelity**: UI Lab `agent-composer` motion block under `src/components/motion/agent-composer` (portal menus, full-width add/`/` panels, skill tags, mode badges)
- Workbench Composer local product interactions: context-rail project picker (search / create dialog / open local folder / clear), shell-width `+` menu, `/` command+skill palette, inline skill tags (`#7eb8f0`), scenario `show*` toggles for context rail chips
- AI-first contracts: `AGENTS.md`, Admin `docs/ai/*`, `$uilab-admin` skill, scaffolds
- CLI `uilab-admin`: `check`, `add`, `set-shell`, `init`, `apply-scenario`
- Scenario packs: `ops-console`, `saas-admin`, `agent-desktop`
- Agent desktop workspace canvas (`src/features/workspace`)
- Project status snapshot: `PROJECT_STATUS.md`
- Agent Workbench domain glossary, ADRs, architecture layout and implementation roadmap
- Phase 0 Admin baseline evidence for Playwright UI flows, CLI generation and quality gates
- Phase 1 Template Platform workspace: `archetypes/admin`, `tooling/*`, monorepo root orchestration
- **Phase 2A minimal Foundation**: private source-consumed `@uilab/foundation` with public exports `./ui/button`, `./ui/input`, `./styles/tokens.css` only
- Foundation Browser tests for Button/Input public Interface; Admin compatibility re-exports
- Foundation boundary gate (`check:foundation`) and CLI copy-and-own materialization into derived `packages/foundation` + mini `pnpm-workspace.yaml`
- **Phase 3 Agent Workbench Shell skeleton**: runnable `@uilab/agent-workbench` peer Archetype with Composition Root, `workbench-session` / `task` / `work-surface` Modules, Navigator, Adaptive Context Panel, placeholder Single-pane + Tabs Work Surface Host, static fixtures, reducer + browser integration tests
- Workbench boundary gate (`check:workbench`) and root scripts `dev:workbench` / `preview:workbench` / `dev:admin` (default `pnpm dev` remains Admin)

### Changed

- Workbench / platform contracts: UI Lab registry-first assembly + upstream sync; local Runtime-like interactivity with honest remote boundaries
- Composer dock visual hierarchy (canvas / rail / shell colors), opaque floating panels, textarea focus ring scoped off global blue ring
- **Phase 3B Codex pane chrome + motion**: Task/Work peer 44px toolbars; Context/Work controls use `SlidersHorizontal` / `PanelBottom`; Work is an always-mounted right-anchored reserved-space drawer whose left boundary advances while content stays at normal scale (open 200ms, close 160ms, maximize/restore 180ms); keyboard Work/Context/Escape stay instant; Context pointer open remains 140ms opacity+translateY. The earlier default View Transition snapshot morph was removed after frame-by-frame review. Does **not** claim Runtime, Surfaces, or Phase 4
- **Phase 3A Workbench inset layout polish**: Agent Workbench root uses sidebar background plane; 272px reserved Navigator; 8px inset Workspace (12px radius, border/shadow on desktop/medium; full-bleed narrow); merged task-aware top bar; TaskSurface content-only Interface; Codex-style floating Composer; content-height Context card; pointer 180ms drawer motion vs keyboard-instant `Ctrl/Cmd+B` (Shell-owned motion source); `lucide-react` in Workbench package only. Does **not** claim Runtime, Surfaces, or Phase 4
- Migrated component base to official shadcn Base UI (`base-nova`)
- Localized primary admin surfaces to Chinese-first
- Provider defaults now consume `src/config/admin-preferences.ts`
- Documented `agent-desktop` as the legacy Admin composition to preserve during migration toward a standalone Agent Workbench Archetype
- **Phase 1 Batch 1A–1C**: Admin application lives under `archetypes/admin`; Admin-owned assets moved to `archetypes/admin/docs/ai` and `archetypes/admin/scaffolds`
- Canonical CLI / quality-gate implementations live under `tooling/template-cli` and `tooling/quality-gates`; root `cli/uilab-admin.mjs` and `scripts/check-ai.mjs` remain compatibility wrappers
- Root `skill/uilab-admin` remains the externally discovered front door and now links to `archetypes/admin/docs/ai/*`; generated apps rewrite those links back to local `docs/ai`
- CLI / gate path model uses three roots: Admin app source, Admin assets (`docs/ai` + `scaffolds`), and platform support (skill / configs)
- **Contract ownership**: platform `AGENTS.md` / `README.md` stay at repo root; Admin/derived-app contracts are Archetype-owned at `archetypes/admin/AGENTS.md` and `archetypes/admin/README.md`. `init` materializes those Admin-local files (via filtered Admin body copy) and does **not** copy platform-root AGENTS/README into generated apps
- Explicit platform `--template` requires canonical `tooling/template-cli` and `tooling/quality-gates` (no fallback to import-only root wrappers)
- Root commands (`pnpm dev`, `typecheck`, `build`, `test`, `check:ai`, `uilab-admin`) remain valid via workspace delegation and wrappers
- **Phase 2A**: root `typecheck` / `build` / `test` verify Foundation before Admin; `pnpm check` includes `check:foundation`; Admin tokens/Button/Input implementation moved into Foundation with thin compatibility modules
- **Phase 3**: root `typecheck` / `build` / `test` also cover Workbench; `check:foundation` verifies Workbench as second consumer of existing Button/Input/tokens (exports unchanged); `pnpm check` includes `check:workbench`
- Full Phase 2 (broader primitives/providers, shared theme Provider) is **still not** claimed complete
- Phase 3 does **not** deliver Agent Runtime, Surface Registry, Document/Browser/Review Surfaces, persistence, desktop host, or `uilab-admin init` Workbench generation

### Fixed

- Base UI menu/group, command palette, profile menu, theme settings previews
- routeTree regeneration after CLI scaffold/init
- Restored Browser Mode tests to a green 17-file / 103-test baseline by loading application styles and aligning assertions with current Chinese accessible UI contracts
- Restored real click submission for sign-in, sign-up, forgot-password and OTP forms after the Base UI Button migration
- Removed Base UI controlled-state warnings from the task mutation form reset flow
- Made sidebar initial/reset state follow `adminPreferenceDefaults.layout`, including generated compact/full scenarios; Browser coverage is now 18 files / 108 tests

## v2.2.1 (2025-11-06)

### Fix

- **style**: update data attribute class in authenticated layout (#249)
- prevent navigation to 500 page during development (#240)
- **style**: apply variant 'destructive' to sign-out buttons (#236)
- add missing space in profile form (#235)

### Refactor

- enhance tables and update table layout (#234)

## v2.2.0 (2025-10-09)

### Feat

- add analytics tab in dashboard page (#220)
- add extra AppTitle component for sidebar header (#216)
- update 2-column sign in page (#213)

### Fix

- update sidebar menu chevron direction in RTL mode (#229)
- pagination button spacing (#215)
- upgrade lucide-react to solve antivirus warning (#211)

### Refactor

- move sidebar related components into app-sidebar
- change SidebarInset component from 'main' to 'div'
- replace extra main container query with content container query
- replace inline svg logo with logo component (#214)

## v2.1.0 (2025-08-23)

### Feat

- enhance data table pagination with page numbers (#207)
- enhance auth flow with sign-out dialogs and redirect functionality (#206)

### Refactor

- reorganize utility files into `lib/` folder (#209)
- extract data-table components and reorganize structure (#208)

## v2.0.0 (2025-08-16)

### BREAKING CHANGE

- CSS file structure has been reorganized

### Feat

- add search param sync in apps route (#200)
- improve tables and sync table states with search param (#199)
- add data table bulk action toolbar (#196)
- add config drawer and update overall layout (#186)
- RTL support (#179)

### Fix

- adjust layout styles in search and top nav in dashboard page
- update spacing and layout styles
- update faceted icon color
- improve user table hover & selected styles (#195)
- add max-width for large screens to improve responsiveness (#194)
- adjust chat border radius for better responsiveness (#193)
- update hard-coded or inconsistent colors (#191)
- use variable for inset layout height calculation
- faded-bottom overflow issue in inset layout
- hide unnecessary configs on mobile (#189)
- adjust file input text vertical alignment (#188)

### Refactor

- enforce consistency and code quality (#198)
- improve code quality and consistency (#197)
- update error routes (#192)
- remove DirSwitch component and its usage in Tasks (#190)
- standardize using cookie as persist state (#187)
- separate CSS into modular theme and base styles (#185)
- replace tabler icons with lucide icons (#183)

## v1.4.2 (2025-07-23)

### Fix

- remove unnecessary transitions in table (#176)
- overflow background in tables (#175)

## v1.4.1 (2025-06-25)

### Fix

- user list overflow in chat (#160)
- prevent showing collapsed menu on mobile (#155)
- white background select dropdown in dark mode (#149)

### Refactor

- update font config guide in fonts.ts (#164)

## v1.4.0 (2025-05-25)

### Feat

- **clerk**: add Clerk for auth and protected route (#146)

### Fix

- add an indicator for nested pages in search (#147)
- update faded-bottom color with css variable (#139)

## v1.3.0 (2025-04-16)

### Fix

- replace custom otp with input-otp component (#131)
- disable layout animation on mobile (#130)
- upgrade react-day-picker and update calendar component (#129)

### Others

- upgrade Tailwind CSS to v4 (#125)
- upgrade dependencies (#128)
- configure automatic code-splitting (#127)

## v1.2.0 (2025-04-12)

### Feat

- add loading indicator during page transitions (#119)
- add light favicons and theme-based switching (#112)
- add new chat dialog in chats page (#90)

### Fix

- add fallback font for fontFamily (#110)
- broken focus behavior in add user dialog (#113)

## v1.1.0 (2025-01-30)

### Feat

- allow changing font family in setting

### Fix

- update sidebar color in dark mode for consistent look (#87)
- use overflow-clip in table paginations (#86)
- **style**: update global scrollbar style (#82)
- toolbar filter placeholder typo in user table (#76)

## v1.0.3 (2024-12-28)

### Fix

- add gap between buttons in import task dialog (#70)
- hide button sort if column cannot be hidden & update filterFn (#69)
- nav links added in profile dropdown (#68)

### Refactor

- optimize states in users/tasks context (#71)

## v1.0.2 (2024-12-25)

### Fix

- update overall layout due to scroll-lock bug (#66)

### Refactor

- analyze and remove unused files/exports with knip (#67)

## v1.0.1 (2024-12-14)

### Fix

- merge two button components into one (#60)
- loading all tabler-icon chunks in dev mode (#59)
- display menu dropdown when sidebar collapsed (#58)
- update spacing & alignment in dialogs/drawers
- update border & transition of sticky columns in user table
- update heading alignment to left in user dialogs
- add height and scroll area in user mutation dialogs
- update `/dashboard` route to just `/`
- **build**: replace require with import in tailwind.config.js

### Refactor

- remove unnecessary layout-backup file

## v1.0.0 (2024-12-09)

### BREAKING CHANGE

- Restructured the entire folder
hierarchy to adopt a feature-based structure. This
change improves code modularity and maintainability
but introduces breaking changes.

### Feat

- implement task dialogs
- implement user invite dialog
- implement users CRUD
- implement global command/search
- implement custom sidebar trigger
- implement coming-soon page

### Fix

- uncontrolled issue in account setting
- card layout issue in app integrations page
- remove form reset logic from useEffect in task import
- update JSX types due to react 19
- prevent card stretch in filtered app layout
- layout wrap issue in tasks page on mobile
- update user column hover and selected colors
- add setTimeout in user dialog closing
- layout shift issue in dropdown modal
- z-axis overflow issue in header
- stretch search bar only in mobile
- language dropdown issue in account setting
- update overflow contents with scroll area

### Refactor

- update layouts and extract common layout
- reorganize project to feature-based structure

## v1.0.0-beta.5 (2024-11-11)

### Feat

- add multiple language support (#37)

### Fix

- ensure site syncs with system theme changes (#49)
- recent sales responsive on ipad view (#40)

## v1.0.0-beta.4 (2024-09-22)

### Feat

- upgrade theme button to theme dropdown (#33)
- **a11y**: add "Skip to Main" button to improve keyboard navigation (#27)

### Fix

- optimize onComplete/onIncomplete invocation (#32)
- solve asChild attribute issue in custom button (#31)
- improve custom Button component (#28)

## v1.0.0-beta.3 (2024-08-25)

### Feat

- implement chat page (#21)
- add 401 error page (#12)
- implement apps page
- add otp page

### Fix

- prevent focus zoom on mobile devices (#20)
- resolve eslint script issue (#18)
- **a11y**: update default aria-label of each pin-input
- resolve OTP paste issue in multi-digit pin-input
- update layouts and solve overflow issues (#11)
- sync pin inputs programmatically

## v1.0.0-beta.2 (2024-03-18)

### Feat

- implement custom pin-input component (#2)

## v1.0.0-beta.1 (2024-02-08)

### Feat

- update theme-color meta tag when theme is updated
- add coming soon page in broken pages
- implement tasks table and page
- add remaining settings pages
- add example error page for settings
- update general error page to be more flexible
- implement settings layout and settings profile page
- add error pages
- add password-input custom component
- add sign-up page
- add forgot-password page
- add box sign in page
- add email + password sign in page
- make sidebar responsive and accessible
- add tailwind prettier plugin
- make sidebar collapsed state in local storage
- add check current active nav hook
- add loader component ui
- update dropdown nav by default if child is active
- add main-panel in dashboard
- **ui**: add dark mode
- **ui**: implement side nav ui

### Fix

- update incorrect overflow side nav height
- exclude shadcn components from linting and remove unused props
- solve text overflow issue when nav text is long
- replace nav with dropdown in mobile topnav
- make sidebar scrollable when overflow
- update nav link keys
- **ui**: update label style

### Refactor

- move password-input component into custom component dir
- add custom button component
- extract redundant codes into layout component
- update react-router to use new api for routing
- update main panel layout
- update major layouts and styling
- update main panel to be responsive
- update sidebar collapsed state to false in mobile
- update sidebar logo and title
- **ui**: remove unnecessary spacing
- remove unused files
