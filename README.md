# CoGame

**把本地 Codex 配置变成一套可浏览的游戏化装备面板。**

[预览](#界面预览) · [功能](#功能亮点) · [快速开始](#快速开始) · [使用说明](#使用说明) · [项目结构](#项目结构)

<br />

***

CoGame 是一个面向 [Codex](https://openai.com/codex/) 本地环境的轻量级 Web 面板。它会读取当前用户的 Codex 配置，以装备、插件、规则、任务和装扮等游戏化视图集中展示 Skills、MCP Servers、Plugins、Automations 与 `AGENTS.md`，并提供本地 Codex 外观预览和切换能力。

项目使用 Python 标准库提供本地 HTTP 服务，前端由原生 HTML、CSS 和 JavaScript 构建，无需安装额外 Python 依赖。

## 界面预览

### 装备

![CoGame 装备页面](./static/screenshots/equipment.png)

以装备槽形式集中展示 Skills 与 MCP Servers，支持分页浏览，并在底部汇总当前扫描到的能力数量。

### 插件

![CoGame 插件页面](./static/screenshots/plugins.png)

围绕 Codex 角色展示本地已安装插件，可快速识别插件名称、版本和启用状态。

### 规则

![CoGame 规则页面](./static/screenshots/rules.png)

读取并展示全局 `AGENTS.md`，提供同步状态、重新载入和规则编辑入口，便于集中维护 Codex 行为约束。

### 任务

![CoGame 任务页面](./static/screenshots/missions.png)

列出本地 Automations，并在详情面板中展示任务状态、类型、执行计划、配置来源与标识符。

### 装扮

![CoGame 装扮页面](./static/screenshots/wardrobe.png)

扫描本地皮肤资源，展示格式、尺寸和可用状态，同时提供大图预览及 Dream Skin 运行环境信息。

> 截图来自本地实际运行环境，页面内容和数量会随个人 Codex 配置变化。

## 功能亮点

- **装备视图**：分页浏览本地 Skills 与 MCP Servers，并快速查看名称、来源和状态。
- **插件视图**：展示已安装的 Codex Plugins、版本及启用状态。
- **任务视图**：读取本地 Automations，查看计划、类型与运行状态。
- **规则视图**：读取全局 `AGENTS.md`，并提供重新载入与编辑保存入口。
- **装扮管理**：扫描本地皮肤目录，预览、应用皮肤或恢复官方外观。
- **本地优先**：配置扫描在本机完成；敏感配置值不会通过面板返回。
- **零 Python 依赖**：核心服务仅使用 Python 标准库，克隆后即可运行。

## 快速开始

### 运行要求

- Python 3.11 或更高版本
- 已安装并配置 Codex
- Windows 10/11（使用装扮切换功能时必需）

装扮切换还需要：

- Node.js 22+
- 官方 Codex Store 应用
- 已安装的 [Codex Dream Skin](https://github.com/Fei-Away/Codex-Dream-Skin) 运行时（感谢该项目的贡献者们）

### 安装与启动

```powershell
git clone https://github.com/WanAnUncommon/CoGame.git
cd CoGame
python app.py
```

浏览器访问：<http://127.0.0.1:8787>

也可以指定监听地址和端口：

```powershell
python app.py --host 127.0.0.1 --port 9000
```

按 `Ctrl+C` 停止服务。

> \[!IMPORTANT]
> CoGame 会读取本机 Codex 配置。建议保持默认的 `127.0.0.1` 监听地址，不要将服务直接暴露到公网。皮肤相关接口仅接受本机回环地址请求。

## 使用说明

### 浏览本地 Codex 配置

启动后，CoGame 会自动扫描默认的 Codex 主目录：

```text
%USERPROFILE%\.codex
```

如需读取其他目录，可在启动前设置 `CODEX_HOME`：

```powershell
$env:CODEX_HOME = "D:\path\to\.codex"
python app.py
```

通过顶部导航可切换不同页面：

| 页面 | 内容                     |
| -- | ---------------------- |
| 装备 | Skills、MCP Servers     |
| 插件 | 已安装的 Codex Plugins     |
| 规则 | 全局 `AGENTS.md` 内容与编辑入口 |
| 任务 | Automations 及其计划信息     |
| 装扮 | 本地皮肤目录、运行环境与皮肤操作       |

点击右上角刷新按钮可重新扫描本地配置。

### 添加自定义皮肤

1. 将 `.png`、`.jpg`、`.jpeg` 或 `.webp` 图片放入 `static/skins/`。
2. 刷新 CoGame，图片会自动出现在“装扮”页面。
3. 选择图片并点击“应用皮肤”。

皮肤文件必须满足以下限制：

- 文件大小不超过 16 MB
- 单边尺寸不超过 16,384 像素
- 总像素不超过 5,000 万
- 必须是有效的 PNG、JPEG 或 WebP 文件，且不能是链接文件

可选的 `static/skins/skins.json` 用于为图片补充名称、描述和来源：

```json
{
  "my-skin.jpg": {
    "name": "My Skin",
    "description": "自定义皮肤说明",
    "source": "Local"
  }
}
```

> \[!WARNING]
> 应用或恢复皮肤会重启现有 Codex 窗口。请先保存正在进行的工作。

## 数据来源

CoGame 只读取展示所需的本地信息：

| 数据          | 默认来源                                                               |
| ----------- | ------------------------------------------------------------------ |
| Skills      | `$CODEX_HOME/skills/**/SKILL.md`、`$CODEX_HOME/plugins/**/SKILL.md` |
| MCP Servers | `$CODEX_HOME/config.toml` 中的 `mcp_servers`                         |
| Plugins     | `$CODEX_HOME/plugins/**/.codex-plugin/plugin.json`                 |
| Automations | `$CODEX_HOME/automations/*/automation.toml`                        |
| Rules       | 全局及当前项目路径中的 `AGENTS.md`                                            |
| Skins       | `static/skins/`                                                    |

MCP 环境变量只展示键名，不返回对应的值。

## 项目结构

```text
CoGame/
├── app.py                       # 本地 HTTP 服务与 API
├── codex_scan.py                # Codex 配置扫描器
├── state_scan.py                # 扫描结果整理与去重
├── dream_skin.py                # 皮肤目录、校验与运行时桥接
├── scripts/
│   └── apply_dream_skin.ps1     # Dream Skin 操作脚本
├── static/
│   ├── index.html               # Web 页面
│   ├── app.js                   # 前端交互
│   ├── styles.css               # 页面样式
│   ├── screenshots/             # README 界面截图
│   └── skins/                   # 本地皮肤与元数据
└── tests/                       # 自动化测试
```

## 路线图

- [x] Skills、MCP、Plugins 与 Automations 扫描
- [x] 游戏化响应式 Web 界面
- [x] 本地皮肤预览、应用与恢复
- [ ] 更丰富的配置状态与诊断信息
- [ ] 跨平台装扮能力
- [ ] 可配置的主题与布局

## 参与贡献

欢迎通过 [Issues](https://github.com/WanAnUncommon/CoGame/issues) 报告问题或提出建议，也可以 Fork 仓库并提交 Pull Request。

提交改动时，请保持实现轻量、避免泄露本地配置，并为行为变更补充相应测试。

## 许可证

本项目当前尚未提供开源许可证。在许可证发布前，源代码的使用、复制和分发权利仍由项目作者保留。
