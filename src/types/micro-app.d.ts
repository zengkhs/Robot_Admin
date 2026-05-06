/*
 * @Author: ChenYu ycyplus@gmail.com
 * @Date: 2026-04-28
 * @FilePath: \Robot_Admin\src\types\micro-app.d.ts
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
