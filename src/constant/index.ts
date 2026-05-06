/*
 * @Author: ChenYu
 * @Date: 2022-04-06 01:23:50
 * @LastEditors: ChenYu ycyplus@gmail.com
 * @LastEditTime: 2026-04-29
 * @FilePath: \Robot_Admin\src\constant\index.ts
 * @Description: 常量文件夹 — Token key 与基座 UAM / cim-micro-lite 对齐
 * Copyright (c) ${2022} by ChenYu/天智AgileTeam, All Rights Reserved.
 */

// * Token 存储 key（与基座 UAM / cim-micro-lite 一致，大写格式）
export const TOKEN: string = 'ACCESS-TOKEN'

// * refresh token（与基座一致）
export const REFRESH_TOKEN: string = 'REFRESH-TOKEN'

// token 时间戳
export const TIME_STAMP: string = 'timeStamp'

// * 超时时长：8小时（活跃续期机制）
export const TOKEN_TIMEOUT_VALUE: number = 8 * 3600 * 1000

// * Token 刷新相关
export const TOKEN_REFRESH_THRESHOLD: number = 5 * 60 * 1000 // 过期前5分钟触发刷新
export const TOKEN_EXPIRES_IN: string = 'EXPIRES-AT'

// * 当前用户信息（与基座一致）
export const CURRENT_USER: string = 'CURRENT-USER'

// * 国际化
export const LANG: string = 'language'

// * 首页地址（默认）
export const HOME_URL: string = '/home'

// * 登录页地址（默认）
export const LOGIN_URL: string = '/login'

// * 默认主题颜色
export const DEFAULT_PRIMARY: string = '#409eff'

// * 权限缓存 key
export const PERMISSION_CACHE_KEY: string = 'permission_cache'

// * 数据权限范围常量
export const DATA_SCOPE = {
  ALL: 'all',
  DEPARTMENT: 'department',
  DEPARTMENT_BELOW: 'department_below',
  SELF: 'self',
  CUSTOM: 'custom',
} as const

// * Tabs（白名单地址，不需要添加到 tabs 的路由地址）
export const TABS_WHITE_LIST: string[] = ['/403', '/404', '/500', LOGIN_URL]

// * 高德地图key
export const MAP_KEY: string = import.meta.env.VITE_MAP_KEY || ''

// * 微前端子应用名称（与 cim-micro-lite VITE_MICRO_APP_NAME 一致）
export const MICRO_APP_NAME: string = 'cim'

// * Service Route ID（与 cim-micro-lite 一致，请求头 cloudna-service-route-id）
export const SERVICE_ROUTE_ID: string =
  import.meta.env.VITE_SERVICE_ROUTE_ID || ''
