# Robot Admin — AI Agent 指南

> 适用于：**GitHub Copilot · Claude Code · Cursor · Codex CLI · Windsurf · Cline** 等所有 AI 编码工具
>
> 完整规范 → `.github/copilot-instructions.md`
> 可用 Skills → `.github/skills/`（6 个流程化技能）
> MCP 工具 → `bun run mcp/server.ts`（组件库 / 路由 / API 实时查询）

---

## 强制约束

### 包管理器

```bash
# ✅ 唯一允许
bun install
bun run <script>

# ❌ 禁止使用
npm / yarn / pnpm
```

### 命名规范（违反则不合规）

| 类型         | 约定                       | 正确                 | 错误              |
| ------------ | -------------------------- | -------------------- | ----------------- |
| Store 导出   | `s_` + camelCase + `Store` | `s_userStore`        | `useUserStore`    |
| 全局组件目录 | `C_` + PascalCase          | `C_Header/`          | `header/`         |
| 局部组件目录 | `c_` + camelCase           | `c_detail/`          | `Detail/`         |
| 工具函数文件 | `d_` 前缀                  | `d_auth.ts`          | `auth.ts`         |
| Composable   | `use` + PascalCase         | `useLoginController` | `loginController` |
| API 函数     | 动词 + 资源 + `Api`        | `getUserListApi`     | `getUsers`        |

### 组件必须声明 name

```vue
<script setup lang="ts">
  defineOptions({ name: 'ComponentName' }) // 必须，用于 KeepAlive 和 DevTools
</script>
```

### 样式写法

```vue
<style lang="scss" scoped>
  @use './index.scss';
</style>
```

---

## 自动导入（无需手动 import）

以下 API 在 `.vue` / `.ts` 中**自动可用**，生成代码中不要写 import 语句：

```
Vue:     ref · computed · watch · onMounted · nextTick · reactive · readonly · h
Router:  useRoute · useRouter
Pinia:   defineStore · storeToRefs
VueUse:  useLocalStorage · useClipboard · useDebounceFn
NaiveUI: NCard · NButton · NSpace · NInput · NSelect · NTag · NModal · NDrawer
         NGrid · NGi · NTabs · NTabPane · useMessage · useDialog · useNotification
C_*:     C_Table · C_Form · C_ActionBar · C_Icon · C_Tree … (51+ 个，用 MCP 查询)
Stores:  s_userStore · s_themeStore · s_permissionStore …
```

---

## 项目生态包（优先使用，禁止引入功能重复的第三方包）

| 包                                 | 用途                                                   |
| ---------------------------------- | ------------------------------------------------------ |
| `@robot-admin/naive-ui-components` | 51+ 业务组件（C_Form / C_Table / C_ActionBar…）        |
| `@robot-admin/request-core`        | HTTP 请求（getData / postData / useTableCrud）         |
| `@robot-admin/form-validate`       | 表单验证（PRESET_RULES，48+ 规则）                     |
| `@robot-admin/directives`          | 11 个 Vue 指令（v-copy / v-permission / v-watermark…） |
| `@robot-admin/layout`              | 6 种布局模式                                           |
| `@robot-admin/file-utils`          | Excel / ZIP / 分片上传                                 |
| `@robot-admin/theme`               | 主题切换（Light / Dark / System）                      |

---

## MCP 工具（编写代码前优先查询）

MCP Server 路径：`mcp/server.ts`，配置见 `.vscode/mcp.json`

| 工具                      | 何时调用                                |
| ------------------------- | --------------------------------------- |
| `list_components`         | 不确定哪些 C\_ 组件可用时               |
| `get_component_api(name)` | 使用某个组件前，查其 Props / Emits 定义 |
| `list_routes`             | 注册新路由或做路由跳转前                |
| `list_api_endpoints`      | 引用 API 函数前，确认函数名是否已存在   |
| `get_preset_rules`        | 编写表单验证规则前                      |

---

## 可用 Skills（流程化任务自动触发）

| Skill              | 触发词                                    |
| ------------------ | ----------------------------------------- |
| `page-codegen`     | 生成页面 · 建个页面 · 口述需求 · scaffold |
| `api-contract`     | 接口约定 · 生成 api · swagger 转 ts       |
| `prototype-scan`   | 原型解析 · axure 扫描 · 详设文档          |
| `route-sync`       | 注册路由 · 添加菜单                       |
| `convention-audit` | 规范检查 · 代码审查 · code review         |
| `mock-codegen`     | 生成 mock · mock 数据（可选技能）         |

