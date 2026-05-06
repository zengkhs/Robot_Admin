# CIM 微前端子应用改造实施记录

> **基座应用**: UAM (`uam-front`) · **子应用**: CIM (`Robot_Admin`)
> **微前端框架**: @micro-zoe/micro-app@1.0.0-rc.5
> **实施日期**: 2026-04-28
> **方案依据**: [CIM微前端子应用改造方案-零基座改造版.md](./CIM微前端子应用改造方案-零基座改造版.md)
> **构建验证**: ✅ 通过（35.69s，无错误）

---

## 目录

- [1. 改造总览](#1-改造总览)
- [2. 新增文件](#2-新增文件)
- [3. 改造文件](#3-改造文件)
- [4. 各阶段实施详情](#4-各阶段实施详情)
  - [Phase 1: 版本对齐 + Vite 配置](#phase-1-版本对齐--vite-配置)
  - [Phase 2: 生命周期 + 运行模式感知](#phase-2-生命周期--运行模式感知)
  - [Phase 3: Token 自主获取](#phase-3-token-自主获取)
  - [Phase 4: 菜单与动态路由](#phase-4-菜单与动态路由)
  - [Phase 5: 路由守卫双模式适配](#phase-5-路由守卫双模式适配)
  - [Phase 6: 样式隔离 + 沙箱增强](#phase-6-样式隔离--沙箱增强)
- [5. 待验证清单](#5-待验证清单)
- [6. 后续工作](#6-后续工作)

---

## 1. 改造总览

### 核心原则

```
┌─────────────────────────────────────────────────────────┐
│  子应用自主原则（Self-Contained Principle）               │
│                                                         │
│  1. 子应用独立运行 → 完整登录 + 菜单 + 路由              │
│  2. 子应用嵌入基座 → 自主登录 + 菜单（不依赖基座下发）    │
│  3. 基座若下发数据 → 优先使用基座数据（兼容增强）         │
│  4. 基座若不下发 → 子应用自行调用后端接口（零依赖兜底）   │
└─────────────────────────────────────────────────────────┘
```

### 改造文件统计

| 类型       | 数量 | 文件                                                                                                                                                                   |
| ---------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **新增**   | 2    | `micro-app.d.ts` · `micro-app-bridge.ts`                                                                                                                               |
| **改造**   | 8    | `package.json` · `vite.config.ts` · `viteServerConfig.ts` · `main.ts` · `user store` · `permission store` · `router/index.ts` · `router/permission.ts` · `api/auth.ts` |
| **未改动** | -    | `constant/index.ts` · `d_auth.ts` · `dynamicRouter.ts` · `request-core.ts`（已有逻辑满足需求）                                                                         |

---

## 2. 新增文件

### 2.1 `src/types/micro-app.d.ts`

**用途**: micro-app 全局类型声明 + 基座下发数据接口定义

**关键类型**:

| 类型                               | 说明                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------ |
| `MicroAppData`                     | 基座可能下发的数据结构（所有字段可选：token / refreshToken / userInfo / menuList / path / type） |
| `BaseUserInfo`                     | 基座下发的用户信息结构                                                                           |
| `BaseMenuItem`                     | 基座下发的菜单项结构                                                                             |
| `Window.__MICRO_APP_ENVIRONMENT__` | 是否运行在微前端环境                                                                             |
| `Window.__MICRO_APP_BASE_ROUTE__`  | 微前端基础路由前缀                                                                               |
| `Window.microApp`                  | micro-app 实例 API（getData / addDataListener / dispatch 等）                                    |

### 2.2 `src/utils/micro-app-bridge.ts`

**用途**: 微前端桥接工具 — 安全访问 micro-app API，统一运行模式判断

**导出函数**:

| 函数                             | 返回值                    | 说明                                     |
| -------------------------------- | ------------------------- | ---------------------------------------- |
| `isMicroApp()`                   | `boolean`                 | 是否运行在微前端环境                     |
| `getRunMode()`                   | `'micro' \| 'standalone'` | 获取当前运行模式                         |
| `hasBaseAppData()`               | `boolean`                 | 基座是否下发了有效数据                   |
| `getMicroAppData()`              | `MicroAppData \| null`    | 安全获取基座下发的数据                   |
| `addMicroAppDataListener(cb)`    | `void`                    | 安全添加数据监听                         |
| `removeMicroAppDataListener(cb)` | `void`                    | 安全移除数据监听                         |
| `dispatchToBaseApp(data)`        | `void`                    | 安全向基座派发数据（尽力而为，静默失败） |
| `getBaseAppRouter()`             | `Router \| null`          | 安全获取基座路由                         |
| `getMicroAppBaseRoute()`         | `string`                  | 获取微前端基础路由前缀                   |
| `getTokenInIframeSandbox()`      | `string`                  | iframe 沙箱模式下从基座获取 token        |

**设计要点**:

- 所有函数内部先判断 `isMicroApp()`，非微前端环境直接返回默认值
- `dispatchToBaseApp` 使用 try-catch 包裹，基座不监听也不报错
- `getTokenInIframeSandbox` 为 iframe 沙箱模式预留，优先从基座数据获取，兜底从 URL 参数获取

---

## 3. 改造文件

### 3.1 `package.json`

**变更**: 新增依赖

```diff
+ "@micro-zoe/micro-app": "1.0.0-rc.5"
```

### 3.2 `vite.config.ts`

**变更**: 新增微前端相关配置

```diff
  return {
+   // 微前端支持：生产环境 base 路径
+   base: process.env.VITE_MICRO_APP_BASE || '/',
+
+   // 微前端支持：注入全局常量
+   define: {
+     __MICRO_APP_ENVIRONMENT__: JSON.stringify(false),
+     __MICRO_APP_BASE_ROUTE__: JSON.stringify(''),
+   },
+
    plugins: [
```

**说明**:

- `base`: 生产环境可通过 `VITE_MICRO_APP_BASE` 环境变量设置为 `/cim/`
- `define`: 注入 `__MICRO_APP_ENVIRONMENT__` 和 `__MICRO_APP_BASE_ROUTE__`，运行时由 micro-app 框架覆盖真实值

### 3.3 `src/config/vite/viteServerConfig.ts`

**变更**: 新增 CORS 和 origin 配置

```diff
  fs: {
    allow: ['..'],
  },
+
+ // 微前端支持：允许跨域，基座通过 fetch 加载子应用
+ cors: true,
+
+ // 微前端支持：静态资源路径前缀
+ origin: process.env.VITE_MICRO_APP_ORIGIN || 'http://localhost:1988',
```

**说明**:

- `cors: true`: micro-app 通过 fetch 加载子应用资源，必须允许跨域
- `origin`: 开发环境必须设置，否则基座加载子应用的静态资源路径会 404

### 3.4 `src/main.ts`

**变更**: 重构为微前端生命周期模式

**改造前**:

```typescript
async function bootstrap() { ... }
bootstrap().catch(error => console.error('应用启动失败:', error))
```

**改造后**:

```typescript
let app: VueApp | null = null

const dataListenerCallback = async (data: MicroAppData) => {
  // 动态 import，避免 Vite 不支持 require()
  // 基座下发了 token/userInfo/menuList → 同步到子应用 Store
}

async function bootstrap() {
  if (app) return
  // ... 原有初始化逻辑 ...

  // 🆕 微前端环境：注册数据监听（可选增强）
  if (isMicroApp()) {
    addMicroAppDataListener(dataListenerCallback)
    if (hasBaseAppData()) {
      const initialData = getMicroAppData()
      if (initialData) dataListenerCallback(initialData)
    }
  }
  app.mount('#app')
}

function unmount() {
  if (!app) return
  if (isMicroApp()) removeMicroAppDataListener(dataListenerCallback)
  app.unmount()
  app = null
}

// 独立运行时直接挂载
if (!isMicroApp()) {
  bootstrap().catch(error => console.error('应用启动失败:', error))
}

// 暴露微前端生命周期
window.mount = bootstrap
window.unmount = unmount
```

**关键改进**:

1. `bootstrap()` 增加防重复调用保护（`if (app) return`）
2. 基座数据监听为**可选增强**，非必需依赖
3. 使用动态 `import()` 替代 `require()`（Vite 不支持运行时 require）
4. 独立运行时直接 `bootstrap()`，微前端模式下由框架调用 `window.mount()`

### 3.5 `src/stores/user/index.ts`

**变更**: logout 增加微前端通知 + isLoggedIn getter

```diff
+ import { isMicroApp, dispatchToBaseApp } from '@/utils/micro-app-bridge'

  getters: {
    hasUserInfo: state => Object.keys(state.userInfo).length > 0,
+   isLoggedIn: state => !!state.token,
  },

  actions: {
    async logout(isExpired = false) {
      try {
+       // 微前端模式：尝试通知基座（尽力而为，不依赖）
+       if (isMicroApp()) {
+         dispatchToBaseApp({ type: 'logout', isExpired })
+       }
+
-       this.token = ''
-       this.userInfo = {}
+       // 无论哪种模式，都自主清除认证数据
+       this.token = ''
+       this.refreshToken = ''
+       this.tokenExpiresAt = 0
+       this.userInfo = {}
```

**说明**:

- `logout` 在微前端模式下先 `dispatchToBaseApp` 通知基座（尽力而为），再自主清除数据
- 清除范围扩大：`refreshToken` 和 `tokenExpiresAt` 也一并清除
- 跳转自身 `/login`（而非依赖基座跳转）

### 3.6 `src/stores/permission/index.ts`

**变更**: 新增 `setAuthMenuListFromBase` + 三级菜单获取优先级

```diff
+ import { isMicroApp, getMicroAppData, hasBaseAppData } from '@/utils/micro-app-bridge'

+ function filterCimMenuList(menuList: DynamicRoute[]): DynamicRoute[] { ... }

  actions: {
    async getAuthMenuList() {
      try {
+       // 优先级 1：基座下发了菜单数据
+       if (isMicroApp() && hasBaseAppData()) {
+         const microData = getMicroAppData()
+         if (microData?.menuList?.length) {
+           const cimMenuList = filterCimMenuList(microData.menuList)
+           if (cimMenuList.length) { ... return }
+         }
+       }
+
+       // 优先级 2：自主调用后端接口
+       try {
+         const res = await getAuthMenuListApi()
+         ...
+       } catch (apiError) {
+         console.warn('[CIM] Menu API failed, falling back to local JSON:', apiError)
+       }
+
+       // 优先级 3：本地 JSON 兜底
+       const localMenu = await this._loadLocalMenu()
+       ...
+     }
+   },

+   setAuthMenuListFromBase(menuList: DynamicRoute[]) {
+     const cimMenuList = filterCimMenuList(menuList)
+     if (cimMenuList.length) {
+       this.authMenuList = cimMenuList
+       this.flatRoutePaths = [...this._buildFlatPaths(cimMenuList)]
+     }
+   },

+   async _loadLocalMenu(): Promise<DynamicRoute[]> {
+     const module = await import('@/assets/data/dynamicRouter.json')
+     return (module.default || module) as DynamicRoute[]
+   },
```

**菜单获取优先级**:

```
1. 基座下发 menuList → filterCimMenuList 过滤 CIM 前缀 → 使用
2. 基座未下发 → 自主调用 GET /auth/menu → 使用
3. 接口不可用 → 本地 JSON 兜底（dynamicRouter.json）
```

**CIM 菜单过滤策略**:

- 按 path 前缀匹配：`/cim` · `/map` · `/model` · `/scene` · `/monitor`
- 或按 `meta.subsystemCode === 'cim'` 匹配（基座有提供时）

### 3.7 `src/router/index.ts`

**变更**: 微前端模式下使用 `__MICRO_APP_BASE_ROUTE__` 作为 history base

```diff
- import { createRouter, createWebHistory, createWebHashHistory } from 'vue-router'
+ import { createRouter, createWebHistory } from 'vue-router'
+ import { isMicroApp, getMicroAppBaseRoute } from '@/utils/micro-app-bridge'

- const mode = import.meta.env.VITE_ROUTER_MODE as 'hash' | 'history'
- const routerMode = { hash: () => createWebHashHistory(), history: () => createWebHistory() }
- const historyCreator = routerMode[mode] || createWebHashHistory

+ function getBasePath(): string {
+   if (isMicroApp()) {
+     return getMicroAppBaseRoute() || import.meta.env.BASE_URL
+   }
+   return import.meta.env.BASE_URL
+ }

  const router = createRouter({
    routes,
-   history: historyCreator(),
+   history: createWebHistory(getBasePath()),
  })
```

**说明**:

- 移除 `createWebHashHistory` 和 `mode` 变量（统一使用 history 模式）
- 微前端模式下，micro-app 会注入 `__MICRO_APP_BASE_ROUTE__`（如 `/cim`），子应用路由前缀自动对齐

### 3.8 `src/router/permission.ts`

**变更**: 路由守卫增加微前端模式处理

```diff
+ import { isMicroApp, dispatchToBaseApp, getMicroAppBaseRoute } from '@/utils/micro-app-bridge'
+ import { d_isCheckTimeout } from '@/utils/d_auth'

  router.beforeEach(async (to) => {
    // 1. 未登录处理 — 两种模式统一跳转自身 /login
    if (!token) { ... }

+   // 2. Token 超时检查（8小时无操作）
+   if (d_isCheckTimeout()) {
+     await userStore.logout(true)
+     return LOGIN_PATH
+   }

    // 5. 路由权限校验
    if (!checkRoutePermission(to)) {
+     if (isMicroApp()) {
+       dispatchToBaseApp({ type: 'noPermission', path: to.path })
+     }
      return '/401'
    }

+   // 6. 微前端模式：尝试同步路由到基座
+   if (isMicroApp()) {
+     const basePath = getMicroAppBaseRoute()
+     dispatchToBaseApp({ type: 'pathEvent', path: `${basePath}${to.fullPath}` })
+   }
  })
```

**新增逻辑**:

1. Token 超时检查（8 小时无操作自动退出）
2. 无权限时通知基座（尽力而为）
3. 路由切换时同步到基座标签页（尽力而为）
4. 动态路由初始化失败时通知基座（尽力而为）

### 3.9 `src/api/auth.ts`

**变更**: 新增 `getUserInfoApi` / `logoutApi` 接口

```diff
+ export interface UserInfoResponse { ... }

+ export const getUserInfoApi = (): Promise<UserInfoResponse> => { ... }
+ export const logoutApi = (): Promise<void> => { ... }
```

**说明**: 两个接口当前为 Mock 实现，对接真实后端时替换为 `getData` / `postData` 调用。

---

## 4. 各阶段实施详情

### Phase 1: 版本对齐 + Vite 配置

| 步骤 | 内容                                              | 状态    |
| ---- | ------------------------------------------------- | ------- |
| 1.1  | 安装 `@micro-zoe/micro-app@1.0.0-rc.5`            | ✅ 完成 |
| 1.2  | `vite.config.ts` 新增 `base` / `define` 配置      | ✅ 完成 |
| 1.3  | `viteServerConfig.ts` 新增 `cors` / `origin` 配置 | ✅ 完成 |

> **注意**: 版本对齐步骤（原方案 1.1）因当前项目 Vite 8 + Vue 3.5 已满足要求，无需额外对齐。

### Phase 2: 生命周期 + 运行模式感知

| 步骤 | 内容                                                          | 状态    |
| ---- | ------------------------------------------------------------- | ------- |
| 2.1  | 创建 `src/types/micro-app.d.ts` 类型声明                      | ✅ 完成 |
| 2.2  | 创建 `src/utils/micro-app-bridge.ts` 桥接模块                 | ✅ 完成 |
| 2.3  | 改造 `src/main.ts` 生命周期（mount / unmount / dataListener） | ✅ 完成 |

### Phase 3: Token 自主获取

| 步骤 | 内容                                                                 | 状态        |
| ---- | -------------------------------------------------------------------- | ----------- |
| 3.1  | `src/constant/index.ts` — 已有，无需改动                             | ✅ 无需改动 |
| 3.2  | `src/utils/d_auth.ts` — 已有，无需改动                               | ✅ 无需改动 |
| 3.3  | `src/api/auth.ts` — 新增 getUserInfoApi / logoutApi                  | ✅ 完成     |
| 3.4  | `src/stores/user/index.ts` — logout 增加微前端通知                   | ✅ 完成     |
| 3.5  | `src/plugins/request-core.ts` — 已有 Token 注入 + 刷新逻辑，无需改动 | ✅ 无需改动 |

> **关键洞察**: micro-app 默认使用 `with` 沙箱，子应用的 `localStorage` 实际指向基座的 `localStorage`。基座登录后写入的 token，子应用可直接从 localStorage 读取，无需基座通过 `setData` 下发。

### Phase 4: 菜单与动态路由

| 步骤 | 内容                                                                            | 状态        |
| ---- | ------------------------------------------------------------------------------- | ----------- |
| 4.1  | `src/stores/permission/index.ts` — 三级菜单获取优先级 + setAuthMenuListFromBase | ✅ 完成     |
| 4.2  | `src/router/dynamicRouter.ts` — 已有，无需改动                                  | ✅ 无需改动 |
| 4.3  | `filterCimMenuList` — 按 path 前缀过滤 CIM 菜单                                 | ✅ 完成     |

### Phase 5: 路由守卫双模式适配

| 步骤 | 内容                                                | 状态    |
| ---- | --------------------------------------------------- | ------- |
| 5.1  | `src/router/index.ts` — 微前端 base route 适配      | ✅ 完成 |
| 5.2  | `src/router/permission.ts` — 守卫增加微前端模式处理 | ✅ 完成 |

### Phase 6: 样式隔离 + 沙箱增强

| 步骤 | 内容                                                 | 状态        |
| ---- | ---------------------------------------------------- | ----------- |
| 6.1  | `micro-app-bridge.ts` 新增 `getTokenInIframeSandbox` | ✅ 完成     |
| 6.2  | 沙箱模式选择建议（with 沙箱优先）                    | ✅ 文档记录 |

> **建议**: 基座未改造时优先使用 **with 沙箱**（micro-app 默认模式），子应用可直接读取基座 localStorage。仅在样式/JS 冲突严重时切换到 iframe 沙箱。

---

## 5. 待验证清单

### 5.1 独立运行测试

| 测试项             | 预期结果                                         | 状态      |
| ------------------ | ------------------------------------------------ | --------- |
| `bun run dev` 启动 | 无报错，显示登录页                               | ☐         |
| 登录流程           | 调用 `POST /auth/login`，token 存入 localStorage | ☐         |
| Token 双令牌       | accessToken + refreshToken 均正确存储            | ☐         |
| Token 过期刷新     | 过期前 5 分钟自动刷新，无感续期                  | ☐         |
| 8 小时超时         | 无操作 8 小时后自动退出登录                      | ☐         |
| 菜单加载           | 调用 `GET /auth/menu`，侧边栏正确渲染            | ☐         |
| 动态路由           | 所有菜单可正常跳转                               | ☐         |
| 路由权限           | 无权限页面跳转 401                               | ☐         |
| 退出登录           | 清除认证数据，跳转登录页                         | ☐         |
| `bun run build`    | 构建无报错                                       | ✅ 已验证 |

### 5.2 微前端嵌入测试（基座未改造）

| 测试项         | 预期结果                                       | 状态 |
| -------------- | ---------------------------------------------- | ---- |
| 基座加载 CIM   | 子应用正常渲染                                 | ☐    |
| 基座已登录     | 子应用从 localStorage 读取 token，不显示登录页 | ☐    |
| 基座未登录     | 子应用显示自身登录页，自主登录                 | ☐    |
| 基座不下发数据 | 子应用自主调用接口获取菜单和用户信息           | ☐    |
| 路由切换       | 子应用内部路由正常工作                         | ☐    |
| Token 过期     | 子应用自主刷新或退出，不依赖基座               | ☐    |
| 切换其他子应用 | CIM 正确 unmount，无残留 DOM                   | ☐    |
| 切回 CIM       | CIM 正确 remount，状态恢复                     | ☐    |

### 5.3 微前端嵌入测试（基座已改造 — 增强验证）

| 测试项            | 预期结果                           | 状态 |
| ----------------- | ---------------------------------- | ---- |
| 基座下发 token    | 子应用优先使用基座 token           | ☐    |
| 基座下发 menuList | 子应用优先使用基座菜单             | ☐    |
| 基座监听事件      | 子应用 dispatch 事件被基座正确处理 | ☐    |
| 基座主题切换      | 子应用跟随基座主题                 | ☐    |

---

## 6. 后续工作

### 6.1 必须完成

| 优先级 | 内容                       | 说明                                                                                                    |
| ------ | -------------------------- | ------------------------------------------------------------------------------------------------------- |
| P0     | 对接真实后端接口           | `loginApi` / `getAuthMenuListApi` / `getUserInfoApi` / `refreshTokenApi` / `logoutApi` 当前为 Mock 实现 |
| P0     | 基座集成测试               | 在 UAM 基座中注册 CIM 子应用，验证微前端嵌入                                                            |
| P0     | 确认 localStorage key 对齐 | 确保基座和子应用使用相同的 token key（`'token'` / `'refresh_token'`）                                   |

### 6.2 建议完成

| 优先级 | 内容                   | 说明                                                                 |
| ------ | ---------------------- | -------------------------------------------------------------------- |
| P1     | 生产环境 base 路径配置 | 设置 `VITE_MICRO_APP_BASE=/cim/` 环境变量                            |
| P1     | 子应用部署路径         | Nginx 配置 `/cim/` 指向子应用 dist 目录                              |
| P2     | iframe 沙箱模式验证    | 如 with 沙箱出现样式冲突，切换到 iframe 沙箱                         |
| P2     | 性能测试               | 首次加载 < 3s，子应用切换 < 500ms，内存泄漏检查                      |
| P3     | 基座可选改造           | 基座 `setData` 增加 menuList / refreshToken 字段（增强体验，非必需） |

### 6.3 回滚策略

如改造后出现问题，可按以下步骤回滚：

1. **独立运行异常**: 检查 `main.ts` 中 `if (!isMicroApp())` 分支是否正常执行
2. **微前端嵌入异常**: 检查 `viteServerConfig.ts` 的 `cors` / `origin` 配置
3. **完全回滚**: `git revert` 本次改造的所有提交，恢复原始代码
