/*
 * @Author: ChenYu ycyplus@gmail.com
 * @Date: 2025-05-23 15:09:59
 * @LastEditors: ChenYu ycyplus@gmail.com
 * @LastEditTime: 2026-04-29
 * @FilePath: \Robot_Admin\src\stores\user\index.ts
 * @Description: 用户状态管理 — 零基座依赖，支持微前端/独立运行双模式
 *               对齐 CIM 后端认证：SessionSnapshot 模式、ACCESS-TOKEN key
 * Copyright (c) 2026 by CHENY, All Rights Reserved 😎.
 */
import { defineStore } from 'pinia'
import {
  TOKEN,
  TIME_STAMP,
  REFRESH_TOKEN,
  TOKEN_EXPIRES_IN,
  CURRENT_USER,
} from '@/constant'
import router from '@/router'
import { d_setTimeStamp } from '@/utils/d_auth'
import { notification } from '@/plugins/discrete'
import { isMicroApp, dispatchToBaseApp } from '@/utils/micro-app-bridge'
import type { SessionSnapshot, TenantContext } from '@/api/auth'

interface UserInfo {
  username?: string
  avatar?: string
  tenantId?: string
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
    /** 租户上下文（CIM 登录需要） */
    tenant: readStorage<TenantContext | null>('TENANT_CONTEXT', null),
    /** 用户权限列表 */
    permissions: readStorage<Array<{ label: string; value: string }>>(
      'USER_PERMISSIONS',
      []
    ),
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

    /** 判断 token 是否即将过期（提前 5 分钟） */
    isTokenExpiringSoon(): boolean {
      if (!this.tokenExpiresAt) return false
      return Date.now() > this.tokenExpiresAt - 5 * 60 * 1000
    },

    setUserInfo(userInfo: UserInfo) {
      this.userInfo = userInfo
      localStorage.setItem('userInfo', JSON.stringify(userInfo))
    },

    setTenantContext(tenant: TenantContext) {
      this.tenant = tenant
      localStorage.setItem('TENANT_CONTEXT', JSON.stringify(tenant))
    },

    setPermissions(permissions: Array<{ label: string; value: string }>) {
      this.permissions = permissions
      localStorage.setItem('USER_PERMISSIONS', JSON.stringify(permissions))
    },

    /**
     * * @description: 应用会话快照（登录成功后调用）
     * ? @param {SessionSnapshot} session 登录返回的会话快照
     */
    applySession(session: SessionSnapshot) {
      this.setToken(session.token)
      this.setRefreshToken(session.refreshToken)
      this.tokenExpiresAt = session.expiresAt
      localStorage.setItem(TOKEN_EXPIRES_IN, JSON.stringify(session.expiresAt))

      this.setUserInfo({
        username: session.username,
        avatar: session.avatar,
        tenantId: session.userInfo?.tenantId,
        ...session.userInfo,
      })

      this.setPermissions(session.permissions)

      // 保存 currentUser 到 localStorage（与基座一致）
      localStorage.setItem(CURRENT_USER, JSON.stringify(session.currentUser))

      d_setTimeStamp()
    },

    /**
     * * @description: 登录成功处理（兼容旧调用方式）
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

    handleLoginError(error: unknown) {
      notification.error({
        content: `登录失败: ${error instanceof Error ? error.message : String(error) || '检查错误'}`,
        duration: 3000,
      })
    },

    /**
     * * @description: 退出登录（零基座依赖版）
     * ? @param {boolean} isExpired 是否因 Token 过期退出
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
        this.tenant = null
        this.permissions = []

        // 重置页面标题
        document.title = import.meta.env.VITE_APP_TITLE || 'Robot Admin'

        // 清除认证相关数据（保留用户配置如主题、语言等）
        localStorage.removeItem(TOKEN)
        localStorage.removeItem(REFRESH_TOKEN)
        localStorage.removeItem(TOKEN_EXPIRES_IN)
        localStorage.removeItem(TIME_STAMP)
        localStorage.removeItem('userInfo')
        localStorage.removeItem(CURRENT_USER)
        localStorage.removeItem('TENANT_CONTEXT')
        localStorage.removeItem('USER_PERMISSIONS')
        localStorage.removeItem('__tags_view_list__')

        // 清理动态路由
        const { clearExistingRoutes } = await import('@/router/dynamicRouter')
        clearExistingRoutes()

        // 跳转登录页
        router.replace('/login')

        if (isExpired) {
          notification.warning({
            content: '登录已过期，请重新登录',
            duration: 2500,
          })
        } else {
          notification.success({
            content: '已退出登录',
            duration: 2000,
          })
        }
      } catch (error) {
        console.error('退出登录失败:', error)
        router.replace('/login')
      }
    },
  },
})