---

## 项目概览

**Robot Admin** 是一个企业级中后台管理系统，基于 Vue 3 + Vite 8 + Naive UI + TypeScript + UnoCSS 技术栈，采用 Bun 作为包管理器。项目包含 51+ 业务组件、54+ 演示页面、7 个自定义指令，支持 RBAC 权限体系、动态路由、主题切换、国际化等企业级特性。

### 技术栈版本

| 技术       | 版本   | 用途       |
| ---------- | ------ | ---------- |
| Vue        | 3.5.30 | 前端框架   |
| TypeScript | ~5.8.3 | 类型安全   |
| Vite       | 8.0.3  | 构建工具   |
| Naive UI   | 2.44.1 | UI 组件库  |
| Pinia      | 3.0.4  | 状态管理   |
| Vue Router | 4.6.4  | 路由       |
| UnoCSS     | 66.6.6 | 原子化 CSS |
| Bun        | >=1.x  | 包管理器   |
| Node       | >=22.x | 运行时要求 |

---

## 构建与运行

### 常用命令

| 命令                     | 用途         | 说明                        |
| ------------------------ | ------------ | --------------------------- |
| `bun install`            | 安装依赖     | 唯一允许的包管理命令        |
| `bun run dev`            | 开发环境启动 | 默认端口 1988               |
| `bun run dev:local`      | 本地包调试   | `USE_LOCAL_PACKAGES=true`   |
| `bun run dev:components` | 组件库联调   | `USE_LOCAL_COMPONENTS=true` |
| `bun run build`          | 生产构建     | env-manager prod 模式       |
| `bun run build:test`     | 测试构建     | `--mode test`               |
| `bun run build:staging`  | 预发构建     | `--mode staging --profile`  |
| `bun run lint`           | 代码检查     | Oxlint → ESLint 双重检查    |
| `bun run format`         | 代码格式化   | Prettier                    |
| `bun run type-watch`     | 实时 TS 检查 | `vue-tsc --watch`           |
| `bun run type-build`     | 完整 TS 构建 | `vue-tsc --build --force`   |
| `bun run analyze`        | 构建分析     | rollup-plugin-visualizer    |
| `bun run cz`             | 规范化提交   | Commitizen 交互式           |
| `bun run mcp`            | 启动 MCP     | AI 工具实时查询             |

### 环境变量

环境配置文件位于 `envs/` 目录：

| 文件               | 环境   |
| ------------------ | ------ |
| `.env.development` | 开发   |
| `.env.test`        | 测试   |
| `.env.staging`     | 预发布 |
| `.env.production`  | 生产   |

---

## 项目结构

