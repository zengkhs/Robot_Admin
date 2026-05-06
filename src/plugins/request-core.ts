/*
 * @Author: ChenYu ycyplus@gmail.com
 * @Date: 2026-02-08 10:00:00
 * @LastEditors: ChenYu ycyplus@gmail.com
 * @LastEditTime: 2026-04-29
 * @FilePath: \Robot_Admin\src\plugins\request-core.ts
 * @Description: Request Core 插件 - 统一请求核心库集成
 *               对齐 CIM 后端认证体系：Token AES 加密注入 + service-route-id 请求头
 * Copyright (c) 2026 by CHENY, All Rights Reserved 😎.
 */

import type { App } from 'vue'
import type { InternalAxiosRequestConfig } from 'axios'
import { createRequestCore, onReLoginSuccess } from '@robot-admin/request-core'
import { s_userStore } from '@/stores/user'
import { s_reLoginStore } from '@/stores/reLogin'
import { buildAuthorizedHeaders } from '@/utils/d_crypto'
import { SERVICE_ROUTE_ID } from '@/constant'
import { message } from '@/plugins/discrete'
const { VITE_API_BASE } = import.meta.env

/** Token 刷新状态管理（防止并发刷新） */
// TODO: CIM 后端暂无 refresh token 接口，待后端提供后启用以下变量
// let isRefreshing = false
// let pendingRequests: Array<{
//   resolve: (token: string) => void
//   reject: (error: Error) => void
// }> = []

/**
 * * @description: 执行 Token 刷新（并发安全）
 * ! @return {Promise<string>} 新的 access token
 */
// TODO: CIM 后端暂无 refresh token 接口，待后端提供后启用此函数
// async function doRefreshToken(): Promise<string> {
//   if (isRefreshing) {
//     return new Promise((resolve, reject) => {
//       pendingRequests.push({ resolve, reject })
//     })
//   }
//
//   isRefreshing = true
//   const userStore = s_userStore()
//
//   try {
//     // CIM 后端暂无 refresh token 接口，直接使用现有 token
//     // 如果后续后端提供 refresh 接口，在此处对接
//     const token = userStore.token
//     pendingRequests.forEach(({ resolve }) => resolve(token))
//     return token
//   } catch (error) {
//     pendingRequests.forEach(({ reject }) =>
//       reject(error instanceof Error ? error : new Error('刷新 Token 失败'))
//     )
//     throw error
//   } finally {
//     isRefreshing = false
//     pendingRequests = []
//   }
// }

/**
 * * @description: 构建请求 URL 路径（用于 Token AES 加密）
 * ? @param {InternalAxiosRequestConfig} config axios 请求配置
 * ! @return {string} 完整 URL 路径
 */
function buildRequestUrl(config: InternalAxiosRequestConfig): string {
  const baseURL = config.baseURL || ''
  const url = config.url || ''
  if (url.startsWith('http')) return url
  return `${baseURL}${url}`
}

/**
 * 设置 Request Core 插件
 *
 * @description
 * 初始化统一请求核心库，配置 axios 拦截器和插件体系
 * - Token 注入使用 AES 加密（与 CIM 后端一致）
 * - 请求头携带 cloudna-service-route-id
 */
export function setupRequestCore(app: App) {
  const requestCore = createRequestCore({
    // Axios 基础配置
    request: {
      baseURL: VITE_API_BASE || '',
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
        // 注入 cloudna-service-route-id 请求头（与 cim-micro-lite 一致）
        ...(SERVICE_ROUTE_ID
          ? { 'cloudna-service-route-id': SERVICE_ROUTE_ID }
          : {}),
      },
    },

    // 拦截器配置
    interceptors: {
      // ==================== 请求拦截器 ====================
      request: async (config: InternalAxiosRequestConfig) => {
        const userStore = s_userStore()
        const { token } = userStore

        // 注入加密 Token（AES 加密后注入 Authorization 头）
        if (token) {
          const requestUrl = buildRequestUrl(config)
          const authHeaders = buildAuthorizedHeaders(token, requestUrl)
          Object.assign(config.headers!, authHeaders)
        }

        return config
      },

      // ==================== 响应拦截器 ====================
      response: response => {
        const { code, message: msg, errorMessage } = response.data

        // 业务码判断（CIM 后端成功码为 0 或 '0'）
        const isSuccess =
          code === 200 || code === 0 || code === '200' || code === '0'

        if (!isSuccess) {
          const errMsg = errorMessage || msg || '请求失败'
          message.error(errMsg)
          return Promise.reject(new Error(errMsg))
        }

        return response
      },

      // ==================== 响应错误拦截器 ====================
      responseError: async error => {
        // 处理 401 未授权
        if (error.response?.status === 401) {
          const userStore = s_userStore()

          // 显示重新登录弹窗
          const reLoginStore = s_reLoginStore()
          reLoginStore.show(userStore.userInfo?.username || '')

          try {
            await new Promise<void>((resolve, reject) => {
              const unwatch = watch(
                () => reLoginStore.visible,
                visible => {
                  if (!visible) {
                    unwatch()
                    const userStore = s_userStore()
                    if (userStore.token) {
                      onReLoginSuccess()
                      resolve()
                    } else {
                      reject(new Error('重新登录失败'))
                    }
                  }
                }
              )
            })
          } catch (err) {
            message.error('重新登录失败，请重新登录')
            return Promise.reject(err)
          }
        }

        // 其他错误处理
        const errorMessage =
          error.response?.data?.errorMessage ||
          error.response?.data?.message ||
          error.message ||
          '请求失败'
        message.error(errorMessage)

        return Promise.reject(error)
      },
    },
  })

  // 注册 Vue 插件（使用类型断言绕过 Vue 版本差异）
  ;(requestCore as any).install(app)
}
