/*
 * @Author: ChenYu ycyplus@gmail.com
 * @Date: 2025-06-17 15:47:12
 * @LastEditors: ChenYu ycyplus@gmail.com
 * @LastEditTime: 2025-11-04 14:00:40
 * @FilePath: \Robot_Admin\src\config\vite\viteServerConfig.ts
 * @Description: Vite 开发服务器配置
 * Copyright (c) 2025 by CHENY, All Rights Reserved 😎.
 */

import { HEAVY_PAGE_ROUTES } from './heavyPages'

export default {
  port: 1988,
  hmr: { overlay: true },
  open: true,

  // 🚫 忽略 lang 目录的文件变化，避免自动刷新页面
  watch: {
    ignored: ['**/lang/**', '**/node_modules/**'],
  },

  // 允许访问外部包目录（@robot-admin/layout）
  fs: {
    allow: ['..'],
  },

  // 🆕 微前端支持：允许跨域，基座通过 fetch 加载子应用
  cors: true,

  // 🆕 微前端支持：静态资源路径前缀（开发环境必须设置，否则基座加载子应用资源 404）
  origin: process.env.VITE_MICRO_APP_ORIGIN || 'http://localhost:1988',

  // ⚡ 预热高频文件（开发环境优化 - 首次访问更快）
  // 经测试：不影响启动速度（6s → 6s），但能加快首次访问 50-70%
  warmup: {
    clientFiles: [
      // 核心文件
      './src/App.vue',
      './src/router/index.ts',

      // 重量级页面（自动映射 HEAVY_PAGE_ROUTES，会自动预热它们的依赖组件）
      ...HEAVY_PAGE_ROUTES.map(route => `./src/views${route}/index.vue`),
    ],
  },

  proxy: {
    '^/api': {
      target: 'http://192.168.28.177:30650', // CIM 后端服务
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/api/, ''),
    },
  },
}
