/*
 * @Author: ChenYu ycyplus@gmail.com
 * @Date: 2026-04-28
 * @FilePath: \Robot_Admin\src\utils\micro-app-bridge.ts
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
