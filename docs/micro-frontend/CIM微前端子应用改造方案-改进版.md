# CIM 微前端子应用改造方案（改进版）

> **基座应用**: UAM (`uam-front`) · **子应用**: CIM (`cim-platform-front`)
> **微前端框架**: @micro-zoe/micro-app
> **编写日期**: 2026-04-28
> **改进重点**: 子应用独立运行 + 登录/菜单接口参考基座

---

## 目录

- [1. 原方案问题分析](#1-原方案问题分析)
- [2. 改造目标](#2-改造目标)
- [3. 改造方案（六阶段）](#3-改造方案六阶段)
  - [Phase 1: 版本对齐](#phase-1-版本对齐)
  - [Phase 2: 生命周期完善](#phase-2-生命周期完善)
  - [Phase 3: 子应用独立运行 — 登录与认证](#phase-3-子应用独立运行--登录与认证)
  - [Phase 4: 子应用独立运行 — 菜单与动态路由](#phase-4-子应用独立运行--菜单与动态路由)
  - [Phase 5: 路由守卫双模式适配](#phase-5-路由守卫双模式适配)
  - [Phase 6: 样式隔离](#phase-6-样式隔离)
- [4. 集成测试](#4-集成测试)
- [5. 风险评估与回滚策略](#5-风险评估与回滚策略)
- [6. 工期估算](#6-工期估算)

---

## 1. 原方案问题分析

原方案存在以下关键缺失：

| #   | 问题                         | 严重度 | 说明                                                                                                                          |
| --- | ---------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------- |
| 1   | **子应用无独立登录能力**     | 🔴 高  | 原方案仅提到"非微前端环境自动登录"兜底，但未设计完整的登录页、登录接口对接、Token 管理流程                                    |
| 2   | **子应用无独立菜单加载能力** | 🔴 高  | 原方案未涉及子应用独立运行时如何获取菜单数据、初始化动态路由                                                                  |
| 3   | **Token 管理缺失**           | 🔴 高  | 原方案路由守卫中仅简单读取 `localStorage.getItem('token')`，未参考基座的完整 Token 生命周期（双 Token、过期刷新、时间戳续期） |
| 4   | **双模式切换不清晰**         | 🟡 中  | 微前端模式 vs 独立运行模式的切换逻辑散落在各处，缺乏统一的运行模式判断和初始化策略                                            |
| 5   | **路由守卫过于简化**         | 🟡 中  | 原方案路由守卫仅处理了 token 判断和微前端通信，未参考基座的完整守卫流程（白名单、动态路由初始化、权限校验等）                 |
| 6   | **用户信息管理缺失**         | 🟡 中  | 微前端模式下从基座获取 userInfo，独立运行时如何获取和存储未说明                                                               |

---

## 2. 改造目标

1. **版本统一**: micro-app、Vite、Naive UI 版本对齐，消除兼容性隐患
2. **生命周期健壮**: mount/unmount 完整清理，避免内存泄漏
3. **🆕 子应用独立登录**: 独立运行时具备完整登录能力，接口与基座一致（`POST /auth/login`）
4. **🆕 子应用独立菜单**: 独立运行时具备菜单加载能力，接口与基座一致（`GET /auth/menu`）
5. **🆕 Token 生命周期管理**: 参考基座的双 Token + 过期刷新 + 时间戳续期机制
6. **路由守卫双模式**: 微前端/独立运行两种模式下的路由守卫完整适配
7. **样式隔离**: 子应用样式不泄漏，基座样式不侵入
8. **类型安全**: 补充 TypeScript 类型声明

---

## 3. 改造方案（六阶段）

### Phase 1: 版本对齐

> **目标**: 消除版本不一致导致的兼容性问题
> **工期**: 1-2 人天

> 与原方案一致，此处不再重复。详见原方案 Phase 1。

---

### Phase 2: 生命周期完善

> **目标**: 健壮的 mount/unmount，避免内存泄漏
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

/** 基座下发的用户信息结构 */
interface BaseUserInfo {
  username?: string
  avatar?: string
  roles?: string[]
  [key: string]: unknown
}

/** 基座下发的菜单项结构（与基座 DynamicRoute 对齐） */
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

/** 基座下发给子应用的数据结构 */
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
 * @Date: 2026-04-28
 * @FilePath: \cim-platform-front\src\main.ts
 * @Description: 应用入口 — 支持独立运行与微前端嵌入双模式
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
} from './utils/micro-app-bridge'

let app: VueApp | null = null

/** 基座数据监听回调 */
const dataListenerCallback = (data: MicroAppData) => {
  console.log('[CIM] Received data from base app:', data)

  // 🆕 同步基座下发的 token 到子应用 Store
  if (data.token) {
    const { s_userStore } = require('@/stores/user')
    const userStore = s_userStore()
    userStore.setToken(data.token)
    if (data.refreshToken) userStore.setRefreshToken(data.refreshToken)
  }

  // 🆕 同步基座下发的用户信息
  if (data.userInfo) {
    const { s_userStore } = require('@/stores/user')
    s_userStore().setUserInfo(data.userInfo as any)
  }

  // 🆕 同步基座下发的菜单数据
  if (data.menuList) {
    const { s_permissionStore } = require('@/stores/permission')
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

  // 微前端环境：监听基座数据，同步初始状态
  if (isMicroApp()) {
    addMicroAppDataListener(dataListenerCallback)

    // 🆕 立即同步基座初始数据
    const initialData = getMicroAppData()
    if (initialData) {
      dataListenerCallback(initialData)
    }
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

### Phase 3: 子应用独立运行 — 登录与认证

> **目标**: 子应用独立运行时具备完整登录能力，接口与基座一致
> **工期**: 1-2 人天

#### 3.1 基座登录接口参考

基座（Robot_Admin）的登录接口定义：

```
POST /auth/login
请求体: { username: string, password: string, captcha?: { token, timestamp, type } }
响应体: { code: '0', data: { token: string, [key: string]: unknown }, msg: string }
```

基座 Token 管理机制：

| 机制     | 说明                                               |
| -------- | -------------------------------------------------- |
| 双 Token | `token`（访问令牌）+ `refresh_token`（刷新令牌）   |
| 过期时间 | `token_expires_in`（存储绝对过期时间戳）           |
| 活跃续期 | 每次请求成功后更新 `timeStamp`，8 小时无操作则过期 |
| 无感刷新 | 过期前 5 分钟自动调用 `refreshTokenApi`            |
| 请求注入 | 拦截器自动添加 `Authorization: Bearer <token>`     |

#### 3.2 子应用 API 层 — 参考基座

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

#### 3.3 常量定义 — 参考基座

新建 `src/constant/index.ts`:

```typescript
/*
 * @Author: ChenYu ycyplus@gmail.com
 * @Date: 2026-04-28
 * @FilePath: \cim-platform-front\src\constant\index.ts
 * @Description: 常量定义 — 与基座对齐
 * Copyright (c) 2026 by CHENY, All Rights Reserved 😎.
 */

// * Token 相关（与基座 key 一致，确保微前端模式下 localStorage 共享）
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

#### 3.4 用户 Store — 参考基座

新建 `src/stores/user/index.ts`:

```typescript
/*
 * @Author: ChenYu ycyplus@gmail.com
 * @Date: 2026-04-28
 * @FilePath: \cim-platform-front\src\stores\user\index.ts
 * @Description: 用户状态管理 — 参考基座，支持微前端/独立运行双模式
 * Copyright (c) 2026 by CHENY, All Rights Reserved 😎.
 */

import { defineStore } from 'pinia'
import { TOKEN, REFRESH_TOKEN, TIME_STAMP, TOKEN_EXPIRES_IN } from '@/constant'
import {
  isMicroApp,
  getMicroAppData,
  dispatchToBaseApp,
} from '@/utils/micro-app-bridge'
import router from '@/router'
import { d_setTimeStamp } from '@/utils/d_auth'

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
     * * @description: 登录成功处理（参考基座 handleLoginSuccess）
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
     * * @description: 退出登录
     * ? @param {boolean} isExpired 是否因 Token 过期退出
     */
    async logout(isExpired = false) {
      try {
        // 微前端模式：通知基座退出
        if (isMicroApp()) {
          dispatchToBaseApp({ type: 'logout', isExpired })
          return
        }

        // 独立运行模式：自行处理退出
        this.token = ''
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

        // 跳转登录页
        router.replace('/login')
      } catch (error) {
        console.error('退出登录失败:', error)
        router.replace('/login')
      }
    },
  },
})
```

#### 3.5 认证工具函数 — 参考基座

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

#### 3.6 登录页

新建 `src/views/login/index.vue`:

```vue
<!--
 * @Author: ChenYu ycyplus@gmail.com
 * @Date: 2026-04-28
 * @FilePath: \cim-platform-front\src\views\login\index.vue
 * @Description: CIM 子应用登录页 — 独立运行时使用
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
  import { loginApi, type LoginResponse } from '@/api/auth'
  import { s_userStore } from '@/stores/user'
  import { initDynamicRouter } from '@/router/dynamicRouter'
  import { useMessage } from 'naive-ui'

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
        // 参考基座：存储 token + refreshToken + expiresIn
        userStore.handleLoginSuccess(
          response.data.token,
          response.data.refreshToken,
          response.data.expiresIn
        )
        userStore.setUserInfo({ username: formData.username })

        // 参考基座：初始化动态路由
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

#### 3.7 请求拦截器 — Token 注入与刷新

在请求核心层添加拦截器（参考基座机制）：

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
import { isMicroApp, getMicroAppData } from '@/utils/micro-app-bridge'

/** 是否正在刷新 Token */
let isRefreshing = false
/** 等待 Token 刷新的请求队列 */
let pendingRequests: Array<(token: string) => void> = []

/** 获取当前 Token（微前端模式从基座获取，独立运行从 Store 获取） */
export function getCurrentToken(): string {
  if (isMicroApp()) {
    return getMicroAppData()?.token || ''
  }
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

#### 3.8 验证清单

- [ ] 独立运行 `bun run dev` → 显示登录页
- [ ] 输入账号密码 → 调用 `POST /auth/login` → 获取 token
- [ ] Token 存入 localStorage（key 与基座一致）
- [ ] 登录成功 → 初始化动态路由 → 跳转首页
- [ ] Token 过期 → 无感刷新正常工作
- [ ] 8 小时无操作 → 自动退出登录
- [ ] 微前端模式 → 从基座获取 token，不显示登录页

---

### Phase 4: 子应用独立运行 — 菜单与动态路由

> **目标**: 子应用独立运行时具备菜单加载能力，接口与基座一致
> **工期**: 1 人天

#### 4.1 基座菜单接口参考

基座（Robot_Admin）的菜单加载流程：

```
登录成功 → initDynamicRouter()
  → permissionStore.getAuthMenuList()
    → getAuthMenuListApi()  // 当前为 Mock（读取 dynamicRouter.json）
    → 后续对接: GET /auth/menu
  → router.addRoute(processRoute(route))  // 动态注册路由
  → router.replace('/home')
```

基座 `DynamicRoute` 类型：

```typescript
interface DynamicRoute {
  path: string
  name?: string
  component?: string // 组件路径字符串，如 '/demo/55-new-feature/index'
  redirect?: string
  meta?: {
    title?: string
    icon?: string
    hidden?: boolean
    affix?: boolean
    keepAlive?: boolean
    full?: boolean
    link?: string
  }
  children?: DynamicRoute[]
}
```

#### 4.2 权限 Store — 双模式菜单加载

新建 `src/stores/permission/index.ts`:

```typescript
/*
 * @Author: ChenYu ycyplus@gmail.com
 * @Date: 2026-04-28
 * @FilePath: \cim-platform-front\src\stores\permission\index.ts
 * @Description: 权限 Store — 支持微前端/独立运行双模式菜单加载
 * Copyright (c) 2026 by CHENY, All Rights Reserved 😎.
 */

import { defineStore } from 'pinia'
import { getAuthMenuListApi } from '@/api/auth'
import { isMicroApp, getMicroAppData } from '@/utils/micro-app-bridge'
import type { DynamicRoute } from '@/router/dynamicRouter'

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
     * * @description: 获取菜单列表（双模式适配）
     * - 微前端模式：从基座下发的数据中获取
     * - 独立运行模式：调用后端接口 GET /auth/menu
     * ! @return {Promise<any>} 菜单列表响应
     */
    async getAuthMenuList() {
      try {
        // 🆕 微前端模式：优先从基座数据获取菜单
        if (isMicroApp()) {
          const microData = getMicroAppData()
          if (microData?.menuList?.length) {
            this.authMenuList = microData.menuList as DynamicRoute[]
            this.flatRoutePaths = [...this._buildFlatPaths(this.authMenuList)]
            return { code: '0', data: this.authMenuList, msg: 'success' }
          }
        }

        // 独立运行模式：调用后端接口（与基座接口一致）
        const res = await getAuthMenuListApi()
        this.authMenuList = res.data
        this.flatRoutePaths = [...this._buildFlatPaths(res.data)]
        return res
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
      this.authMenuList = menuList
      this.flatRoutePaths = [...this._buildFlatPaths(menuList)]
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

#### 4.3 动态路由初始化 — 参考基座

新建 `src/router/dynamicRouter.ts`:

```typescript
/*
 * @Author: ChenYu ycyplus@gmail.com
 * @Date: 2026-04-28
 * @FilePath: \cim-platform-front\src\router\dynamicRouter.ts
 * @Description: 动态路由初始化 — 参考基座，支持双模式
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
 * * @description: 初始化动态路由（参考基座流程）
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
- [ ] 微前端模式 → 从基座下发数据获取菜单，不调用后端接口
- [ ] 基座菜单更新 → 子应用实时同步

---

### Phase 5: 路由守卫双模式适配

> **目标**: 路由守卫在微前端/独立运行两种模式下均可正常工作
> **工期**: 1 人天

#### 5.1 路由守卫 — 参考基座完整流程

新建 `src/router/permission.ts`:

```typescript
/*
 * @Author: ChenYu ycyplus@gmail.com
 * @Date: 2026-04-28
 * @FilePath: \cim-platform-front\src\router\permission.ts
 * @Description: 路由权限控制 — 参考基座，支持微前端/独立运行双模式
 * Copyright (c) 2026 by CHENY, All Rights Reserved 😎.
 */

import router from '@/router'
import { s_userStore } from '@/stores/user'
import { s_permissionStore } from '@/stores/permission'
import { initDynamicRouter, type DynamicRoute } from '@/router/dynamicRouter'
import {
  isMicroApp,
  getMicroAppData,
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
 * * @description: 获取当前 Token（双模式适配）
 * ! @return {string} 当前 token
 */
function getCurrentToken(): string {
  if (isMicroApp()) {
    return getMicroAppData()?.token || ''
  }
  return s_userStore().token
}

/**
 * * @description: 设置页面标题
 */
function setPageTitle(title?: string): void {
  document.title = title ? `${title} | ${DEFAULT_TITLE}` : DEFAULT_TITLE
}

/**
 * * @description: 处理未登录场景（双模式适配）
 */
function handleUnauthenticated(to: any): string | boolean {
  // 微前端模式：通知基座跳转登录
  if (isMicroApp()) {
    dispatchToBaseApp({ type: 'navigate', path: '/login' })
    return false
  }
  // 独立运行模式：跳转自身登录页
  if (WHITE_LIST.includes(to.path)) return true
  return LOGIN_PATH
}

/**
 * * @description: 处理已登录访问登录页
 */
function handleLoginPageRedirect(): string {
  if (isMicroApp()) {
    // 微前端模式下不应访问子应用登录页，重定向到首页
    return '/home'
  }
  return '/home'
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

    // 微前端模式：通知基座处理错误
    if (isMicroApp()) {
      dispatchToBaseApp({ type: 'routeError', error: String(error) })
      return '/404'
    }

    // 独立运行模式：重置状态并跳转登录
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
    const token = getCurrentToken()
    const { authMenuList } = s_permissionStore()
    const meta = to.meta as { title?: string; [key: string]: any }

    // 1. 未登录处理
    if (!token) {
      return handleUnauthenticated(to)
    }

    // 🆕 2. Token 超时检查（与基座一致：8小时无操作）
    if (!isMicroApp() && d_isCheckTimeout()) {
      s_userStore().logout(true)
      return LOGIN_PATH
    }

    // 3. 已登录但访问登录页
    if (to.path === LOGIN_PATH) {
      return handleLoginPageRedirect()
    }

    // 4. 动态路由初始化
    if (!authMenuList.length && !isInitializing) {
      const result = await handleDynamicRouterInit(to.fullPath)
      if (result !== to.fullPath) return result
      return to.fullPath
    }

    // 5. 路由权限校验
    if (!checkRoutePermission(to)) {
      // 微前端模式：通知基座
      if (isMicroApp()) {
        dispatchToBaseApp({ type: 'noPermission', path: to.path })
      }
      return '/401'
    }

    // 6. 微前端模式：同步路由到基座
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
    if (isMicroApp()) {
      dispatchToBaseApp({ type: 'routeError', error: String(error) })
      return false
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

#### 5.2 路由配置

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

#### 5.3 验证清单

- [ ] 独立运行未登录 → 跳转 `/login` 登录页
- [ ] 独立运行登录后 → 动态路由初始化 → 进入首页
- [ ] 独立运行 Token 超时 → 自动退出 → 跳转登录页
- [ ] 微前端模式未登录 → 通知基座跳转登录
- [ ] 微前端模式路由切换 → 同步到基座标签页
- [ ] 微前端模式无权限 → 通知基座
- [ ] 嵌入基座后路由前缀正确

---

### Phase 6: 样式隔离

> 与原方案 Phase 4 一致，此处不再重复。

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

### 4.2 微前端嵌入测试

| 测试项          | 预期结果                           | 通过 |
| --------------- | ---------------------------------- | ---- |
| 基座加载 CIM    | 子应用正常渲染，不显示登录页       | ☐    |
| 基座 token 下发 | 子应用正确接收并使用 token         | ☐    |
| 基座菜单下发    | 子应用使用基座菜单，不调用后端接口 | ☐    |
| 基座路由同步    | 子应用路由变化同步到基座标签页     | ☐    |
| 基座主题切换    | 子应用跟随基座主题                 | ☐    |
| Token 过期      | 通知基座处理，不自行跳转登录页     | ☐    |
| 切换其他子应用  | CIM 正确 unmount，无残留 DOM       | ☐    |
| 切回 CIM        | CIM 正确 remount，状态恢复         | ☐    |

### 4.3 性能测试

| 测试项         | 预期结果                      | 通过 |
| -------------- | ----------------------------- | ---- |
| 首次加载时间   | < 3s（内网环境）              | ☐    |
| 子应用切换时间 | < 500ms                       | ☐    |
| 内存泄漏       | 反复切换 10 次内存增长 < 10MB | ☐    |
| DOM 节点数     | unmount 后 DOM 节点归零       | ☐    |

---

## 5. 风险评估与回滚策略

| 风险                         | 概率 | 影响 | 缓解措施                         | 回滚策略               |
| ---------------------------- | ---- | ---- | -------------------------------- | ---------------------- |
| Vite 3→4 升级导致构建失败    | 中   | 高   | 先在分支验证，逐插件排查         | 回退 Vite 版本         |
| micro-app beta→rc API 不兼容 | 低   | 高   | 逐 API 对比 changelog            | 回退 micro-app 版本    |
| 🆕 登录接口与基座不一致      | 中   | 高   | 与后端确认接口契约，Mock 开发    | 使用 Mock 数据先行开发 |
| 🆕 菜单接口数据格式不匹配    | 中   | 高   | 与基座对齐 DynamicRoute 类型     | 使用本地 JSON 兜底     |
| 🆕 Token 刷新机制与基座冲突  | 低   | 高   | 微前端模式下由基座统一管理 Token | 禁用子应用 Token 刷新  |
| Naive UI 升级组件 API 变更   | 中   | 中   | 按组件逐个验证                   | 回退 Naive UI 版本     |
| 样式隔离不彻底               | 中   | 中   | 逐步排查泄漏点                   | 增加更具体的选择器     |

---

## 6. 工期估算

| 阶段       | 工作内容           | 工期          | 依赖      |
| ---------- | ------------------ | ------------- | --------- |
| Phase 1    | 版本对齐           | 1-2 人天      | 无        |
| Phase 2    | 生命周期完善       | 1 人天        | Phase 1   |
| 🆕 Phase 3 | 独立登录与认证     | 1-2 人天      | Phase 2   |
| 🆕 Phase 4 | 独立菜单与动态路由 | 1 人天        | Phase 3   |
| 🆕 Phase 5 | 路由守卫双模式适配 | 1 人天        | Phase 4   |
| Phase 6    | 样式隔离           | 1 人天        | Phase 1   |
| 集成测试   | 双模式全量验证     | 1-2 人天      | Phase 1-6 |
| **合计**   |                    | **7-10 人天** |           |

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

### 微前端嵌入模式

```
基座加载 CIM → mount() → addDataListener(callback)
  → 基座 setData({ token, userInfo, menuList, path })
  → callback 同步 token/userInfo/menuList 到子应用 Store
  → 路由守卫检测 token（从 getMicroAppData() 获取）
  → initDynamicRouter() → 从 Store 获取菜单（已由基座下发）
  → 正常渲染页面
  → 路由切换 → dispatchToBaseApp({ type: 'pathEvent', path })
  → Token 过期 → 通知基座处理（不自行刷新）
  → 退出 → 通知基座（不自行跳转登录页）
```

## 附录 B: 基座需配合的改造

为了让子应用完整支持双模式，基座（UAM）需配合以下改造：

### B.1 数据下发增强

基座在 `setData` 时需增加 `menuList` 和 `refreshToken` 字段：

```typescript
// uam-front: micro-app/index.vue
microApp.setData('cim', {
  token: userStore.token,
  refreshToken: userStore.refreshToken, // 🆕 下发 refreshToken
  userInfo: userStore.userInfo,
  menuList: permissionStore.authMenuList, // 🆕 下发菜单数据
  path: route.path,
})
```

### B.2 子应用菜单数据过滤

基座应只下发属于 CIM 子应用的菜单（通过 `subsystemCode` 过滤）：

```typescript
// 仅下发 CIM 子系统的菜单
const cimMenuList = permissionStore.authMenuList.filter(
  menu => menu.meta?.subsystemCode === 'cim'
)
microApp.setData('cim', {
  // ...
  menuList: cimMenuList,
})
```

### B.3 子应用事件监听

基座需监听子应用派发的事件：

```typescript
// uam-front: 监听子应用事件
microApp.setData('cim', {
  /* ... */
})

// 处理子应用派发的事件
window.addEventListener('message', event => {
  if (event.data?.type === 'logout') {
    userStore.logout(event.data.isExpired)
  }
  if (event.data?.type === 'noPermission') {
    router.push('/401')
  }
  if (event.data?.type === 'routeError') {
    console.error('CIM 路由错误:', event.data.error)
  }
})
```
