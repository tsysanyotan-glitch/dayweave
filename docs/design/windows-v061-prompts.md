# Windows v0.6.1 北京时间浮条设计

使用内置 ImageGen，先生成设计稿再编码。参考用户提供的 Windows 浮条截图；设计稿为 `dayweave-windows-v061-clock.png`。

## 最终提示词

```text
Use case: ui-mockup
Asset type: Windows DayWeave edge floating rail design update, implementation reference.
Primary request: Add Beijing time and calendar date in the bottom free area of the existing slim Windows DayWeave floating rail shown in the attached reference. Preserve the quiet sage-green aesthetic, rounded corners, first task summary, brand dot, and hover-to-expand hint.
Input images: latest user screenshot is a reference for layout and existing dark rail, not text to reproduce outside the application.
Composition: one clean high fidelity 2x2 design board, no desktop icons or wallpaper. Top row: dark vertical rail, light vertical rail, each about 76 logical pixels wide and 248 high, with consistent footer. Bottom row: dark horizontal edge rail, light horizontal edge rail, each about 280 logical pixels wide and 72 high. Make actual widgets prominent and readable.
Text verbatim in widgets: "日序", "今天，留一点秩序", "悬停展开"; clock footer "北京时间", "20:38", "10月21日", "周三". In horizontal mode use compact "20:38" and "10/21 周三" next to a subtle vertical separator. Footer uses tabular modern sans-serif digits, largest time, smaller muted date, readable contrasts. Add small board labels outside: "深色 · 侧边", "浅色 · 侧边", "深色 · 上下边", "浅色 · 上下边".
Constraints: Only design the added clock/date and its spacing in the existing edge rail. Native Windows application UI. Do not invent navigation, settings, buttons, or task features. No red annotations, no watermarks. Flat polished UI, no device mockup, crisp Chinese text, generous presentation margin.
```
