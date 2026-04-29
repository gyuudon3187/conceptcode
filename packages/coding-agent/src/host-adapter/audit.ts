import type { ToolAuditEntry, ToolAuditSink } from "../types"

export class InMemoryToolAuditSink implements ToolAuditSink {
  readonly entries: ToolAuditEntry[] = []

  log(entry: ToolAuditEntry): void {
    this.entries.push(entry)
  }
}

export class NoopToolAuditSink implements ToolAuditSink {
  log(): void {}
}