```
Robot_Admin/
├── src/
│   ├── main.ts                    # 应用入口（启动引导流程）
│   ├── App.vue                    # 根组件（NConfigProvider 包裹）
│   ├── api/                       # API 接口定义
│   │   ├── auth.ts                # 认证接口
│   │   ├── permission-manage.ts   # 权限 CRUD
│   │   └── generated/             # 自动生成的 TS 类型
│   ├── assets/                    # 静态资源（images/css/data）
│   ├── components/                # Vue 组件
│   │   ├── global/                # 全局组件（C_ 大写前缀）
│   │   └── local/                 # 局部组件（c_ 小写前缀）
│   ├── composables/               # 组合式函数
│   │   ├── useLoginController.ts  # 登录控制器
│   │   ├── useLayoutBridge.ts     # 布局桥接
│   │   ├── useLayoutCache.ts      # 页面缓存管理
│   │   └── usePermission.ts       # 权限判断
│   ├── config/                    # 配置汇总
│   │   ├── theme/                 # 主题系统
│   │   ├── vite/                  # Vite 配置拆分
│   │   └── keepAliveConfig.ts     # 页面缓存配置
│   ├── constant/                  # 常量定义
│   ├── hooks/                     # 通用 Hooks
│   ├── lib/                       # 第三方库集成
│   ├── plugins/                   # Vue 插件（初始化系统）
│   ├── router/                    # 路由系统
│   │   ├── index.ts               # createRouter
│   │   ├── permission.ts          # 前置守卫
│   │   ├── dynamicRouter.ts       # 后端 JSON → RouteRecordRaw
│   │   ├── publicRouter.ts        # 静态路由
│   │   └── previewRouter.ts       # 免登录预览路由
│   ├── stores/                    # Pinia 状态管理
│   │   ├── user/                  # 用户认证
│   │   ├── permission/            # 权限
│   │   ├── theme/                 # 主题
│   │   ├── language/              # 国际化
│   │   ├── settings/              # 布局设置
│   │   └── reLogin/               # 重新登录弹窗
│   ├── styles/                    # 全局样式
│   ├── types/                     # TypeScript 类型
│   ├── utils/                     # 工具函数
│   └── views/                     # 业务页面
│       ├── home/                  # 首页
│       ├── dashboard/             # 数据大屏
│       ├── login/                 # 登录页
│       ├── demo/                  # 54 个功能演示
│       ├── preview/               # 组件预览（38 个 iframe 路由）
│       ├── sys-manage/            # 系统管理
│       └── error-page/            # 错误页
├── envs/                          # 环境变量文件
├── lang/                          # i18n 语言文件
├── mcp/                           # MCP Server（AI 工具查询）
├── scripts/                       # 构建脚本
├── docs/                          # 项目分析文档
├── .github/skills/                # 6 个 AI 技能包
├── eslint.config.ts               # ESLint Flat Config
├── commitlint.config.js           # 提交规范
├── unocss.config.ts               # UnoCSS 配置
├── vite.config.ts                 # Vite 配置
├── tsconfig.json                  # TypeScript 配置（项目引用模式）
└── package.json                   # 项目依赖
```

---

## 编码规范

### 通用规则

- **引号**：TS/JS 用单引号，HTML 模板用双引号
- **缩进**：2 空格
- **分号**：不使用尾部分号
- **最大嵌套深度**：4 层（`max-depth: 4`）
- **圈复杂度**：警告阈值 10（`complexity: 10`）
- **JSDoc**：所有函数声明、方法定义、类声明**必须添加**
- **文件头注释**：每个文件必须包含

### 文件头注释模板

```typescript
/*
 * @Author: ChenYu ycyplus@gmail.com
 * @Date: 2026-xx-xx
 * @FilePath: \Robot_Admin\src\xxx\xxx.ts
 * @Description: 文件描述
 * Copyright (c) 2026 by CHENY, All Rights Reserved 😎.
 */
```

### JSDoc 注释风格

```typescript
/**
 * * @description: 功能说明（星号标记）
 * ? @param {object} data 参数说明（问号标记）
 * ! @return {Promise<T>} 返回值说明（叹号标记）
 */
```

### Vue SFC 标准结构

```vue
<template>
  <!-- 模板内容 -->
</template>

<script setup lang="ts">
  // ① defineOptions（组件名称，必须）
  defineOptions({ name: 'ComponentName' })

  // ② Props（interface + withDefaults）
  // ③ Emits（泛型语法）
  // ④ 外部响应式状态（Stores / Composables）
  // ⑤ 响应式状态
  // ⑥ 计算属性
  // ⑦ 方法
  // ⑧ 生命周期
  // ⑨ Watch
  // ⑩ defineExpose
</script>

<style lang="scss" scoped>
  @use './index.scss';
</style>
```

### Props 定义

```typescript
// ✅ 推荐：interface + withDefaults
interface Props {
  title: string
  size?: 'small' | 'medium' | 'large'
}
const props = withDefaults(defineProps<Props>(), { size: 'medium' })

// ❌ 不要用对象语法
defineProps({ title: String, size: { type: String, default: 'medium' } })
```

### 组件配置收拢模式

```typescript
// ❌ 不推荐：Props 爆炸
<C_Form layout="grid" :cols="2" label-placement="left" ...13个props />

// ✅ 推荐：配置收拢
<C_Form :options="fields" :config="{ layout: 'grid', grid: { cols: 2 } }" />
```

---

## 路由与权限

### 动态路由

路由通过后端 JSON 动态生成，本地开发使用 `src/assets/data/dynamicRouter.json`：

```json
{
  "path": "/demo/55-new-feature",
  "name": "demo-55-new-feature",
  "component": "/demo/55-new-feature/index",
  "meta": {
    "title": "新功能演示",
    "icon": "mdi:star",
    "keepAlive": true,
    "hidden": false
  }
}
```

