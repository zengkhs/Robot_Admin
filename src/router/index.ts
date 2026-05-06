/*
 * @Author: ChenYu ycyplus@gmail.com
 * @Date: 2025-03-30 17:45:29
 * @LastEditors: ChenYu ycyplus@gmail.com
 * @LastEditTime: 2026-04-28
 * @FilePath: \Robot_Admin\src\router\index.ts
 * @Description: 路由入口文件 — 支持微前端/独立运行双模式
 * Copyright (c) 2025 by CHENY, All Rights Reserved 😎.
 */

import { createRouter, createWebHistory } from 'vue-router'
import { isMicroApp, getMicroAppBaseRoute } from '@/utils/micro-app-bridge'
import routes from './publicRouter'
import './permission'

/**
 * @description 动态路由参数配置简介
 * @param path ==> 菜单路径
 * @param name ==> 菜单别名
 * @param redirect ==> 重定向地址
 * @param component ==> 视图文件路径
 * @param meta ==> 菜单信息
 * @param meta.icon ==> 菜单图标
 * @param meta.title ==> 菜单标题
 * @param meta.link ==> 是否外链
 * @param meta.hidden ==> 是否隐藏
 * @param meta.full ==> 是否全屏(示例：用来隔离数据大屏页面)
 * @param meta.keepAlive ==> 是否缓存
 * */

/**
 * * @description: 获取路由 history 基础路径
 * 🆕 微前端模式下使用 __MICRO_APP_BASE_ROUTE__ 作为基础路径
 * 独立运行模式下使用默认 BASE_URL
 * ! @return {string} 基础路径
 */
function getBasePath(): string {
  if (isMicroApp()) {
    return getMicroAppBaseRoute() || import.meta.env.BASE_URL
  }
  return import.meta.env.BASE_URL
}

const router = createRouter({
  routes,
  history: createWebHistory(getBasePath()),
  strict: false,
  scrollBehavior: () => ({ left: 0, top: 0 }),
})
export default router
