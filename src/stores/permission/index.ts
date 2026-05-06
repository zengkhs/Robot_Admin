/*
 * @Author: ChenYu ycyplus@gmail.com
 * @Date: 2025-04-29 11:13:19
 * @LastEditors: ChenYu ycyplus@gmail.com
 * @LastEditTime: 2026-04-29
 * @FilePath: \Robot_Admin\src\stores\permission\index.ts
 * @Description: 权限 Store — 零基座依赖，支持微前端/独立运行双模式
 *               对接 CIM 后端菜单接口 /authority-center/menu/userMenuTree
 * Copyright (c) 2026 by CHENY, All Rights Reserved 😎.
 */

import { fetchUserMenus, type BackendMenuItem } from '@/api/auth'
import { getAuthButtonListApi } from '@/api/permission-manage'
import { getKeepAliveRouterName, getShowMenuList } from '@/utils/d_route'
import {
  isMicroApp,
  getMicroAppData,
  hasBaseAppData,
} from '@/utils/micro-app-bridge'
import type { DynamicRoute } from '@/router/dynamicRouter'
import type {
  ButtonPermissionMap,
  DataPermission,
} from '@/types/modules/permission'

/**
 * * @description: 从基座菜单中过滤出属于 CIM 子应用的菜单
 * ? @param {DynamicRoute[]} menuList 基座完整菜单
 * ! @return {DynamicRoute[]} CIM 子应用菜单
 */
function filterCimMenuList(menuList: DynamicRoute[]): DynamicRoute[] {
  const MICRO_APP_NAME = 'cim'

  const filter = (routes: DynamicRoute[]): DynamicRoute[] | null => {
    const result: DynamicRoute[] = []

    for (const route of routes) {
      const microApp = (route.meta as any)?.microApp

      if (microApp === MICRO_APP_NAME) {
        result.push({
          ...route,
          children: route.children
            ? (filter(route.children) ?? undefined)
            : undefined,
        })
        continue
      }

      if (microApp === '') {
        result.push({
          ...route,
          children: route.children
            ? (filter(route.children) ?? undefined)
            : undefined,
        })
        continue
      }

      if (microApp === null && route.children?.length) {
        const filteredChildren = filter(route.children)
        if (filteredChildren && filteredChildren.length > 0) {
          result.push({ ...route, children: filteredChildren })
        }
        continue
      }
    }

    return result.length > 0 ? result : null
  }

  return filter(menuList) ?? []
}

/**
 * * @description: 将后端菜单树转换为 DynamicRoute 格式
 * ? @param {BackendMenuItem[]} menus 后端菜单树
 * ! @return {DynamicRoute[]} 前端路由格式
 */
function convertBackendMenusToRoutes(menus: BackendMenuItem[]): DynamicRoute[] {
  return menus.map(menu => {
    const route: DynamicRoute = {
      path: menu.path || '',
      name: menu.name || '',
      component: menu.component || '',
      meta: {
        title: menu.meta?.title || '',
        icon: menu.meta?.icon || '',
        keepAlive: menu.meta?.keepAlive ?? false,
        hidden: menu.meta?.showMenu === false,
        sort: menu.meta?.sort ?? 0,
        // 保留后端额外 meta 字段
        ...(menu.meta?.permissions
          ? { permissions: menu.meta.permissions }
          : {}),
        ...(menu.meta?.totalUri ? { totalUri: menu.meta.totalUri } : {}),
        ...(menu.meta?.displayMode
          ? { displayMode: menu.meta.displayMode }
          : {}),
      },
    }

    if (menu.children?.length) {
      route.children = convertBackendMenusToRoutes(menu.children)
    }

    // 外链/iframe 处理
    if (menu.externalLink || menu.useIframe) {
      route.meta.isIframe = menu.useIframe
      route.meta.isLink = menu.externalLink
    }

    return route
  })
}

export const s_permissionStore = defineStore('permission', {
  state: () => {
    return {
      /** 按钮权限映射表（key=路由path，value=权限编码数组） */
      authButtonList: {} as ButtonPermissionMap,
      /** 动态菜单路由列表（不持久化） */
      authMenuList: [] as DynamicRoute[],
      /** 数据权限规则列表 */
      dataPermissions: [] as DataPermission[],
      /** 已展平的全部合法路由 path 列表（用于路由鉴权） */
      flatRoutePaths: [] as string[],
    }
  },
  getters: {
    /** 按钮权限映射 */
    authButtonListGet: state => state.authButtonList,
    /** 原始菜单列表 */
    authMenuListGet: state => state.authMenuList,
    /** 过滤后的显示菜单（hidden !== true） */
    showMenuListGet: state => getShowMenuList(state.authMenuList),
    /** 需缓存的路由 name 列表 */
    keepAliveRouterGet: state => getKeepAliveRouterName(state.authMenuList),
    /** 数据权限规则 */
    dataPermissionsGet: state => state.dataPermissions,
  },

  actions: {
    /**
     * * @description: 获取按钮权限列表
     * ! @return {Promise<void>}
     */
    async getAuthButtonList() {
      try {
        const { data } = await getAuthButtonListApi()
        this.authButtonList = data ?? {}
      } catch (error) {
        console.error('获取按钮权限失败:', error)
        this.authButtonList = {}
      }
    },

    /**
     * * @description: 获取菜单列表（零基座依赖版）
     *
     * 优先级：
     * 1. 基座下发了 menuList → 过滤出 CIM 菜单后使用
     * 2. 基座未下发 → 自主调用 GET /authority-center/menu/userMenuTree
     * 3. 接口失败 → 使用本地 JSON 兜底
     *
     * ! @return {Promise<any>} 菜单列表响应
     */
    async getAuthMenuList() {
      try {
        // 优先级 1：基座下发了菜单数据
        if (isMicroApp() && hasBaseAppData()) {
          const microData = getMicroAppData()
          if (microData?.menuList?.length) {
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

        // 优先级 2：自主调用后端菜单接口
        try {
          const backendMenus = await fetchUserMenus()
          const routes = convertBackendMenusToRoutes(backendMenus)
          this.authMenuList = routes
          this.flatRoutePaths = [...this._buildFlatPaths(routes)]
          return { code: '0', data: routes, msg: 'success' }
        } catch (apiError) {
          console.warn(
            '[CIM] Menu API failed, falling back to local JSON:',
            apiError
          )
        }

        // 优先级 3：本地 JSON 兜底
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
     * * @description: 从基座同步菜单数据
     * ? @param {DynamicRoute[]} menuList 基座下发的菜单列表
     */
    setAuthMenuListFromBase(menuList: DynamicRoute[]) {
      const cimMenuList = filterCimMenuList(menuList)
      if (cimMenuList.length) {
        this.authMenuList = cimMenuList
        this.flatRoutePaths = [...this._buildFlatPaths(cimMenuList)]
      }
    },

    /**
     * * @description: 校验当前路由是否在权限范围内
     */
    hasRoutePermission(path: string): boolean {
      if (this.flatRoutePaths.length === 0) return true
      return this.flatRoutePaths.includes(path)
    },

    /**
     * * @description: 校验按钮权限
     */
    hasButtonPermission(routePath: string, code: string): boolean {
      const buttons = this.authButtonList[routePath]
      if (!buttons) return false
      return buttons.includes(code)
    },

    /**
     * * @description: 获取指定模块的数据权限
     */
    getDataPermission(module: string): DataPermission | undefined {
      return this.dataPermissions.find(dp => dp.module === module)
    },

    /**
     * * @description: 加载本地菜单 JSON 兜底
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
