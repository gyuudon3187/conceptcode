import { ScrollBoxRenderable, type CliRenderer } from "@opentui/core"

export function createScrollBox(renderer: CliRenderer): ScrollBoxRenderable {
  const scroll = new ScrollBoxRenderable(renderer, {
    width: "100%",
    height: "100%",
    viewportCulling: false,
    scrollbarOptions: { showArrows: false },
  })
  scroll.verticalScrollBar.visible = false
  scroll.horizontalScrollBar.visible = false
  return scroll
}
