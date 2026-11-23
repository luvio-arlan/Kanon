# KANON Brand Assets

请将在对话中生成的 3 张 KANON 视觉资产另存到当前目录（`assets/brand/`），建议命名如下：

- `kanon-brand-titanium.jpg` — 天然钛灰主视觉品牌卡（用于 README、Pitch Deck、视频片头）
- `kanon-icon-light.jpg` — 纯白底纯黑 1:1 扁平图标（用于矢量化生成主 SVG）
- `kanon-icon-dark.jpg` — 纯黑底纯白 1:1 扁平图标（用于暗色模式与 macOS Dock 图标）

## SVG 工程化建议

在反重力中将 `kanon-icon-light.jpg` 转为矢量 `kanon-mark.svg` 时：

1. 将 `<path>` 的填充设为 `fill="currentColor"`，以便在 `packages/ui` 中随亮/暗模式自动继承文字色。
2. Favicon 直接在 `apps/web/src/app/icon.svg` 中通过 `@media (prefers-color-scheme: dark)` 自动切换黑白双色。
