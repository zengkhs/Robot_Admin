# CIM 微前端子应用改造方案

> **基座应用**: UAM (`uam-front`) · **子应用**: CIM (`cim-platform-front`)
> **微前端框架**: @micro-zoe/micro-app
> **编写日期**: 2026-04-27

---

## 目录

- [1. 现状分析](#1-现状分析)
  - [1.1 技术栈对比](#11-技术栈对比)
  - [1.2 当前集成状态](#12-当前集成状态)
  - [1.3 已识别问题](#13-已识别问题)
- [2. 改造目标](#2-改造目标)
- [3. 改造方案（五阶段）](#3-改造方案五阶段)
  - [Phase 1: 版本对齐](#phase-1-版本对齐)
  - [Phase 2: 生命周期完善](#phase-2-生命周期完善)
  - [Phase 3: 路由守卫解耦](#phase-3-路由守卫解耦)
  - [Phase 4: 样式隔离](#phase-4-样式隔离)
  - [Phase 5: 集成测试](#phase-5-集成测试)
- [4. 风险评估与回滚策略](#4-风险评估与回滚策略)
- [5. 工期估算](#5-工期估算)

---

## 1. 现状分析

### 1.1 技术栈对比

| 维度             | CIM 子应用      | UAM 基座                   |
| ---------------- | --------------- | -------------------------- |
| **Vue**          | 3.2.x           | 3.2.x                      |
| **Vite**         | 3.2.3 ⚠️        | 4.5.10                     |
| **Naive UI**     | 2.38.2 ⚠️       | 2.41.0                     |
| **Pinia**        | ✅              | ✅                         |
| **Tailwind CSS** | ✅              | ✅                         |
| **micro-app**    | 1.0.0-beta.5 ⚠️ | 1.0.0-rc.5                 |
| **开发端口**     | 8212            | 8001                       |
| **公共路径**     | `/cim/`         | `/` (dev) `/admin/` (prod) |
| **子应用名称**   | `cim`           | —                          |

### 1.2 当前集成状态

#### CIM 子应用（已有基础集成）

- ✅ `window.mount` / `window.unmount` 生命周期
- ✅ `__MICRO_APP_BASE_ROUTE__` 路由前缀处理
- ✅ `addDataListener` 监听基座数据（token、userInfo、router、path）
- ✅ 独立运行兜底逻辑（非微前端环境自动登录）
- ⚠️ `window.rawWindow` 直接访问（不安全）
- ❌ 无样式隔离
- ❌ 无类型声明

#### UAM 基座（已有完整集成）

- ✅ `microApp.start()` 初始化
- ✅ `setBaseAppRouter(router)` 设置基座路由
- ✅ 动态子应用注册（`initSubsystemInfo` API）
- ✅ `micro-app/index.vue` 容器组件
- ✅ `disableSandbox` + `inline` 模式（Vite 兼容）
- ✅ 数据下发（token、userInfo、router、path）
- ✅ 子应用注册字段：`subsystemCode=cim`, `isMicroapp=true`, `isViteapp=true`

#### 通信模式

```
基座 → 子应用:  microApp.setData('cim', { token, userInfo, router, path })
子应用 → 基座:  window.microApp.dispatch({ type: 'pathEvent', path })
                window.dispatchEvent(new CustomEvent('pathEvent', { detail: path }))
```

### 1.3 已识别问题

| #   | 问题                     | 严重度 | 说明                                                                         |
| --- | ------------------------ | ------ | ---------------------------------------------------------------------------- |
| 1   | **micro-app 版本不一致** | 🔴 高  | 基座 `rc.5` vs 子应用 `beta.5`，API 行为可能不一致                           |
| 2   | **Vite 3.2 过旧**        | 🔴 高  | micro-app 对 Vite 的稳定支持从 Vite 4.x 开始                                 |
| 3   | **Naive UI 版本不一致**  | 🟡 中  | 2.38.2 vs 2.41.0，组件 API/样式可能有差异                                    |
| 4   | **沙箱已禁用**           | 🟡 中  | `disableSandbox` 导致全局变量污染风险                                        |
| 5   | **路由守卫耦合微前端**   | 🟡 中  | `router-guards.ts` 直接访问 `window.rawWindow` / `window.microApp.getData()` |
| 6   | **无样式隔离**           | 🟡 中  | 子应用样式可能泄漏到基座，反之亦然                                           |
| 7   | **主题系统耦合**         | 🟢 低  | CIM 主题依赖基座下发，独立运行时需兜底                                       |
| 8   | **无类型声明**           | 🟢 低  | `window.microApp` 等全局变量缺少 TypeScript 类型                             |

---

## 2. 改造目标

1. **版本统一**: micro-app、Vite、Naive UI 版本对齐，消除兼容性隐患
2. **生命周期健壮**: mount/unmount 完整清理，避免内存泄漏
3. **路由守卫解耦**: 微前端环境检测安全化，独立/嵌入模式均可正常运行
4. **样式隔离**: 子应用样式不泄漏，基座样式不侵入
5. **类型安全**: 补充 TypeScript 类型声明

---

## 3. 改造方案（五阶段）

### Phase 1: 版本对齐

> **目标**: 消除版本不一致导致的兼容性问题
> **工期**: 1-2 人天

#### 1.1 micro-app 版本统一

**CIM 子应用** — 升级到 `1.0.0-rc.5`（与基座一致）:

```bash
cd cim-platform-front
bun remove @micro-zoe/micro-app
bun add @micro-zoe/micro-app@1.0.0-rc.5
```

> ⚠️ `beta.5` → `rc.5` 的 Breaking Changes:
>
> - `getData()` 返回值结构可能变化，需验证
> - `addDataListener` 回调签名确认
> - `dispatch` 参数格式确认

#### 1.2 Vite 升级（3.2 → 4.x）

**CIM 子应用** — 升级 Vite 及相关插件:

```bash
cd cim-platform-front
bun add -d vite@^4.5.0
```

**需要同步更新的插件**:

| 插件                     | 当前版本 | 目标版本 | 说明        |
| ------------------------ | -------- | -------- | ----------- |
| `@vitejs/plugin-vue`     | 需确认   | ^4.6.0   | Vite 4 配套 |
| `@vitejs/plugin-vue-jsx` | 需确认   | ^3.1.0   | Vite 4 配套 |
| `vite-plugin-svg-icons`  | 需确认   | 最新     | 兼容性确认  |

**Vite 4 Breaking Changes 需关注**:

- `import.meta.glob` Eager 模式语法变更
- `server.fs.strict` 默认开启
- CSS 代码分割行为变化
- `define` 配置的替换方式调整

**vite.config.ts 需调整项**:

```typescript
// 旧 (Vite 3)
server: {
  fs: {
    strict: false
  } // 可能需要调整
}

// 新 (Vite 4) — 确认以下配置
export default defineConfig({
  server: {
    headers: {
      'Access-Control-Allow-Origin': '*', // 微前端必须：允许基座跨域请求
    },
  },
  base: process.env.VITE_BASE_URL || '/cim/', // 确保公共路径正确
})
```

#### 1.3 Naive UI 版本对齐

**CIM 子应用** — 升级到 `2.41.0`（与基座一致）:

```bash
cd cim-platform-front
bun add naive-ui@2.41.0
```

**需验证的变更点**:

- 检查 `n-data-table`、`n-form`、`n-modal` 等高频组件的 Props 变更
- 检查 CSS 变量命名是否变化（影响主题定制）
- 检查 `useMessage`、`useDialog` 等 Composable 的行为变化

#### 1.4 验证清单

- [ ] `bun run dev` 独立启动正常
- [ ] `bun run build` 构建无报错
- [ ] 现有页面功能回归正常
- [ ] Naive UI 组件渲染无异常

---

### Phase 2: 生命周期完善

> **目标**: 健壮的 mount/unmount，避免内存泄漏
> **工期**: 1 人天

#### 2.1 类型声明文件

新建 `src/types/micro-app.d.ts`:

```typescript
/*
 * @Author: ChenYu ycyplus@gmail.com
 * @Date: 2026-04-27
 * @FilePath: \cim-platform-front\src\types\micro-app.d.ts
 * @Description: micro-app 类型声明
 * Copyright (c) 2026 by CHENY, All Rights Reserved 😎.
 */

declare global {
  interface Window {
    mount: () => void
    unmount: () => void
    microApp?: {
      getData: () => MicroAppData
      addDataListener: (callback: (data: MicroAppData) => void) => void
      removeDataListener: (callback: (data: MicroAppData) => void) => void
      dispatch: (data: Record<string, unknown>) => void
      getBaseAppRouter: () => Router
    }
    __MICRO_APP_BASE_ROUTE__: string
    __MICRO_APP_ENVIRONMENT__: boolean
    __MICRO_APP_NAME__: string
  }
}

interface MicroAppData {
  token?: string
  userInfo?: Record<string, unknown>
  router?: unknown
  path?: string
  type?: string
}

export {}
```

#### 2.2 微前端桥接模块

新建 `src/utils/micro-app-bridge.ts`:

```typescript
/*
 * @Author: ChenYu ycyplus@gmail.com
 * @Date: 2026-04-27
 * @FilePath: \cim-platform-front\src\utils\micro-app-bridge.ts
 * @Description: 微前端桥接工具 — 安全访问 micro-app API
 * Copyright (c) 2026 by CHENY, All Rights Reserved 😎.
 */

import type { Router } from 'vue-router'

/** 是否运行在微前端环境 */
export function isMicroApp(): boolean {
  return !!window.__MICRO_APP_ENVIRONMENT__
}

/** 安全获取基座下发的数据 */
export function getMicroAppData(): MicroAppData | null {
  if (!isMicroApp() || !window.microApp) return null
  try {
    return window.microApp.getData()
  } catch {
    console.warn('[CIM] Failed to get micro-app data')
    return null
  }
}

/** 安全添加数据监听 */
export function addMicroAppDataListener(
  callback: (data: MicroAppData) => void
): void {
  if (!isMicroApp() || !window.microApp) return
  window.microApp.addDataListener(callback)
}

/** 安全移除数据监听 */
export function removeMicroAppDataListener(
  callback: (data: MicroAppData) => void
): void {
  if (!isMicroApp() || !window.microApp) return
  window.microApp.removeDataListener(callback)
}

/** 安全向基座派发数据 */
export function dispatchToBaseApp(data: Record<string, unknown>): void {
  if (!isMicroApp() || !window.microApp) return
  window.microApp.dispatch(data)
}

/** 安全获取基座路由 */
export function getBaseAppRouter(): Router | null {
  if (!isMicroApp() || !window.microApp) return null
  try {
    return window.microApp.getBaseAppRouter()
  } catch {
    return null
  }
}

/** 获取微前端基础路由前缀 */
export function getMicroAppBaseRoute(): string {
  return window.__MICRO_APP_BASE_ROUTE__ || ''
}
```

#### 2.3 改造 main.ts 生命周期

```typescript
/*
 * @Author: ChenYu ycyplus@gmail.com
 * @Date: 2026-04-27
 * @FilePath: \cim-platform-front\src\main.ts
 * @Description: 应用入口 — 支持独立运行与微前端嵌入
 * Copyright (c) 2026 by CHENY, All Rights Reserved 😎.
 */

import { createApp, type App as VueApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import {
  isMicroApp,
  addMicroAppDataListener,
  removeMicroAppDataListener,
} from './utils/micro-app-bridge'

let app: VueApp | null = null
const dataListenerCallback = (data: MicroAppData) => {
  // 处理基座下发的数据
  console.log('[CIM] Received data from base app:', data)
}

/** 挂载应用 */
function mount() {
  if (app) return

  app = createApp(App)
  const pinia = createPinia()

  app.use(pinia)
  app.use(router)

  // 微前端环境：监听基座数据
  if (isMicroApp()) {
    addMicroAppDataListener(dataListenerCallback)
  }

  app.mount('#app')
  console.log('[CIM] App mounted')
}

/** 卸载应用 */
function unmount() {
  if (!app) return

  // 清理数据监听
  if (isMicroApp()) {
    removeMicroAppDataListener(dataListenerCallback)
  }

  app.unmount()
  app = null
  console.log('[CIM] App unmounted')
}

// 独立运行时直接挂载
if (!isMicroApp()) {
  mount()
}

// 暴露微前端生命周期
window.mount = mount
window.unmount = unmount
```

#### 2.4 验证清单

- [ ] 独立运行 `bun run dev` 正常挂载
- [ ] 嵌入基座后 `mount` 被正确调用
- [ ] 基座切换子应用时 `unmount` 被正确调用
- [ ] 反复切换子应用无内存泄漏（DevTools Memory 面板验证）
- [ ] 数据监听在 unmount 时被正确移除

---

### Phase 3: 路由守卫解耦

> **目标**: 路由守卫不再直接依赖 `window.rawWindow` / `window.microApp`
> **工期**: 1 人天

#### 3.1 当前问题

`router-guards.ts` 中存在以下不安全访问:

```typescript
// ❌ 不安全：直接访问 rawWindow
const token = window.rawWindow?.token || localStorage.getItem('token')

// ❌ 不安全：直接调用 getData()
const data = window.microApp?.getData()
```

#### 3.2 改造方案

使用 Phase 2 创建的 `micro-app-bridge.ts` 替换所有直接访问:

```typescript
/*
 * @Author: ChenYu ycyplus@gmail.com
 * @Date: 2026-04-27
 * @FilePath: \cim-platform-front\src\router\router-guards.ts
 * @Description: 路由守卫 — 解耦微前端环境检测
 * Copyright (c) 2026 by CHENY, All Rights Reserved 😎.
 */

import type { Router } from 'vue-router'
import {
  isMicroApp,
  getMicroAppData,
  dispatchToBaseApp,
  getMicroAppBaseRoute,
} from '@/utils/micro-app-bridge'

export function setupRouterGuards(router: Router) {
  router.beforeEach((to, from, next) => {
    // ✅ 安全获取 token
    const token = isMicroApp()
      ? getMicroAppData()?.token
      : localStorage.getItem('token')

    if (!token && to.name !== 'Login') {
      // 微前端环境：通知基座跳转登录
      if (isMicroApp()) {
        dispatchToBaseApp({ type: 'navigate', path: '/login' })
        return next(false)
      }
      return next({ name: 'Login' })
    }

    next()
  })

  router.afterEach(to => {
    // 微前端环境：同步路由到基座
    if (isMicroApp()) {
      const basePath = getMicroAppBaseRoute()
      dispatchToBaseApp({
        type: 'pathEvent',
        path: `${basePath}${to.fullPath}`,
      })
    }
  })
}
```

#### 3.3 路由配置调整

```typescript
// src/router/index.ts
import { createRouter, createWebHistory } from 'vue-router'
import { isMicroApp, getMicroAppBaseRoute } from '@/utils/micro-app-bridge'

const router = createRouter({
  history: createWebHistory(
    isMicroApp() ? getMicroAppBaseRoute() : import.meta.env.BASE_URL
  ),
  routes: [
    // ...existing routes
  ],
})
```

#### 3.4 验证清单

- [ ] 独立运行路由跳转正常
- [ ] 嵌入基座后路由前缀正确
- [ ] 未登录时独立运行跳转登录页
- [ ] 未登录时微前端环境通知基座
- [ ] 路由切换后基座面包屑/标签页同步更新

---

### Phase 4: 样式隔离

> **目标**: 子应用样式不泄漏，基座样式不侵入
> **工期**: 1 人天

#### 4.1 根容器隔离

**App.vue** 添加根容器类名:

```vue
<template>
  <n-config-provider
    :theme="theme"
    :theme-overrides="themeOverrides"
    class="cim-app"
  >
    <n-message-provider>
      <router-view />
    </n-message-provider>
  </n-config-provider>
</template>

<style lang="scss">
  /* 所有子应用样式限定在 .cim-app 内 */
  .cim-app {
    font-family:
      -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;

    /* 重置可能被基座影响的样式 */
    * {
      box-sizing: border-box;
    }
  }
</style>
```

#### 4.2 Naive UI 样式隔离

```scss
/* .cim-app 内的 Naive UI 样式前缀 */
.cim-app {
  /* 防止基座的全局 CSS 变量覆盖 */
  --n-color: var(--cim-primary-color, #1890ff);
  --n-border-radius: 3px;
}
```

#### 4.3 Tailwind CSS 前缀配置

```typescript
// tailwind.config.ts
export default {
  // 重要：为子应用添加前缀，避免与基座冲突
  prefix: 'cim-',
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  // ...
}
```

> ⚠️ **注意**: 添加 `prefix` 后，所有 Tailwind 类名需同步修改（如 `flex` → `cim-flex`），工作量较大。
> **替代方案**: 如果 Tailwind 类冲突不严重，可暂不添加前缀，仅通过 `.cim-app` 容器隔离。

#### 4.4 Vite 开发服务器 CORS 配置

```typescript
// vite.config.ts
export default defineConfig({
  server: {
    port: 8212,
    headers: {
      'Access-Control-Allow-Origin': '*', // 微前端必须
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  },
})
```

#### 4.5 生产环境样式隔离

```typescript
// vite.config.ts — 生产构建配置
export default defineConfig({
  build: {
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        // 确保子应用资源路径正确
        assetFileNames: 'cim-assets/[name]-[hash][extname]',
        chunkFileNames: 'cim-assets/[name]-[hash].js',
        entryFileNames: 'cim-assets/[name]-[hash].js',
      },
    },
  },
})
```

#### 4.6 验证清单

- [ ] 子应用样式不影响基座导航栏/侧边栏
- [ ] 基座主题切换不影响子应用
- [ ] Naive UI 组件样式正常
- [ ] Tailwind 工具类正常生效
- [ ] 生产构建后样式隔离有效

---

### Phase 5: 集成测试

> **目标**: 独立运行 + 微前端嵌入双模式全量验证
> **工期**: 1-2 人天

#### 5.1 独立运行测试

| 测试项             | 预期结果                          | 通过 |
| ------------------ | --------------------------------- | ---- |
| `bun run dev` 启动 | 无报错，页面正常渲染              | ☐    |
| 登录流程           | 正常登录，token 存入 localStorage | ☐    |
| 路由跳转           | 所有菜单可正常跳转                | ☐    |
| 表单提交           | 数据正常提交，消息提示正常        | ☐    |
| 表格数据           | 分页、筛选、排序正常              | ☐    |
| `bun run build`    | 构建无报错                        | ☐    |

#### 5.2 微前端嵌入测试

| 测试项          | 预期结果                       | 通过 |
| --------------- | ------------------------------ | ---- |
| 基座加载 CIM    | 子应用正常渲染在基座容器内     | ☐    |
| 基座 token 下发 | 子应用正确接收并使用 token     | ☐    |
| 基座路由同步    | 子应用路由变化同步到基座标签页 | ☐    |
| 基座主题切换    | 子应用跟随基座主题             | ☐    |
| 子应用路由跳转  | 不影响基座导航                 | ☐    |
| 切换其他子应用  | CIM 正确 unmount，无残留 DOM   | ☐    |
| 切回 CIM        | CIM 正确 remount，状态恢复     | ☐    |
| 浏览器刷新      | 子应用路由状态保持             | ☐    |
| 前进/后退       | 子应用路由正确响应             | ☐    |

#### 5.3 性能测试

| 测试项         | 预期结果                      | 通过 |
| -------------- | ----------------------------- | ---- |
| 首次加载时间   | < 3s（内网环境）              | ☐    |
| 子应用切换时间 | < 500ms                       | ☐    |
| 内存泄漏       | 反复切换 10 次内存增长 < 10MB | ☐    |
| DOM 节点数     | unmount 后 DOM 节点归零       | ☐    |

#### 5.4 兼容性测试

| 浏览器  | 版本 | 通过 |
| ------- | ---- | ---- |
| Chrome  | 最新 | ☐    |
| Edge    | 最新 | ☐    |
| Firefox | 最新 | ☐    |

---

## 4. 风险评估与回滚策略

| 风险                         | 概率 | 影响 | 缓解措施                     | 回滚策略                     |
| ---------------------------- | ---- | ---- | ---------------------------- | ---------------------------- |
| Vite 3→4 升级导致构建失败    | 中   | 高   | 先在分支验证，逐插件排查     | 回退 Vite 版本，保留其他改造 |
| micro-app beta→rc API 不兼容 | 低   | 高   | 逐 API 对比 changelog        | 回退 micro-app 版本          |
| Naive UI 升级组件 API 变更   | 中   | 中   | 按组件逐个验证               | 回退 Naive UI 版本           |
| Tailwind 前缀改造工作量大    | 高   | 中   | 可暂不加前缀，用容器隔离替代 | 不添加前缀                   |
| 样式隔离不彻底               | 中   | 中   | 逐步排查泄漏点               | 增加更具体的选择器           |

---

## 5. 工期估算

| 阶段     | 工作内容                                    | 工期         | 依赖      |
| -------- | ------------------------------------------- | ------------ | --------- |
| Phase 1  | 版本对齐（micro-app + Vite + Naive UI）     | 1-2 人天     | 无        |
| Phase 2  | 生命周期完善（类型声明 + bridge + main.ts） | 1 人天       | Phase 1   |
| Phase 3  | 路由守卫解耦                                | 1 人天       | Phase 2   |
| Phase 4  | 样式隔离                                    | 1 人天       | Phase 1   |
| Phase 5  | 集成测试                                    | 1-2 人天     | Phase 1-4 |
| **合计** |                                             | **5-7 人天** |           |

> 建议按 Phase 顺序执行，每个 Phase 完成后进行阶段性验证，确保问题早发现早解决。
