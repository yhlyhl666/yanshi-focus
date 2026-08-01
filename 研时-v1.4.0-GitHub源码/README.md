# 研时 - 考研专注计时器

> 一款为考研复习设计的 Windows 桌面专注工具：把计时、任务、科目统计和考研倒计时放在同一个安静的学习空间里。

![研时首页](docs/images/home.png)

---

## 核心功能

### 专注计时

- 支持专注与休息模式
- 提供 25、45、60、90 分钟快捷时长
- 支持暂停、重置、跳过、自动开始休息和严格模式
- 支持全屏沉浸式专注页面
- 计时运行期间阻止系统休眠
- 保存计时结束时间，应用重启后可恢复剩余时间

### 科目与任务

- 内置数学、英语、政治、专业课四类科目
- 新建、完成和删除学习任务
- 设置预计番茄钟数量
- 单独编辑每项任务的精力值，并实时计算当日任务负荷
- 将当前专注与具体任务关联

### 精力与放松

- 根据未完成任务的精力值计算当日压力
- 内置拉伸、听歌、散步、限时娱乐、补充能量和小睡选项
- 自定义放松活动的名称、时长与减压值，并保存在本机
- 删除自定义活动后支持 10 秒内撤销
- 宠物根据专注、暂停、完成任务和放松记录切换表情与文案

### 考研倒计时

- 自定义初试目标日期
- 提供 28 届预计日期快捷设置
- 首页和侧边栏实时展示剩余天数
- 旧版本占位日期自动迁移

![专注设置](docs/images/settings.png)

### 数据统计

- 展示累计次数、累计时长和活跃日均
- 展示各科历史累计时长及比例
- 支持日、周、月三个统计周期
- 使用 SVG 环形图展示科目分布
- 使用周/月柱状图展示每日复习节奏
- 支持补录、减少、编辑和删除专注记录
- 所有修正实时同步到累计数据、饼图和柱状图

![数据统计](docs/images/statistics.png)

> 统计页截图使用自动生成的演示数据，不包含真实用户记录。

---

## 技术架构

```text
Electron Main Process
├── BrowserWindow 桌面窗口
├── 单实例启动与窗口尺寸记忆
├── powerSaveBlocker 防止专注期间休眠
└── file:// 加载 Vite 构建产物

Preload Bridge
└── contextBridge 暴露最小化 IPC 能力

React Renderer
├── 今日专注
├── 学习任务
├── 数据统计
├── 专注设置
├── 任务精力、减压记录与自定义放松
├── localStorage 本地持久化
└── sessions 统一统计数据源
```

### 技术栈

| 模块 | 技术 |
|---|---|
| UI | React 19、CSS、lucide-react |
| 构建 | Vite 8 |
| 桌面端 | Electron 43 |
| 安装包 | Electron Builder、NSIS |
| 数据 | localStorage，本地优先 |
| 图表 | 原生 SVG、CSS Grid |
| 自动检查 | Node.js、Chrome DevTools Protocol |

---

## 安装使用

### 普通用户

1. 前往 [GitHub Releases](../../releases) 下载最新版 Windows 安装包。
2. 双击安装包，选择安装目录。
3. 安装完成后，从桌面快捷方式启动“研时”。

目前支持 Windows 10/11 x64。由于个人开源项目暂未购买代码签名证书，Windows SmartScreen 可能显示未知发布者提示。

### 本地开发

环境要求：Node.js 20+、npm、Windows。

```bash
npm install
npm run desktop:dev
```

### 构建前端

```bash
npm run build
```

### 构建 Windows 安装包

```bash
npm run desktop:dist
```

安装包生成在 `release/` 目录。

---

## 质量检查

```bash
# 检查 file:// 环境下的构建资源路径
npm run desktop:check

# 启动真实 Electron 窗口并验证核心页面与按钮
npm run desktop:render-check
```

自动检查会验证：

- React 页面成功挂载，不是白屏
- 考研日期正确初始化
- “应用计时设置”可以点击并显示成功状态
- “减少时长”和“补录时长”弹窗可以打开

---

## 项目结构

```text
研时/
├── electron/
│   ├── main.cjs                 # Electron 主进程
│   └── preload.cjs              # 安全 IPC 桥接
├── scripts/
│   ├── check-desktop-assets.mjs # 构建资源检查
│   ├── check-desktop-render.mjs # 真实桌面渲染检查
│   └── generate-icon.mjs        # 图标生成
├── src/
│   ├── assets/                  # 沉浸模式资源
│   ├── App.jsx                  # 主要业务逻辑与视图
│   ├── main.jsx                 # React 入口
│   └── styles.css               # 界面样式
├── docs/images/                 # README 展示图
├── package.json
└── vite.config.js
```

---

## 数据说明

- 任务、设置、专注记录、减压记录、自定义放松选项和计时恢复状态保存在当前电脑。
- 覆盖安装通常不会删除数据。
- 当前版本没有账号系统和云同步。
- 卸载、系统清理或更换电脑前，建议等待后续的数据导出功能，或手动备份 Electron 用户数据目录。

---

## 已解决的工程问题

### Electron 安装版打开后白屏

Vite 默认生成 `/assets/...` 绝对资源路径，在 Electron 的 `file://` 环境无法正确解析。项目通过 `base: './'` 生成相对路径，并增加构建资源检查与真实 Electron 启动测试，避免问题再次出现。

### 计时受窗口暂停或应用重启影响

计时运行时保存目标结束时间 `endAt`，恢复时使用 `endAt - Date.now()` 重新计算剩余秒数，而不是只依赖内存中的 `setInterval`。

### 手动修正后统计口径不一致

补录、减少和单条编辑最终都修改统一的 `sessions` 数据集合，首页、累计数据、环形图和柱状图都从该集合派生，避免维护多份统计结果。

---

## 后续计划

- [ ] 数据导出、导入与自动备份
- [ ] 从 localStorage 迁移到 SQLite
- [ ] 拆分 `App.jsx`，完善组件与数据层结构
- [ ] 自定义科目与科目颜色
- [ ] 周目标、月目标和复习阶段计划
- [ ] macOS 与 Linux 构建
- [ ] 单元测试和更多桌面端交互测试

---

## 隐私

研时采用本地优先设计，不需要注册账号，不会主动上传任务、专注记录和设置。当前版本不包含广告、统计 SDK 或云端服务。

## 许可证

本项目使用 [MIT License](LICENSE)。

---

> 不必着急，日拱一卒。
