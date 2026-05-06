/*
 * @Author: ChenYu ycyplus@gmail.com
 * @Date: 2025-03-30 17:45:29
 * @LastEditors: ChenYu ycyplus@gmail.com
 * @LastEditTime: 2026-04-28
 * @FilePath: \Robot_Admin\src\main.ts
 * @Description: 应用入口 — 支持独立运行与微前端嵌入双模式（零基座改造版）
 * Copyright (c) 2025 by CHENY, All Rights Reserved 😎.
 */

import '../lang/index.js'
import './utils/plugins/i18n-route.ts' // 🌐 扩展路由翻译

// 键：首屏加载动画必须最先执行，确保极速显示
import { setupLoading } from '@/plugins/loading'

import './assets/css/main.css'
import '@/styles/index.scss'
import '@robot-admin/layout/style' // 布局包完整样式（组件 + 布局）
import '@robot-admin/naive-ui-components/style.css' // 📦 组件库样式
// 🔮 设计风格 CSS（通过 data-design-style 属性自动隔离，互不冲突）
import '@robot-admin/theme/styles/glass-morphism.css'
import '@robot-admin/theme/styles/corporate-minimal.css'
import '@robot-admin/theme/styles/dark-tech.css'
import 'virtual:uno.css'
import '@/router/permission'
import App from './App.vue'
import router from './router'
import { setupDirectives } from '@robot-admin/directives' // 👈 直接从包导入
import {
  setupStore,
  setupNaiveUI,
  setupDynamicComponents,
  PassiveScrollPlugin,
  setupHighlight,
  setupMarkdown,
  setupAnalytics,
  setupRequestCore, //  Request Core 插件
  setupLayoutSystem, // 🆕 布局系统插件
  setupFileUtils, // 🆕 文件处理工具包
} from '@/plugins'
import { setupGlobalErrorHandler } from '@/utils/errorHandler'
import {
  isMicroApp,
  getRunMode,
  addMicroAppDataListener,
  removeMicroAppDataListener,
  getMicroAppData,
  hasBaseAppData,
} from '@/utils/micro-app-bridge'

import type { App as VueApp } from 'vue'

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
    s_permissionStore().setAuthMenuListFromBase(data.menuList as any)
  }
}

/**
 * * @description: 应用启动入口（独立运行 & 微前端共用）
 * ! @return {Promise<void>}
 */
async function bootstrap() {
  if (app) return

  // 第零阶段：立即显示加载动画（innerHTML 方式，极速）
  setupLoading()

  // 第一阶段：创建Vue实例
  app = createApp(App)

  // 关键：全局错误处理必须最先设置，确保捕获所有错误
  setupGlobalErrorHandler(app)

  // 使用去除滚动警告的插件
  app.use(PassiveScrollPlugin)

  // ✅ C_ 组件由 RobotNaiveUiResolver 按需自动解析，无需全局注册

  // 使用路由
  app.use(router)

  // 第二阶段：Vue相关插件（使用统一的插件化配置）
  setupStore(app) // 配置 Pinia（包含持久化插件）
  setupRequestCore(app) // 配置 Request Core（axios + 7 个插件 + CRUD）
  setupLayoutSystem(app) // 🆕 配置布局系统（设置管理 + 主题同步）
  setupNaiveUI(app)
  setupDynamicComponents(app)
  setupHighlight(app)
  setupMarkdown(app) // 🔄 已改为异步懒加载，不阻塞启动
  setupDirectives(app)
  setupFileUtils() // 初始化 file-utils（注入 naive-ui 消息系统）
  setupAnalytics(app)

  // 🆕 微前端环境：注册数据监听（可选增强）
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
      hasBaseAppData() ? 'available' : 'not available, will self-initialize',
      ')'
    )
  }

  // 第三阶段：等待路由就绪
  await router.isReady()

  // 第四阶段：挂载应用
  app.mount('#app')

  console.log(`[CIM] App mounted in ${getRunMode()} mode`)
}

/** 卸载应用 */
function unmount() {
  if (!app) return

  // 🆕 微前端环境：清理数据监听
  if (isMicroApp()) {
    removeMicroAppDataListener(dataListenerCallback)
  }

  app.unmount()
  app = null
  console.log('[CIM] App unmounted')
}

// 独立运行时直接挂载
if (!isMicroApp()) {
  bootstrap().catch(error => console.error('应用启动失败:', error))
}

// 🆕 暴露微前端生命周期
window.mount = bootstrap
window.unmount = unmount
