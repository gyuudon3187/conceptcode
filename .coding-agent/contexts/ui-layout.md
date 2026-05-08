---
description: Read this when debugging wide-layout pane sizing or feature-specific width drift in the TUI.
---

# Wide Layout Pane Sizing

- In the wide workspace, feature switches are supposed to swap pane content, not recompute different pane widths.
- If one feature's main pane looks narrower than another's, check the shared shell row layout before changing feature code.
- For OpenTUI flex rows here, the reliable guardrails were `minWidth: 0` on the participating panes and an explicit `width: "100%"` basis on the shared `mainPane` in `packages/agent-tui/src/render/frame.ts`.
- Without those constraints, intrinsic content width from the support column or feature body can shift the divider even when the geometry ratios are unchanged.