### 路由加载策略

- **高频页面**（home / dashboard）：eager 预加载
- **其他页面**：lazy 按需加载

### 路由守卫流程

```
请求页面 → 预览路由直接放行 → 未登录重定向 /login → 已登录访问 /login 重定向 /home
→ authMenuList 为空则 initDynamicRouter() → Token 超时弹窗重新登录 → 正常渲染
```

---

## API 与请求

### API 函数编写

```typescript
import { postData, getData } from '@robot-admin/request-core'

export const loginApi = (data: { username: string; password: string }) =>
  postData<PostAuthLoginResponse>('/auth/login', data)
```

### 表单验证

```typescript
import { PRESET_RULES } from '@robot-admin/form-validate'

const rules = {
  name: [PRESET_RULES.required('姓名'), PRESET_RULES.length('姓名', 2, 20)],
  email: [PRESET_RULES.required('邮箱'), PRESET_RULES.email('邮箱')],
}
```

### 表格 CRUD

```typescript
import { useTableCrud } from '@robot-admin/request-core'

const table = useTableCrud({
  api: { list: '/api/employees', create: '/api/employees', ... },
  columns: [...],
  pagination: { pageSize: 20 },
})
```

---

## 样式规范

### 优先级

1. **UnoCSS 原子类**（优先） — 间距、布局、颜色
2. **组件 SCSS**（复杂样式） — `<style lang="scss" scoped>` + `@use './index.scss'`
3. **CSS 变量**（主题适应） — `var(--c-primary)`

### 样式导入顺序（不可更改）

```typescript
import './assets/css/main.css' // 基础重置
import '@/styles/index.scss' // 全局样式
import '@robot-admin/layout/style' // 布局样式
import '@robot-admin/naive-ui-components/style.css' // 组件库样式
import 'virtual:uno.css' // UnoCSS（最高优先级）
```

---

## Git 提交规范

### 格式

```
<type>(<scope>): <subject>
```

### Type 列表

`wip` · `feat` · `fix` · `docs` · `style` · `refactor` · `perf` · `test` · `chore` · `revert` · `build` · `deps`

### Scope（强制填写）

`components` · `views` · `stores` · `router` · `api` · `styles` · `config` · `utils` · `plugins` · `types`

### 示例

```bash
feat(components): 新增 C_AudioPlayer 音频播放组件
fix(router): 修复动态路由重复注册问题
docs(readme): 更新快速开始指南
```

### Pre-commit 钩子

Husky + lint-staged 自动执行：Oxlint → ESLint --fix → Prettier --write

---

## 常见坑

1. **Vue 预构建排除**：`optimizeDeps.exclude` 必须包含 `vue` / `vue-router` / `pinia-plugin-persistedstate`，否则 RefImpl 符号断裂
2. **自动导入**：`ref` / `computed` / `watch` / `useRoute` / `defineStore` 等无需手动 import
3. **C\_ 组件解析优先级**：RobotNaiveUiResolver → NaiveUiResolver → 本地 global/ → 本地 local/
4. **Store 命名**：必须 `s_` 前缀（`s_userStore`），不用 `use` 前缀
5. **应用启动顺序**：Loading → createApp → ErrorHandler → Store → RequestCore → Layout → NaiveUI → Directives → Router → Mount

---

## 新功能开发 Checklist

### 新增 Demo 页面

- [ ] 创建 `src/views/demo/XX-feature-name/` 目录
- [ ] 创建 `index.vue`（四段式：标题 → 控制面板 → 主内容 → 状态展示）
- [ ] 创建 `index.scss`（scoped 样式）
- [ ] 创建 `data.ts`（配置数据抽离）
- [ ] 在 `dynamicRouter.json` 中添加路由
- [ ] 添加文件头注释和 JSDoc
- [ ] `bun run lint` 检查 → `bun run cz` 提交

### 新增组件库组件

- [ ] 在 `naive-ui-components/src/components/C_ComponentName/` 下创建
- [ ] 创建 `index.ts`（导出）+ `index.vue`（薄 UI 壳）+ `types.ts`（类型）
- [ ] 复杂组件创建 `composables/` 目录
- [ ] `bun run build` 构建（自动注册导出）
- [ ] 主项目中创建 demo 页面验证

---

> 详细规范 → `.github/copilot-instructions.md`
