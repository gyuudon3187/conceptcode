export type ArchonWorkflowNodeKind = "command" | "prompt" | "bash"

export type ArchonValidationFinding = {
  severity: "error" | "warning"
  message: string
  nodeId?: string
}

export type ArchonWorkflowNode = {
  id: string
  kind: ArchonWorkflowNodeKind
  body: string
  dependsOn: string[]
  when: string | null
  triggerRule: string | null
  context: string | null
}

export type ArchonWorkflow = {
  path: string
  relativePath: string
  name: string
  description: string
  provider: string | null
  model: string | null
  interactive: boolean
  interactiveUsesDefault: boolean
  tags: string[]
  worktreeEnabled: boolean
  worktreeEnabledUsesDefault: boolean
  nodes: ArchonWorkflowNode[]
}

export type ArchonCommand = {
  path: string
  relativePath: string
  name: string
  description: string | null
  argumentHint: string | null
  body: string
}

export type ArchonWorkflowEntry = {
  path: string
  relativePath: string
  workflow: ArchonWorkflow | null
  findings: ArchonValidationFinding[]
  readOnlyReason: string | null
  parseError: string | null
  referencedCommandNames: string[]
}

export type ArchonCommandEntry = {
  path: string
  relativePath: string
  command: ArchonCommand | null
  findings: ArchonValidationFinding[]
  parseError: string | null
  referencedByWorkflowPaths: string[]
}

export type ArchonCatalog = {
  workflows: ArchonWorkflowEntry[]
  commands: ArchonCommandEntry[]
}

export type ArchonSubmode = "workflows" | "commands"

export type ArchonMetadataModalKind = "create-workflow" | "edit-workflow" | "create-command" | "edit-command"

export type ArchonMetadataFieldKey = "fileName" | "name" | "description" | "provider" | "model" | "interactive" | "tags" | "worktreeEnabled" | "argumentHint" | "bodyTemplate"

export type ArchonMetadataEditorState =
  | {
      kind: "text"
      field: Exclude<ArchonMetadataFieldKey, "interactive" | "tags" | "worktreeEnabled" | "bodyTemplate" | "provider" | "model">
      draft: string
    }
  | {
      kind: "enum"
      field: Extract<ArchonMetadataFieldKey, "provider" | "model" | "interactive" | "worktreeEnabled" | "bodyTemplate">
      query: string
      selectedIndex: number
    }
  | {
      kind: "tags"
      query: string
      selectedIndex: number
    }

export type ArchonMetadataModalState = {
  kind: ArchonMetadataModalKind
  fieldIndex: number
  actionIndex: 0 | 1 | null
  editor: ArchonMetadataEditorState | null
  values: {
    fileName: string
    name: string
    description: string
    provider: string
    model: string
    interactive: string
    tags: string[]
    worktreeEnabled: string
    argumentHint: string
    bodyTemplate: string
  }
}

export type ArchonNodeModalState = {
  kind: "create-node" | "edit-node"
  fieldIndex: number
  dependencyCursor: number
  values: {
    id: string
    kind: ArchonWorkflowNodeKind
    body: string
    when: string
    triggerRule: string
    context: string
    dependsOn: string[]
  }
}

export type ArchonState = {
  workspaceRoot: string
  catalog: ArchonCatalog
  submode: ArchonSubmode
  selectedWorkflowPath: string | null
  selectedCommandPath: string | null
  selectedWorkflowNodeId: string | null
  dirtyPaths: string[]
  pendingDeletePaths: string[]
  metadataModal: ArchonMetadataModalState | null
  nodeModal: ArchonNodeModalState | null
}

export type ArchonRenderColors = {
  accent: string
  accentSoft: string
  border: string
  error: string
  muted: string
  selectedBg: string
  selectedFg: string
  text: string
  warning: string
  panel?: string
  panelSoft?: string
}
