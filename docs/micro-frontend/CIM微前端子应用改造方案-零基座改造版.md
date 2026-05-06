# CIM 微前端子应用改造方案（零基座改造版）

> **基座应用**: UAM (`uam-front`) · **子应用**: CIM (`cim-platform-front`)
> **微前端框架**: @micro-zoe/micro-app
> **编写日期**: 2026-04-28
> **核心原则**: **不改造基座**，子应用自主适配微前端环境

---

## 目录

- [1. 原方案问题分析](#1-原方案问题分析)
- [2. 零基座改造策略](#2-零基座改造策略)
- [3. 改造方案（六阶段）](#3-改造方案六阶段)
  - [Phase 1: 版本对齐 + Vite 配置](#phase-1-版本对齐--vite-配置)
  - [Phase 2: 生命周期 + 运行模式感知](#phase-2-生命周期--运行模式感知)
  - [Phase 3: Token 自主获取（零基座依赖）](#phase-3-token-自主获取零基座依赖)
  - [Phase 4: 菜单与动态路由（零基座依赖）](#phase-4-菜单与动态路由零基座依赖)
  - [Phase 5: 路由守卫双模式适配](#phase-5-路由守卫双模式适配)
  - [Phase 6: 样式隔离 + 沙箱增强](#phase-6-样式隔离--沙箱增强)
- [4. 集成测试](#4-集成测试)
- [5. 风险评估与回滚策略](#5-风险评估与回滚策略)
- [6. 工期估算](#6-工期估算)

---

## 1. 原方案问题分析

原方案（改进版）存在以下**依赖基座改造**的问题：

| #   | 问题                           | 严重度 | 说明                                                                                             |
| --- | ------------------------------ | ------ | ------------------------------------------------------------------------------------------------ |
| 1   | **依赖基座下发 menuList**      | 🔴 高  | 原方案要求基座 `setData` 增加 `menuList` 字段，需改造基座代码                                    |
| 2   | **依赖基座下发 refreshToken**  | 🔴 高  | 原方案要求基座 `setData` 增加 `refreshToken`，需改造基座代码                                     |
| 3   | **依赖基座监听子应用事件**     | 🔴 高  | 原方案要求基座 `addEventListener('message')` 处理 logout/noPermission/routeError，需改造基座代码 |
| 4   | **依赖基座菜单过滤**           | 🟡 中  | 原方案要求基座按 `subsystemCode` 过滤菜单，需改造基座代码                                        |
| 5   | **main.ts 使用 require()**     | 🟡 中  | 原方案在 `dataListenerCallback` 中使用 `require('@/stores/user')`，Vite 不支持运行时 require     |
| 6   | **Token 获取方式不可靠**       | 🟡 中  | 微前端模式下从 `getMicroAppData()?.token` 获取，但基座可能未下发 token 字段                      |
| 7   | **未处理基座无数据下发的情况** | 🟡 中  | 若基座未做任何改造，子应用在微前端模式下将完全无法工作                                           |

### 核心矛盾

原方案的微前端模式**强依赖基座主动下发数据**（token、userInfo、menuList），但基座（UAM）可能：

- 未集成 micro-app 的 `setData` API
- 未下发 token/userInfo/menuList
- 未监听子应用事件

**本方案的核心思路**：子应用在微前端模式下，**自主完成认证和菜单加载**，不依赖基座下发任何数据。同时保留对基座数据下发的**兼容能力**——若未来基座改造完成，可无缝切换为基座下发模式。

---

## 2. 零基座改造策略

### 2.1 核心原则

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

### 2.2 双模式数据获取策略

| 数据         | 独立运行               | 微前端（基座已下发）       | 微前端（基座未下发）          |
| ------------ | ---------------------- | -------------------------- | ----------------------------- |
| **Token**    | 登录接口获取           | 优先用基座下发             | localStorage 共享 / 自主登录  |
| **UserInfo** | `/auth/user-info` 接口 | 优先用基座下发             | 自主调用接口                  |
| **MenuList** | `/auth/menu` 接口      | 优先用基座下发             | 自主调用接口 / 本地 JSON 兜底 |
| **路由前缀** | `BASE_URL`             | `__MICRO_APP_BASE_ROUTE__` | `__MICRO_APP_BASE_ROUTE__`    |

### 2.3 与原方案的关键差异

| 维度       | 原方案（改进版）       | 本方案（零基座改造版）                             |
| ---------- | ---------------------- | -------------------------------------------------- |
| Token 来源 | 微前端模式依赖基座下发 | 微前端模式自主获取（localStorage 共享 + 自主登录） |
| 菜单来源   | 微前端模式依赖基座下发 | 微前端模式自主调用接口，基座下发仅作增强           |
| 退出登录   | 微前端模式通知基座处理 | 微前端模式自主退出 + 通知基座（可选）              |
| 基座改造   | **必须改造**（4 项）   | **无需改造**（0 项）                               |
| 兼容性     | 仅适用于基座改造后     | 基座改造前后均可工作                               |

### 2.4 关键洞察：localStorage 共享

> **💡 micro-app 默认使用 `with` 沙箱**，子应用的 `localStorage` 实际指向基座的 `localStorage`。因此，**基座登录后写入的 token，子应用可直接从 localStorage 读取**，无需基座通过 `setData` 下发。这是零基座改造的核心基础。

---

## 3. 改造方案（六阶段）

### Phase 1: 版本对齐 + Vite 配置

> **目标**: 消除版本不一致导致的兼容性问题，配置 Vite 支持微前端
> **工期**: 1-2 人天

#### 1.1 版本对齐

> 与原方案 Phase 1 一致，此处不再重复。

#### 1.2 Vite 配置 — 微前端支持

在 `vite.config.ts` 中添加微前端相关配置：

```typescript
// vite.config.ts 新增配置
export default defineConfig({
  server: {
    port: 1989, // 子应用使用不同端口
    cors: true, // 允许跨域，基座通过 fetch 加载子应用
    origin: 'http://localhost:1989', // 静态资源路径前缀
  },
  base: process.env.NODE_ENV === 'production' ? '/cim/' : '/',
  build: {
    target: 'esnext',
    cssCodeSplit: false, // 样式合并，便于隔离
  },
})
```

#### 1.3 环境变量

新增 `.env.development`:

```bash
VITE_APP_TITLE=CIM 平台
VITE_API_BASE_URL=/api
VITE_ROUTER_MODE=history
```

---

### Phase 2: 生命周期 + 运行模式感知

> **目标**: 健壮的 mount/unmount，统一的运行模式判断
> **工期**: 1 人天

#### 2.1 类型声明文件

新建 `src/types/micro-app.d.ts`:

```typescript
/*
 * @Author: ChenYu ycyplus@gmail.com
 * @Date: 2026-04-28
 * @FilePath: \cim-platform-front\src\types\micro-app.d.ts
 * @Description: micro-app 类型声明 + 微前端数据接口
 * Copyright (c) 2026 by CHENY, All Rights Reserved 😎.
 */

import type { Router } from 'vue-router'

/** 基座下发的用户信息结构（可选，基座可能不下发） */
interface BaseUserInfo {
  username?: string
  avatar?: string
  roles?: string[]
  [key: string]: unknown
}

/** 基座下发的菜单项结构（可选，基座可能不下发） */
interface BaseMenuItem {
  path: string
  name?: string
  component?: string
  redirect?: string
  meta?: {
    title?: string
    icon?: string
    hidden?: boolean
    affix?: boolean
    keepAlive?: boolean
    full?: boolean
    link?: string
    [key: string]: unknown
  }
  children?: BaseMenuItem[]
}

/** 基座可能下发给子应用的数据结构（所有字段可选） */
interface MicroAppData {
  token?: string
  refreshToken?: string
  userInfo?: BaseUserInfo
  menuList?: BaseMenuItem[]
  router?: unknown
  path?: string
  type?: string
}

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

export {}
```

#### 2.2 微前端桥接模块

新建 `src/utils/micro-app-bridge.ts`:

```typescript
/*
 * @Author: ChenYu ycyplus@gmail.com
 * @Date: 2026-04-28
 * @FilePath: \cim-platform-front\src\utils\micro-app-bridge.ts
 * @Description: 微前端桥接工具 — 安全访问 micro-app API，统一运行模式判断
 * Copyright (c) 2026 by CHENY, All Rights Reserved 😎.
 */

import type { Router } from 'vue-router'

/** 运行模式 */
export type RunMode = 'micro' | 'standalone'

/** 是否运行在微前端环境 */
export function isMicroApp(): boolean {
  return !!window.__MICRO_APP_ENVIRONMENT__
}

/** 获取当前运行模式 */
export function getRunMode(): RunMode {
  return isMicroApp() ? 'micro' : 'standalone'
}

/**
 * * @description: 基座是否下发了有效数据
 * ! @return {boolean} 基座是否主动下发了 token/userInfo/menuList
 */
export function hasBaseAppData(): boolean {
  if (!isMicroApp() || !window.microApp) return false
  try {
    const data = window.microApp.getData()
    return !!(data?.token || data?.userInfo || data?.menuList)
  } catch {
    return false
  }
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

/**
 * * @description: 安全向基座派发数据（尽力而为，基座不监听也不报错）
 * ? @param {Record<string, unknown>} data 派发数据
 */
export function dispatchToBaseApp(data: Record<string, unknown>): void {
  if (!isMicroApp() || !window.microApp) return
  try {
    window.microApp.dispatch(data)
  } catch {
    // 基座未监听 → 静默失败，不影响子应用运行
    console.debug(
      '[CIM] dispatch to base app failed (base may not be listening)'
    )
  }
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

> **关键改进**: 不使用 `require()`，改用动态 `import()`；基座数据监听为**可选增强**，非必需依赖。

```typescript
/*
 * @Author: ChenYu ycyplus@gmail.com
 * @Date: 2026-04-28
 * @FilePath: \cim-platform-front\src\main.ts
 * @Description: 应用入口 — 支持独立运行与微前端嵌入双模式（零基座改造版）
 * Copyright (c) 2026 by CHENY, All Rights Reserved 😎.
 */

import { createApp, type App as VueApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import {
  isMicroApp,
  getRunMode,
  addMicroAppDataListener,
  removeMicroAppDataListener,
  getMicroAppData,
  hasBaseAppData,
} from './utils/micro-app-bridge'

let app: VueApp | null = null

/**
 * * @description: 基座数据监听回调（可选增强 — 基座若下发数据则同步，不下发则忽略）
 * ? @param {MicroAppData} data 基座下发的数据
 */
const dataListenerCallback = async (data: MicroAppData) => {
  console.log('[CIM] Received data from base app:', data)

  // 动态 import，避免 Vite 不支持 require()
  const { s_userStore } = await import('@/stores/user')
  const { s_permissionStore } = await import('@/stores/permission')

  // 基座下发了 token → 同步到子应用（增强，非必需）
  if (data.token) {
    const userStore = s_userStore()
    userStore.setToken(data.token)
    if (data.refreshToken) userStore.setRefreshToken(data.refreshToken)
  }

  // 基座下发了用户信息 → 同步
  if (data.userInfo) {
    s_userStore().setUserInfo(data.userInfo as any)
  }

  // 基座下发了菜单数据 → 同步（增强，非必需）
  if (data.menuList) {
    s_permissionStore().setAuthMenuListFromBase(data.menuList)
  }
}

/** 挂载应用 */
function mount() {
  if (app) return

  app = createApp(App)
  const pinia = createPinia()

  app.use(pinia)
  app.use(router)

  // 微前端环境：注册数据监听（可选增强）
  if (isMicroApp()) {
    addMicroAppDataListener(dataListenerCallback)

    // 若基座已下发初始数据，立即同步
    if (hasBaseAppData()) {
      const initialData = getMicroAppData()
      if (initialData) {
        dataListenerCallback(initialData)
      }
    }

    console.log(
      '[CIM] Running in micro-app mode (base app data:',
      hasBaseAppData() ? 'available' : 'not available, will self-initialize)'
    )
  }

  app.mount('#app')
  console.log(`[CIM] App mounted in ${getRunMode()} mode`)
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

---

### Phase 3: Token 自主获取（零基座依赖）

> **目标**: 子应用在微前端模式下**自主完成认证**，不依赖基座下发 token
> **工期**: 1-2 人天

#### 3.1 核心策略：Token 自主获取

```
┌──────────────────────────────────────────────────────────────┐
│  Token 获取优先级（两种模式统一逻辑）                         │
│                                                              │
│  1. localStorage 中已有有效 token → 直接使用                  │
│  2. 基座下发了 token（微前端模式）→ 同步到 localStorage       │
│  3. 以上都没有 → 跳转登录页，自主登录获取 token               │
│                                                              │
│  ⚠️ 关键：微前端模式下，子应用与基座共享同一域名下的           │
│  localStorage，因此基座登录后 token 已存在于 localStorage，    │
│  子应用可直接读取，无需基座主动下发。                          │
└──────────────────────────────────────────────────────────────┘
```

#### 3.2 常量定义

新建 `src/constant/index.ts`:

```typescript
/*
 * @Author: ChenYu ycyplus@gmail.com
 * @Date: 2026-04-28
 * @FilePath: \cim-platform-front\src\constant\index.ts
 * @Description: 常量定义 — 与基座 localStorage key 对齐
 * Copyright (c) 2026 by CHENY, All Rights Reserved 😎.
 */

// * Token 相关（key 与基座一致，确保微前端模式下 localStorage 共享）
export const TOKEN: string = 'token'
export const REFRESH_TOKEN: string = 'refresh_token'
export const TIME_STAMP: string = 'timeStamp'
export const TOKEN_EXPIRES_IN: string = 'token_expires_in'

// * 超时时长：8小时（与基座一致）
export const TOKEN_TIMEOUT_VALUE: number = 8 * 3600 * 1000

// * Token 刷新阈值：过期前5分钟（与基座一致）
export const TOKEN_REFRESH_THRESHOLD: number = 5 * 60 * 1000

// * 页面地址
export const HOME_URL: string = '/home'
export const LOGIN_URL: string = '/login'

// * 子应用名称
export const APP_NAME: string = 'CIM'
```

#### 3.3 认证工具函数

新建 `src/utils/d_auth.ts`:

```typescript
/*
 * @Author: ChenYu ycyplus@gmail.com
 * @Date: 2026-04-28
 * @FilePath: \cim-platform-front\src\utils\d_auth.ts
 * @Description: 权限相关工具函数 — 与基座对齐
 * Copyright (c) 2026 by CHENY, All Rights Reserved 😎.
 */

import { TIME_STAMP, TOKEN_TIMEOUT_VALUE } from '@/constant'

/**
 * @description: 获取缓存的时间戳
 */
export const d_getTimeStamp = (): number => {
  const raw = localStorage.getItem(TIME_STAMP)
  if (raw === null) return 0
  try {
    return JSON.parse(raw) as number
  } catch {
    return 0
  }
}

/**
 * @description: 设置缓存时间戳
 */
export const d_setTimeStamp = (): void =>
  localStorage.setItem(TIME_STAMP, JSON.stringify(Date.now()))

/**
 * @description: 刷新过期时间（活跃续期，与基座一致）
 */
export const d_refreshTokenExpire = (): void => {
  localStorage.setItem(TIME_STAMP, JSON.stringify(Date.now()))
}

/**
 * @description: 是否超时（8小时无操作，与基座一致）
 */
export const d_isCheckTimeout = (): boolean => {
  const currentTime = Date.now()
  const timeStamp = d_getTimeStamp()
  return currentTime - timeStamp > TOKEN_TIMEOUT_VALUE
}
```

#### 3.4 子应用 API 层

新建 `src/api/auth.ts`:

```typescript
/*
 * @Author: ChenYu ycyplus@gmail.com
 * @Date: 2026-04-28
 * @FilePath: \cim-platform-front\src\api\auth.ts
 * @Description: 认证接口 — 与基座 UAM 接口对齐
 * Copyright (c) 2026 by CHENY, All Rights Reserved 😎.
 */

import { postData, getData } from '@robot-admin/request-core'

// ======================== 类型定义 ========================

/** 登录请求参数 */
export interface LoginParams {
  username: string
  password: string
  captcha?: {
    token: string
    timestamp: number
    type: string
  }
}

/** 登录响应 */
export interface LoginResponse {
  code: string
  data: {
    token: string
    refreshToken?: string
    expiresIn?: number
    [key: string]: unknown
  }
  msg: string
}

/** Token 刷新响应 */
export interface RefreshTokenResponse {
  code: string | number
  data: {
    token: string
    refreshToken: string
    expiresIn: number
  }
  msg?: string
}

/** 菜单列表响应 */
export interface MenuListResponse {
  code: string
  data: DynamicRoute[]
  msg: string
}

/** 用户信息响应 */
export interface UserInfoResponse {
  code: string
  data: {
    username: string
    avatar?: string
    roles?: string[]
    [key: string]: unknown
  }
  msg: string
}

// ======================== API 函数 ========================

/**
 * * @description: 用户登录（与基座 UAM 接口一致）
 * ? @param {LoginParams} data 登录表单数据
 * ! @return {Promise<LoginResponse>} 登录响应，包含 token
 */
export const loginApi = (data: LoginParams) =>
  postData<LoginResponse>('/auth/login', data)

/**
 * * @description: 刷新 Token（与基座 UAM 接口一致）
 * ? @param {string} refreshToken 刷新令牌
 * ! @return {Promise<RefreshTokenResponse>} 新的 token 和 refreshToken
 */
export const refreshTokenApi = (refreshToken: string) =>
  postData<RefreshTokenResponse>('/auth/refresh-token', { refreshToken })

/**
 * * @description: 获取用户菜单权限列表（与基座 UAM 接口一致）
 * ! @return {Promise<MenuListResponse>} 动态菜单路由配置
 */
export const getAuthMenuListApi = () => getData<MenuListResponse>('/auth/menu')

/**
 * * @description: 获取当前用户信息（与基座 UAM 接口一致）
 * ! @return {Promise<UserInfoResponse>} 用户信息
 */
export const getUserInfoApi = () => getData<UserInfoResponse>('/auth/user-info')

/**
 * * @description: 退出登录（与基座 UAM 接口一致）
 * ! @return {Promise<void>}
 */
export const logoutApi = () => postData<void>('/auth/logout')
```

#### 3.5 用户 Store — 零基座依赖版

新建 `src/stores/user/index.ts`:

```typescript
/*
 * @Author: ChenYu ycyplus@gmail.com
 * @Date: 2026-04-28
 * @FilePath: \cim-platform-front\src\stores\user\index.ts
 * @Description: 用户状态管理 — 零基座依赖，支持微前端/独立运行双模式
 * Copyright (c) 2026 by CHENY, All Rights Reserved 😎.
 */

import { defineStore } from 'pinia'
import { TOKEN, REFRESH_TOKEN, TIME_STAMP, TOKEN_EXPIRES_IN } from '@/constant'
import { isMicroApp, dispatchToBaseApp } from '@/utils/micro-app-bridge'
import { d_setTimeStamp } from '@/utils/d_auth'
import router from '@/router'

interface UserInfo {
  username?: string
  avatar?: string
  roles?: string[]
  [key: string]: unknown
}

/** 安全读取 localStorage 并反序列化 */
function readStorage<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key)
  if (raw === null) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return raw as unknown as T
  }
}

export const s_userStore = defineStore('user', {
  state: () => ({
    token: readStorage<string>(TOKEN, ''),
    refreshToken: readStorage<string>(REFRESH_TOKEN, ''),
    tokenExpiresAt: readStorage<number>(TOKEN_EXPIRES_IN, 0),
    userInfo: readStorage<UserInfo>('userInfo', {} as UserInfo),
  }),

  getters: {
    hasUserInfo: state => Object.keys(state.userInfo).length > 0,
    /** 是否已登录 */
    isLoggedIn: state => !!state.token,
  },

  actions: {
    setToken(token: string) {
      this.token = token
      localStorage.setItem(TOKEN, JSON.stringify(token))
    },

    setRefreshToken(refreshToken: string) {
      this.refreshToken = refreshToken
      localStorage.setItem(REFRESH_TOKEN, JSON.stringify(refreshToken))
    },

    setTokenExpiresAt(expiresIn: number) {
      const expiresAt = Date.now() + expiresIn * 1000
      this.tokenExpiresAt = expiresAt
      localStorage.setItem(TOKEN_EXPIRES_IN, JSON.stringify(expiresAt))
    },

    /** 判断 token 是否即将过期（提前 5 分钟，与基座一致） */
    isTokenExpiringSoon(): boolean {
      if (!this.tokenExpiresAt) return false
      return Date.now() > this.tokenExpiresAt - 5 * 60 * 1000
    },

    setUserInfo(userInfo: UserInfo) {
      this.userInfo = userInfo
      localStorage.setItem('userInfo', JSON.stringify(userInfo))
    },

    /**
     * * @description: 登录成功处理
     * ? @param {string} token 访问令牌
     * ? @param {string} refreshToken 刷新令牌
     * ? @param {number} expiresIn 过期时间（秒）
     */
    handleLoginSuccess(
      token: string,
      refreshToken?: string,
      expiresIn?: number
    ) {
      this.setToken(token)
      if (refreshToken) this.setRefreshToken(refreshToken)
      if (expiresIn) this.setTokenExpiresAt(expiresIn)
      d_setTimeStamp()
    },

    /**
     * * @description: 退出登录（零基座依赖版）
     * ? @param {boolean} isExpired 是否因 Token 过期退出
     *
     * 微前端模式下：
     * - 自主清除认证数据
     * - 尝试通知基座（尽力而为，基座不监听也不影响）
     * - 跳转自身登录页（而非依赖基座跳转）
     */
    async logout(isExpired = false) {
      try {
        // 微前端模式：尝试通知基座（尽力而为，不依赖）
        if (isMicroApp()) {
          dispatchToBaseApp({ type: 'logout', isExpired })
        }

        // 无论哪种模式，都自主清除认证数据
        this.token = ''
        this.refreshToken = ''
        this.tokenExpiresAt = 0
        this.userInfo = {}

        document.title = import.meta.env.VITE_APP_TITLE || 'CIM'

        // 清除认证相关数据（保留用户配置如主题、语言等）
        localStorage.removeItem(TOKEN)
        localStorage.removeItem(REFRESH_TOKEN)
        localStorage.removeItem(TOKEN_EXPIRES_IN)
        localStorage.removeItem(TIME_STAMP)
        localStorage.removeItem('userInfo')
        localStorage.removeItem('__tags_view_list__')

        // 清理动态路由
        const { clearExistingRoutes } = await import('@/router/dynamicRouter')
        clearExistingRoutes()

        // 跳转登录页（微前端模式下跳转子应用自身登录页）
        router.replace('/login')
      } catch (error) {
        console.error('退出登录失败:', error)
        router.replace('/login')
      }
    },
  },
})
```

#### 3.6 请求拦截器 — Token 注入与刷新

```typescript
/*
 * @Author: ChenYu ycyplus@gmail.com
 * @Date: 2026-04-28
 * @FilePath: \cim-platform-front\src\utils\request.ts
 * @Description: 请求拦截器 — Token 注入 + 无感刷新 + 活跃续期
 * Copyright (c) 2026 by CHENY, All Rights Reserved 😎.
 */

import { s_userStore } from '@/stores/user'
import { refreshTokenApi } from '@/api/auth'
import { d_refreshTokenExpire, d_isCheckTimeout } from '@/utils/d_auth'
import { isMicroApp, dispatchToBaseApp } from '@/utils/micro-app-bridge'

/** 是否正在刷新 Token */
let isRefreshing = false
/** 等待 Token 刷新的请求队列 */
let pendingRequests: Array<(token: string) => void> = []

/**
 * * @description: 获取当前 Token
 * ! @return {string} 当前 token
 *
 * 零基座依赖策略：
 * - 微前端模式下，token 存储在 localStorage（与基座共享）
 * - 子应用 Store 初始化时从 localStorage 读取
 * - 因此直接从 Store 获取即可，无需从基座 getData
 */
export function getCurrentToken(): string {
  return s_userStore().token
}

/** 请求拦截器：注入 Token */
export function setupRequestInterceptor(axiosInstance: any) {
  // 请求拦截
  axiosInstance.interceptors.request.use(
    (config: any) => {
      const token = getCurrentToken()
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
      return config
    },
    (error: any) => Promise.reject(error)
  )

  // 响应拦截：Token 过期无感刷新 + 活跃续期
  axiosInstance.interceptors.response.use(
    (response: any) => {
      // 活跃续期：每次请求成功更新时间戳（与基座一致）
      d_refreshTokenExpire()
      return response
    },
    async (error: any) => {
      const { config, response } = error

      // Token 过期 → 无感刷新
      if (response?.status === 401 && !config._retry) {
        config._retry = true

        if (!isRefreshing) {
          isRefreshing = true
          try {
            const userStore = s_userStore()
            const res = await refreshTokenApi(userStore.refreshToken)
            const newToken = res.data.token

            userStore.setToken(newToken)
            if (res.data.refreshToken)
              userStore.setRefreshToken(res.data.refreshToken)
            if (res.data.expiresIn)
              userStore.setTokenExpiresAt(res.data.expiresIn)

            // 执行等待队列
            pendingRequests.forEach(cb => cb(newToken))
            pendingRequests = []

            // 重试原请求
            config.headers.Authorization = `Bearer ${newToken}`
            return axiosInstance(config)
          } catch (refreshError) {
            // 刷新失败 → 退出登录
            pendingRequests = []
            s_userStore().logout(true)
            return Promise.reject(refreshError)
          } finally {
            isRefreshing = false
          }
        }

        // 正在刷新 → 加入等待队列
        return new Promise(resolve => {
          pendingRequests.push((token: string) => {
            config.headers.Authorization = `Bearer ${token}`
            resolve(axiosInstance(config))
          })
        })
      }

      return Promise.reject(error)
    }
  )
}
```

#### 3.7 登录页

新建 `src/views/login/index.vue`:

```vue
<!--
 * @Author: ChenYu ycyplus@gmail.com
 * @Date: 2026-04-28
 * @FilePath: \cim-platform-front\src\views\login\index.vue
 * @Description: CIM 子应用登录页 — 独立运行 & 微前端模式均可用
 * Copyright (c) 2026 by CHENY, All Rights Reserved 😎.
-->
<template>
  <div class="cim-login-container">
    <div class="cim-login-card">
      <h1 class="cim-login-title">CIM 平台</h1>
      <p class="cim-login-subtitle">请登录您的账号</p>

      <n-form
        ref="formRef"
        :model="formData"
        :rules="rules"
        label-placement="left"
      >
        <n-form-item path="username">
          <n-input
            v-model:value="formData.username"
            placeholder="请输入用户名"
            size="large"
            @keyup.enter="handleLogin"
          >
            <template #prefix>
              <n-icon :component="UserIcon" />
            </template>
          </n-input>
        </n-form-item>

        <n-form-item path="password">
          <n-input
            v-model:value="formData.password"
            type="password"
            show-password-on="click"
            placeholder="请输入密码"
            size="large"
            @keyup.enter="handleLogin"
          >
            <template #prefix>
              <n-icon :component="LockIcon" />
            </template>
          </n-input>
        </n-form-item>

        <n-button
          type="primary"
          block
          size="large"
          :loading="loading"
          @click="handleLogin"
        >
          登 录
        </n-button>
      </n-form>
    </div>
  </div>
</template>

<script setup lang="ts">
  defineOptions({ name: 'CimLogin' })

  import { UserIcon, LockIcon } from './icons'
  import { loginApi } from '@/api/auth'
  import { s_userStore } from '@/stores/user'
  import { initDynamicRouter } from '@/router/dynamicRouter'

  const router = useRouter()
  const message = useMessage()
  const userStore = s_userStore()

  const loading = ref(false)
  const formRef = ref()

  const formData = reactive({
    username: '',
    password: '',
  })

  const rules = {
    username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
    password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
  }

  /**
   * * @description: 登录处理
   * 独立运行 & 微前端模式统一逻辑：
   * 1. 调用登录接口获取 token
   * 2. 存入 localStorage（微前端模式下基座可共享）
   * 3. 初始化动态路由
   * 4. 跳转首页
   */
  const handleLogin = async () => {
    try {
      await formRef.value?.validate()
    } catch {
      return
    }

    loading.value = true
    try {
      const response = await loginApi({
        username: formData.username,
        password: formData.password,
      })

      if (response.code === '0') {
        userStore.handleLoginSuccess(
          response.data.token,
          response.data.refreshToken,
          response.data.expiresIn
        )
        userStore.setUserInfo({ username: formData.username })

        const ok = await initDynamicRouter()
        if (!ok) throw new Error('动态路由初始化失败')

        message.success('登录成功')
        router.replace('/home')
      } else {
        message.error(response.msg || '登录失败')
      }
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '登录失败')
    } finally {
      loading.value = false
    }
  }
</script>

<style lang="scss" scoped>
  @use './index.scss';
</style>
```

#### 3.8 验证清单

- [ ] 独立运行 `bun run dev` → 显示登录页
- [ ] 输入账号密码 → 调用 `POST /auth/login` → 获取 token
- [ ] Token 存入 localStorage（key 与基座一致）
- [ ] 登录成功 → 初始化动态路由 → 跳转首页
- [ ] Token 过期 → 无感刷新正常工作
- [ ] 8 小时无操作 → 自动退出登录
- [ ] **🆕 微前端模式 → 基座已登录时，子应用从 localStorage 读取 token，不显示登录页**
- [ ] **🆕 微前端模式 → 基座未登录时，子应用显示自身登录页，自主登录**

---

### Phase 4: 菜单与动态路由（零基座依赖）

> **目标**: 子应用在微前端模式下**自主加载菜单**，不依赖基座下发
> **工期**: 1 人天

#### 4.1 核心策略：菜单自主加载

```
┌──────────────────────────────────────────────────────────────┐
│  菜单获取优先级                                               │
│                                                              │
│  1. 基座下发了 menuList（微前端模式）→ 优先使用基座菜单       │
│  2. 基座未下发 → 自主调用 GET /auth/menu 获取菜单             │
│  3. 接口不可用 → 使用本地 JSON 兜底（开发环境）               │
│                                                              │
│  ⚠️ 子应用菜单过滤策略：                                      │
│  - 自主调用接口时，后端按用户权限返回 CIM 相关菜单             │
│  - 使用基座菜单时，前端按 path 前缀过滤 CIM 相关路由          │
└──────────────────────────────────────────────────────────────┘
```

#### 4.2 权限 Store — 零基座依赖版

新建 `src/stores/permission/index.ts`:

```typescript
/*
 * @Author: ChenYu ycyplus@gmail.com
 * @Date: 2026-04-28
 * @FilePath: \cim-platform-front\src\stores\permission\index.ts
 * @Description: 权限 Store — 零基座依赖，支持微前端/独立运行双模式
 * Copyright (c) 2026 by CHENY, All Rights Reserved 😎.
 */

import { defineStore } from 'pinia'
import { getAuthMenuListApi } from '@/api/auth'
import {
  isMicroApp,
  getMicroAppData,
  hasBaseAppData,
} from '@/utils/micro-app-bridge'
import type { DynamicRoute } from '@/router/dynamicRouter'

/**
 * * @description: 从基座菜单中过滤出属于 CIM 子应用的菜单
 * ? @param {DynamicRoute[]} menuList 基座完整菜单
 * ! @return {DynamicRoute[]} CIM 子应用菜单
 *
 * 过滤策略：按 path 前缀匹配（无需基座配合 subsystemCode）
 */
function filterCimMenuList(menuList: DynamicRoute[]): DynamicRoute[] {
  // CIM 子应用路由前缀（可配置化）
  const CIM_PREFIXES = ['/cim', '/map', '/model', '/scene', '/monitor']

  const filter = (routes: DynamicRoute[]): DynamicRoute[] => {
    return routes
      .filter(route => {
        // 精确匹配前缀
        const matched = CIM_PREFIXES.some(prefix =>
          route.path.startsWith(prefix)
        )
        // 或匹配 meta.subsystemCode（如果基座有提供）
        const codeMatched = (route.meta as any)?.subsystemCode === 'cim'
        return matched || codeMatched
      })
      .map(route => ({
        ...route,
        children: route.children ? filter(route.children) : undefined,
      }))
  }

  return filter(menuList)
}

export const s_permissionStore = defineStore('permission', {
  state: () => ({
    /** 动态菜单路由列表 */
    authMenuList: [] as DynamicRoute[],
    /** 已展平的全部合法路由 path 列表 */
    flatRoutePaths: [] as string[],
  }),

  getters: {
    /** 过滤后的显示菜单（hidden !== true） */
    showMenuListGet: state => state.authMenuList.filter(r => !r.meta?.hidden),
    /** 需缓存的路由 name 列表 */
    keepAliveRouterGet: state =>
      state.authMenuList
        .filter(r => r.meta?.keepAlive && r.name)
        .map(r => r.name!),
  },

  actions: {
    /**
     * * @description: 获取菜单列表（零基座依赖版）
     *
     * 优先级：
     * 1. 基座下发了 menuList → 过滤出 CIM 菜单后使用
     * 2. 基座未下发 → 自主调用 GET /auth/menu
     * 3. 接口失败 → 使用本地 JSON 兜底
     *
     * ! @return {Promise<any>} 菜单列表响应
     */
    async getAuthMenuList() {
      try {
        // 🆕 优先级 1：基座下发了菜单数据
        if (isMicroApp() && hasBaseAppData()) {
          const microData = getMicroAppData()
          if (microData?.menuList?.length) {
            // 过滤出 CIM 子应用菜单
            const cimMenuList = filterCimMenuList(
              microData.menuList as DynamicRoute[]
            )
            if (cimMenuList.length) {
              this.authMenuList = cimMenuList
              this.flatRoutePaths = [...this._buildFlatPaths(cimMenuList)]
              return { code: '0', data: cimMenuList, msg: 'success' }
            }
          }
        }

        // 🆕 优先级 2：自主调用后端接口
        try {
          const res = await getAuthMenuListApi()
          this.authMenuList = res.data
          this.flatRoutePaths = [...this._buildFlatPaths(res.data)]
          return res
        } catch (apiError) {
          console.warn(
            '[CIM] Menu API failed, falling back to local JSON:',
            apiError
          )
        }

        // 🆕 优先级 3：本地 JSON 兜底
        const localMenu = await this._loadLocalMenu()
        this.authMenuList = localMenu
        this.flatRoutePaths = [...this._buildFlatPaths(localMenu)]
        return { code: '0', data: localMenu, msg: 'success (local fallback)' }
      } catch (error) {
        console.error('获取菜单失败:', error)
        throw error
      }
    },

    /**
     * * @description: 从基座同步菜单数据（微前端模式下由 bridge 回调调用）
     * ? @param {DynamicRoute[]} menuList 基座下发的菜单列表
     */
    setAuthMenuListFromBase(menuList: DynamicRoute[]) {
      // 过滤出 CIM 子应用菜单
      const cimMenuList = filterCimMenuList(menuList)
      if (cimMenuList.length) {
        this.authMenuList = cimMenuList
        this.flatRoutePaths = [...this._buildFlatPaths(cimMenuList)]
      }
    },

    /**
     * * @description: 校验当前路由是否在权限范围内
     * ? @param {string} path 目标路由路径
     * ! @return {boolean} 是否有访问权限
     */
    hasRoutePermission(path: string): boolean {
      if (this.flatRoutePaths.length === 0) return true
      return this.flatRoutePaths.includes(path)
    },

    /**
     * * @description: 加载本地菜单 JSON 兜底
     * ! @return {Promise<DynamicRoute[]>} 本地菜单数据
     */
    async _loadLocalMenu(): Promise<DynamicRoute[]> {
      try {
        const module = await import('@/assets/data/dynamicRouter.json')
        return (module.default || module) as DynamicRoute[]
      } catch {
        console.warn('[CIM] Local menu JSON not found')
        return []
      }
    },

    /**
     * * @description: 递归展平路由树
     */
    _buildFlatPaths(
      routes: DynamicRoute[],
      parentPath = '',
      isChild = false
    ): string[] {
      const paths: string[] = []
      for (const route of routes) {
        let fullPath: string
        if (isChild && !route.path.startsWith('/')) {
          fullPath = `/${route.path}`
        } else if (route.path.startsWith('/')) {
          fullPath = route.path
        } else {
          fullPath = `${parentPath}/${route.path}`.replace(/\/+/g, '/')
        }
        if (!paths.includes(fullPath)) paths.push(fullPath)
        if (route.children?.length) {
          for (const p of this._buildFlatPaths(
            route.children,
            fullPath,
            true
          )) {
            if (!paths.includes(p)) paths.push(p)
          }
        }
      }
      return paths
    },
  },
})
```

#### 4.3 动态路由初始化

新建 `src/router/dynamicRouter.ts`:

```typescript
/*
 * @Author: ChenYu ycyplus@gmail.com
 * @Date: 2026-04-28
 * @FilePath: \cim-platform-front\src\router\dynamicRouter.ts
 * @Description: 动态路由初始化 — 零基座依赖，支持双模式
 * Copyright (c) 2026 by CHENY, All Rights Reserved 😎.
 */

import router from './index'
import type { RouteRecordRaw } from 'vue-router'
import { s_permissionStore } from '@/stores/permission'

export interface RouteMeta extends Record<string, any> {
  title?: string
  icon?: string
  hidden?: boolean
  affix?: boolean
  keepAlive?: boolean
  full?: boolean
  link?: string
}

export interface DynamicRoute {
  path: string
  name?: string
  component?: string
  redirect?: string
  meta?: RouteMeta
  children?: DynamicRoute[]
}

// 预定义组件
const COMPONENTS = {
  layout: () => import('@/components/global/C_Layout/index.vue'),
  '404': () => import('@/views/error-page/404.vue'),
} as const

// 视图模块映射（eager + lazy 混合策略，与基座一致）
const EAGER_MODULES = import.meta.glob('@/views/home/**/*.vue', { eager: true })
const LAZY_MODULES = import.meta.glob('@/views/**/*.vue')
const VIEW_MODULES = { ...LAZY_MODULES, ...EAGER_MODULES }

/** 路径规范化 */
const normalizePath = (path: string, isChild: boolean): string => {
  if (import.meta.env.DEV && isChild && path.startsWith('/')) {
    console.warn(`[路由警告] 子路由path "${path}" 已包含前导/`)
  }
  return isChild && !path.startsWith('/') ? `/${path}` : path
}

/** 组件解析 */
const resolveComponent = (path?: string) => {
  if (!path) return undefined
  if (path in COMPONENTS) return COMPONENTS[path as keyof typeof COMPONENTS]

  try {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`
    const viewPath = `/src/views${normalizedPath}.vue`
    const module = VIEW_MODULES[viewPath]

    if (module) {
      if (typeof module === 'object' && 'default' in module) {
        return () => Promise.resolve(module)
      }
      return module
    }

    console.warn(`[动态路由] 组件不存在: ${viewPath}`)
    return COMPONENTS['404']
  } catch (error) {
    console.error('[动态路由] 组件解析失败:', error)
    return COMPONENTS['404']
  }
}

/** 路由处理中间件 */
const processRoute = (route: DynamicRoute, isChild = false): RouteRecordRaw => {
  return {
    ...route,
    path: normalizePath(route.path, isChild),
    component: resolveComponent(route.component),
    children: route.children?.map(child => processRoute(child, true)),
    meta: {
      ...route.meta,
      isLayout: route.component === 'layout',
    },
  } as RouteRecordRaw
}

/** 清理现有路由 */
export const clearExistingRoutes = (protectedNames = ['login']) => {
  router
    .getRoutes()
    .filter(r => r.name && !protectedNames.includes(r.name.toString()))
    .forEach(r => router.removeRoute(r.name!))
}

/**
 * * @description: 初始化动态路由
 * ! @return {Promise<boolean>} 是否初始化成功
 */
export const initDynamicRouter = async (): Promise<boolean> => {
  try {
    const permissionStore = s_permissionStore()
    const { code, data: routes, msg } = await permissionStore.getAuthMenuList()

    if (code !== '0' || !Array.isArray(routes)) {
      throw new Error(msg || '无效的路由数据格式')
    }

    clearExistingRoutes(['login', '404', '401'])

    routes
      .map(route => processRoute(route as DynamicRoute))
      .forEach(route => router.addRoute(route))

    if (import.meta.env.DEV) {
      console.debug('[动态路由] 初始化完成:', router.getRoutes())
    }

    return true
  } catch (error) {
    console.error('[动态路由] 初始化失败:', error)
    return false
  }
}
```

#### 4.4 静态路由配置

新建 `src/router/publicRouter.ts`:

```typescript
/*
 * @Author: ChenYu ycyplus@gmail.com
 * @Date: 2026-04-28
 * @FilePath: \cim-platform-front\src\router\publicRouter.ts
 * @Description: 静态路由 — 登录页、错误页等无需权限的页面
 * Copyright (c) 2026 by CHENY, All Rights Reserved 😎.
 */

import type { RouteRecordRaw } from 'vue-router'

/**
 * * @description: 公共路由（无需登录即可访问）
 */
export const publicRoutes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/login/index.vue'),
    meta: { title: '登录', hidden: true },
  },
  {
    path: '/404',
    name: '404',
    component: () => import('@/views/error-page/404.vue'),
    meta: { title: '页面不存在', hidden: true },
  },
  {
    path: '/401',
    name: '401',
    component: () => import('@/views/error-page/401.vue'),
    meta: { title: '无权限', hidden: true },
  },
]
```

#### 4.5 验证清单

- [ ] 独立运行登录后 → 调用 `GET /auth/menu` → 获取菜单数据
- [ ] 菜单数据正确渲染侧边栏
- [ ] 动态路由注册成功，页面可正常跳转
- [ ] **🆕 微前端模式 + 基座下发菜单 → 使用基座菜单（过滤 CIM 前缀）**
- [ ] **🆕 微前端模式 + 基座未下发菜单 → 自主调用接口获取**
- [ ] **🆕 接口不可用 → 使用本地 JSON 兜底**
- [ ] 基座菜单更新 → 子应用实时同步（若基座有数据监听）

---

### Phase 5: 路由守卫双模式适配

> **目标**: 路由守卫在微前端/独立运行两种模式下均可正常工作，**不依赖基座监听事件**
> **工期**: 1 人天

#### 5.1 核心策略：路由守卫自主处理

```
┌──────────────────────────────────────────────────────────────┐
│  路由守卫策略（零基座依赖）                                    │
│                                                              │
│  未登录 → 微前端模式：跳转自身 /login（而非通知基座）          │
│         → 独立运行：跳转自身 /login                           │
│                                                              │
│  Token 超时 → 自主退出 + 尝试通知基座（尽力而为）             │
│                                                              │
│  无权限 → 显示自身 401 页 + 尝试通知基座（尽力而为）          │
│                                                              │
│  路由切换 → 尝试同步到基座标签页（尽力而为）                   │
│                                                              │
│  ⚠️ 所有 dispatchToBaseApp 调用均为"尽力而为"，               │
│  基座不监听也不影响子应用正常运行。                            │
└──────────────────────────────────────────────────────────────┘
```

#### 5.2 路由守卫实现

新建 `src/router/permission.ts`:

```typescript
/*
 * @Author: ChenYu ycyplus@gmail.com
 * @Date: 2026-04-28
 * @FilePath: \cim-platform-front\src\router\permission.ts
 * @Description: 路由权限控制 — 零基座依赖，支持微前端/独立运行双模式
 * Copyright (c) 2026 by CHENY, All Rights Reserved 😎.
 */

import router from '@/router'
import { s_userStore } from '@/stores/user'
import { s_permissionStore } from '@/stores/permission'
import { initDynamicRouter } from '@/router/dynamicRouter'
import {
  isMicroApp,
  dispatchToBaseApp,
  getMicroAppBaseRoute,
} from '@/utils/micro-app-bridge'
import { d_isCheckTimeout } from '@/utils/d_auth'

const WHITE_LIST = ['/login', '/404', '/401']
const LOGIN_PATH = '/login'
const DEFAULT_TITLE = 'CIM'

// 防止重复初始化
let isInitializing = false

/**
 * * @description: 设置页面标题
 */
function setPageTitle(title?: string): void {
  document.title = title ? `${title} | ${DEFAULT_TITLE}` : DEFAULT_TITLE
}

/**
 * * @description: 初始化动态路由
 */
async function handleDynamicRouterInit(fullPath: string): Promise<string> {
  if (isInitializing) return fullPath
  isInitializing = true

  try {
    const success = await initDynamicRouter()
    if (!success) throw new Error('动态路由初始化失败')

    const { authMenuList } = s_permissionStore()
    if (!authMenuList.length) throw new Error('菜单数据为空')

    return fullPath
  } catch (error) {
    console.error('动态路由加载失败:', error)

    // 🆕 微前端模式：尝试通知基座（尽力而为），但自身也处理
    if (isMicroApp()) {
      dispatchToBaseApp({ type: 'routeError', error: String(error) })
    }

    // 无论哪种模式，都重置状态并跳转登录
    s_userStore().$reset()
    return LOGIN_PATH
  } finally {
    isInitializing = false
  }
}

/**
 * * @description: 校验路由访问权限
 */
function checkRoutePermission(to: any): boolean {
  if (WHITE_LIST.includes(to.path)) return true
  if (['/home', '/404', '/401'].includes(to.path)) return true
  return s_permissionStore().hasRoutePermission(to.path)
}

// ======================== 核心路由守卫 ========================

router.beforeEach(async (to: any): Promise<string | boolean> => {
  try {
    const userStore = s_userStore()
    const token = userStore.token // 从 Store 获取（已从 localStorage 初始化）
    const { authMenuList } = s_permissionStore()
    const meta = to.meta as { title?: string; [key: string]: any }

    // 1. 未登录处理 — 两种模式统一跳转自身 /login
    if (!token) {
      if (WHITE_LIST.includes(to.path)) return true
      return LOGIN_PATH
    }

    // 2. Token 超时检查（8小时无操作，与基座一致）
    if (d_isCheckTimeout()) {
      await userStore.logout(true) // logout 内部会尝试通知基座
      return LOGIN_PATH
    }

    // 3. 已登录但访问登录页 → 重定向首页
    if (to.path === LOGIN_PATH) {
      return '/home'
    }

    // 4. 动态路由初始化
    if (!authMenuList.length && !isInitializing) {
      const result = await handleDynamicRouterInit(to.fullPath)
      if (result !== to.fullPath) return result
      return to.fullPath
    }

    // 5. 路由权限校验
    if (!checkRoutePermission(to)) {
      // 🆕 尝试通知基座（尽力而为）
      if (isMicroApp()) {
        dispatchToBaseApp({ type: 'noPermission', path: to.path })
      }
      return '/401'
    }

    // 6. 🆕 微前端模式：尝试同步路由到基座（尽力而为）
    if (isMicroApp()) {
      const basePath = getMicroAppBaseRoute()
      dispatchToBaseApp({
        type: 'pathEvent',
        path: `${basePath}${to.fullPath}`,
      })
    }

    setPageTitle(meta.title)
    return true
  } catch (error) {
    console.error('路由异常:', error)

    // 🆕 微前端模式：尝试通知基座（尽力而为）
    if (isMicroApp()) {
      dispatchToBaseApp({ type: 'routeError', error: String(error) })
    }

    s_userStore().$reset()
    return LOGIN_PATH
  }
})

router.afterEach(() => {
  // 可扩展：NProgress 完成、页面统计等
})

router.onError((error: Error) => {
  console.error('路由错误:', error)
  if (error.message.includes('Loading chunk')) {
    window.location.reload()
  }
})
```

#### 5.3 路由配置

```typescript
// src/router/index.ts
import { createRouter, createWebHistory } from 'vue-router'
import { isMicroApp, getMicroAppBaseRoute } from '@/utils/micro-app-bridge'
import { publicRoutes } from './publicRouter'
import './permission'

const router = createRouter({
  history: createWebHistory(
    isMicroApp() ? getMicroAppBaseRoute() : import.meta.env.BASE_URL
  ),
  routes: [
    ...publicRoutes,
    // 动态路由通过 initDynamicRouter() 注册
    {
      path: '/:pathMatch(.*)*',
      redirect: '/404',
    },
  ],
})

export default router
```

#### 5.4 验证清单

- [ ] 独立运行未登录 → 跳转 `/login` 登录页
- [ ] 独立运行登录后 → 动态路由初始化 → 进入首页
- [ ] 独立运行 Token 超时 → 自动退出 → 跳转登录页
- [ ] **🆕 微前端模式未登录 → 跳转自身 `/login`（不依赖基座跳转）**
- [ ] **🆕 微前端模式基座已登录 → 子应用从 localStorage 读取 token → 正常进入**
- [ ] **🆕 微前端模式路由切换 → 尝试同步到基座（基座不监听也不报错）**
- [ ] 嵌入基座后路由前缀正确

---

### Phase 6: 样式隔离 + 沙箱增强

> **目标**: 子应用样式不泄漏，基座样式不侵入
> **工期**: 1 人天

#### 6.1 micro-app 沙箱模式选择

```html
<!-- 基座注册子应用时（无需改造基座代码，仅需配置） -->
<micro-app
  name="cim"
  url="http://localhost:1989/"
  iframe          <!-- 🆕 使用 iframe 沙箱，彻底隔离 JS 和 DOM -->
  destroy         <!-- 卸载时销毁 DOM，避免内存泄漏 -->
  keep-alive      <!-- 可选：缓存子应用状态 -->
></micro-app>
```

> **💡 关键**: 使用 `iframe` 沙箱模式时，子应用的 `localStorage` 和 `window` 是独立的，**不再与基座共享**。此时需要调整 Token 获取策略——见下方 6.3 节。

#### 6.2 样式隔离方案

```css
/* 子应用根容器添加命名空间 */
#cim-app {
  all: initial; /* 重置所有继承样式 */

  /* 重新声明子应用需要的基础样式 */
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  color: var(--n-text-color, #333);
}
```

```typescript
// main.ts 中设置根容器 ID
app.mount('#app') // 确保子应用挂载在 #cim-app 或 #app 下
```

#### 6.3 iframe 沙箱下的 Token 传递

当使用 `iframe` 沙箱时，子应用的 `localStorage` 与基座隔离，需要通过 micro-app 的数据通信传递 token：

```typescript
// src/utils/micro-app-bridge.ts 新增

/**
 * * @description: 在 iframe 沙箱模式下，从基座获取 token
 * iframe 沙箱下 localStorage 隔离，需要通过 micro-app 数据通信获取
 * ! @return {string} token
 */
export function getTokenInIframeSandbox(): string {
  if (!isMicroApp()) return ''

  // 优先从基座下发数据获取
  const data = getMicroAppData()
  if (data?.token) return data.token

  // 兜底：尝试从基座 URL 参数获取（基座可在 URL 中传递 token）
  const urlParams = new URLSearchParams(window.location.search)
  const tokenFromUrl = urlParams.get('token')
  if (tokenFromUrl) {
    // 存入子应用 localStorage
    localStorage.setItem('token', JSON.stringify(tokenFromUrl))
    return tokenFromUrl
  }

  return ''
}
```

> **⚠️ 建议**: 如果基座未改造，优先使用 **with 沙箱**（micro-app 默认模式），这样子应用可直接读取基座的 localStorage。只有在样式/JS 冲突严重时才切换到 iframe 沙箱。

#### 6.4 沙箱模式对比

| 特性         | with 沙箱（默认）    | iframe 沙箱           |
| ------------ | -------------------- | --------------------- |
| localStorage | 与基座共享 ✅        | 独立隔离 ❌           |
| 样式隔离     | 需手动处理           | 天然隔离 ✅           |
| JS 隔离      | 代理 window          | 完全隔离 ✅           |
| Token 获取   | 直接读 localStorage  | 需数据通信或 URL 传参 |
| 推荐场景     | **基座未改造时首选** | 样式/JS 冲突严重时    |

#### 6.5 验证清单

- [ ] 子应用样式不影响基座
- [ ] 基座样式不侵入子应用
- [ ] Naive UI 组件样式正常渲染
- [ ] 主题切换正常工作
- [ ] **🆕 with 沙箱模式下，子应用可读取基座 localStorage 中的 token**
- [ ] **🆕 iframe 沙箱模式下，token 通过数据通信或 URL 参数传递**

---

## 4. 集成测试

### 4.1 独立运行测试

| 测试项             | 预期结果                                         | 通过 |
| ------------------ | ------------------------------------------------ | ---- |
| `bun run dev` 启动 | 无报错，显示登录页                               | ☐    |
| 登录流程           | 调用 `POST /auth/login`，token 存入 localStorage | ☐    |
| Token 双令牌       | accessToken + refreshToken 均正确存储            | ☐    |
| Token 过期刷新     | 过期前 5 分钟自动刷新，无感续期                  | ☐    |
| 8 小时超时         | 无操作 8 小时后自动退出登录                      | ☐    |
| 菜单加载           | 调用 `GET /auth/menu`，侧边栏正确渲染            | ☐    |
| 动态路由           | 所有菜单可正常跳转                               | ☐    |
| 路由权限           | 无权限页面跳转 401                               | ☐    |
| 退出登录           | 清除认证数据，跳转登录页                         | ☐    |
| `bun run build`    | 构建无报错                                       | ☐    |

### 4.2 微前端嵌入测试（基座未改造）

| 测试项                | 预期结果                                       | 通过 |
| --------------------- | ---------------------------------------------- | ---- |
| 基座加载 CIM          | 子应用正常渲染                                 | ☐    |
| **🆕 基座已登录**     | 子应用从 localStorage 读取 token，不显示登录页 | ☐    |
| **🆕 基座未登录**     | 子应用显示自身登录页，自主登录                 | ☐    |
| **🆕 基座不下发数据** | 子应用自主调用接口获取菜单和用户信息           | ☐    |
| 路由切换              | 子应用内部路由正常工作                         | ☐    |
| Token 过期            | 子应用自主刷新或退出，不依赖基座               | ☐    |
| 切换其他子应用        | CIM 正确 unmount，无残留 DOM                   | ☐    |
| 切回 CIM              | CIM 正确 remount，状态恢复                     | ☐    |

### 4.3 微前端嵌入测试（基座已改造 — 增强验证）

| 测试项            | 预期结果                           | 通过 |
| ----------------- | ---------------------------------- | ---- |
| 基座下发 token    | 子应用优先使用基座 token           | ☐    |
| 基座下发 menuList | 子应用优先使用基座菜单             | ☐    |
| 基座监听事件      | 子应用 dispatch 事件被基座正确处理 | ☐    |
| 基座主题切换      | 子应用跟随基座主题                 | ☐    |

### 4.4 性能测试

| 测试项         | 预期结果                      | 通过 |
| -------------- | ----------------------------- | ---- |
| 首次加载时间   | < 3s（内网环境）              | ☐    |
| 子应用切换时间 | < 500ms                       | ☐    |
| 内存泄漏       | 反复切换 10 次内存增长 < 10MB | ☐    |
| DOM 节点数     | unmount 后 DOM 节点归零       | ☐    |

---

## 5. 风险评估与回滚策略

| 风险                                      | 概率 | 影响 | 缓解措施                                     | 回滚策略                        |
| ----------------------------------------- | ---- | ---- | -------------------------------------------- | ------------------------------- |
| Vite 3→4 升级导致构建失败                 | 中   | 高   | 先在分支验证，逐插件排查                     | 回退 Vite 版本                  |
| micro-app beta→rc API 不兼容              | 低   | 高   | 逐 API 对比 changelog                        | 回退 micro-app 版本             |
| 登录接口与基座不一致                      | 中   | 高   | 与后端确认接口契约，Mock 开发                | 使用 Mock 数据先行开发          |
| 菜单接口数据格式不匹配                    | 中   | 高   | 与基座对齐 DynamicRoute 类型                 | 使用本地 JSON 兜底              |
| **🆕 localStorage key 与基座不一致**      | 中   | 高   | 确认基座 localStorage key 名称               | 子应用独立登录，不依赖共享      |
| **🆕 with 沙箱下 localStorage 不可共享**  | 低   | 高   | 验证 micro-app with 沙箱的 localStorage 行为 | 切换 iframe 沙箱 + URL 传 token |
| **🆕 子应用登录页与基座登录页体验不一致** | 低   | 中   | 复用基座登录页样式                           | 可接受，独立运行场景            |
| Naive UI 升级组件 API 变更                | 中   | 中   | 按组件逐个验证                               | 回退 Naive UI 版本              |
| 样式隔离不彻底                            | 中   | 中   | 逐步排查泄漏点                               | 增加更具体的选择器              |

---

## 6. 工期估算

| 阶段     | 工作内容                | 工期          | 依赖      |
| -------- | ----------------------- | ------------- | --------- |
| Phase 1  | 版本对齐 + Vite 配置    | 1-2 人天      | 无        |
| Phase 2  | 生命周期 + 运行模式感知 | 1 人天        | Phase 1   |
| Phase 3  | Token 自主获取          | 1-2 人天      | Phase 2   |
| Phase 4  | 菜单与动态路由          | 1 人天        | Phase 3   |
| Phase 5  | 路由守卫双模式适配      | 1 人天        | Phase 4   |
| Phase 6  | 样式隔离 + 沙箱增强     | 1 人天        | Phase 1   |
| 集成测试 | 双模式全量验证          | 1-2 人天      | Phase 1-6 |
| **合计** |                         | **7-10 人天** |           |

> 建议按 Phase 顺序执行，每个 Phase 完成后进行阶段性验证。

---

## 附录 A: 双模式运行流程对比

### 独立运行模式

```
用户访问 CIM → 路由守卫检测无 token → 跳转 /login
  → 用户输入账号密码 → POST /auth/login → 获取 token
  → handleLoginSuccess(token, refreshToken, expiresIn)
  → initDynamicRouter() → GET /auth/menu → 注册动态路由
  → router.replace('/home') → 进入首页
  → 后续请求自动注入 Bearer token
  → Token 即将过期 → 自动调用 refreshTokenApi
  → 8 小时无操作 → 自动退出登录
```

### 微前端嵌入模式（基座未改造）

```
基座加载 CIM → mount() → addDataListener(callback)
  → 路由守卫检测 token（从 localStorage 读取，基座已登录则共享）
  → 有 token → initDynamicRouter() → GET /auth/menu（自主调用接口）
  → 注册动态路由 → 正常渲染页面
  → 路由切换 → dispatchToBaseApp({ type: 'pathEvent', path })（尽力而为）
  → Token 过期 → 自主刷新或退出（不依赖基座）
  → 无 token → 跳转自身 /login → 自主登录
```

### 微前端嵌入模式（基座已改造 — 增强体验）

```
基座加载 CIM → mount() → addDataListener(callback)
  → 基座 setData({ token, userInfo, menuList })
  → callback 同步 token/userInfo/menuList 到子应用 Store
  → 路由守卫检测 token（优先从 Store 获取，即基座下发数据）
  → initDynamicRouter() → 从 Store 获取菜单（已由基座下发）
  → 正常渲染页面
  → 路由切换 → dispatchToBaseApp({ type: 'pathEvent', path })（基座监听并处理）
  → Token 过期 → 通知基座处理 + 自主退出
  → 退出 → 通知基座（基座监听并跳转自身登录页）
```

## 附录 B: 基座配合改造（可选增强，非必需）

> ⚠️ 以下改造均为**可选增强**，子应用在基座未改造时已可正常工作。

### B.1 数据下发增强（可选）

若基座愿意配合，可在 `setData` 时增加 `menuList` 和 `refreshToken` 字段：

```typescript
// uam-front: micro-app/index.vue（可选改造）
microApp.setData('cim', {
  token: userStore.token,
  refreshToken: userStore.refreshToken,
  userInfo: userStore.userInfo,
  menuList: permissionStore.authMenuList,
  path: route.path,
})
```

### B.2 子应用事件监听（可选）

若基座愿意配合，可监听子应用派发的事件：

```typescript
// uam-front: 监听子应用事件（可选改造）
window.addEventListener('message', event => {
  if (event.data?.type === 'logout') {
    userStore.logout(event.data.isExpired)
  }
  if (event.data?.type === 'noPermission') {
    router.push('/401')
  }
})
```

### B.3 改造收益对比

| 场景       | 基座不改造                      | 基座改造后             |
| ---------- | ------------------------------- | ---------------------- |
| Token 获取 | localStorage 共享 / 自主登录    | 基座主动下发           |
| 菜单获取   | 自主调用接口 / 本地 JSON 兜底   | 基座主动下发（已过滤） |
| 退出登录   | 子应用自主退出 + 跳转自身登录页 | 基座统一处理退出       |
| 路由同步   | 子应用 dispatch（基座不监听）   | 基座监听并同步标签页   |
| 主题跟随   | 子应用独立主题                  | 基座下发主题配置       |
| 整体体验   | ⭐⭐⭐ 功能完整                 | ⭐⭐⭐⭐⭐ 无缝融合    |

## 附录 C: 原方案 vs 零基座改造版 完整对比

| 维度                  | 原方案（改进版）              | 零基座改造版                  |
| --------------------- | ----------------------------- | ----------------------------- |
| **基座改造量**        | 4 项必须改造                  | 0 项（可选增强 2 项）         |
| **Token 来源**        | 微前端模式依赖基座下发        | localStorage 共享 + 自主登录  |
| **菜单来源**          | 微前端模式依赖基座下发        | 自主调用接口 + 本地 JSON 兜底 |
| **退出登录**          | 微前端模式通知基座处理        | 自主退出 + 尝试通知基座       |
| **路由守卫**          | 微前端模式通知基座跳转        | 统一跳转自身 /login           |
| **dispatchToBaseApp** | 假设基座一定监听              | 尽力而为，静默失败            |
| **main.ts**           | 使用 require()（Vite 不支持） | 使用动态 import()             |
| **菜单过滤**          | 依赖基座 subsystemCode        | 前端按 path 前缀过滤          |
| **兼容性**            | 仅基座改造后可用              | 基座改造前后均可用            |
| **工期**              | 7-10 人天                     | 7-10 人天（相同）             |
