/*
 * @Author: ChenYu ycyplus@gmail.com
 * @Date: 2025-04-29
 * @LastEditors: ChenYu ycyplus@gmail.com
 * @LastEditTime: 2026-04-29
 * @FilePath: \Robot_Admin\src\api\auth.ts
 * @Description: 认证接口 — 对接 CIM 后端真实接口（与 cim-micro-lite 一致）
 *               包含：租户解析、验证码、登录、用户信息、菜单、退出
 * Copyright (c) 2026 by CHENY, All Rights Reserved 😎.
 */

import { getData, postData } from '@robot-admin/request-core'
import { encryptPassword, sign, buildAuthorizedHeaders } from '@/utils/d_crypto'

// ======================== 通用类型 ========================

/** API 响应信封 */
export interface ApiEnvelope<T> {
  code: string | number
  errorMessage?: string
  message?: string
  data: T
}

/** 判断成功码 */
function isSuccessCode(code: string | number | undefined): boolean {
  return code === 0 || code === '0'
}

/** 提取错误信息 */
function resolveErrorMessage(
  source: { errorMessage?: string; message?: string } | undefined,
  fallback: string
): string {
  return source?.errorMessage || source?.message || fallback
}

// ======================== 租户相关类型 ========================

/** 租户上下文 */
export interface TenantContext {
  id: string
  tenentCode: string
  customizedLogin?: string
}

/** 租户解析响应 */
interface TenantProfileResponse {
  id: string | number
  tenentCode?: string
  customizedLogin?: string | null
}

// ======================== 登录相关类型 ========================

/** 登录载荷 */
interface LoginPayload {
  access_token: string
  refresh_token: string
  expires_in: number
  user_name: string
  real_name: string
  current_org: string
  tenant_id: string
  user_id: string
}

/** 登录响应体（可能嵌套一层） */
type LoginResponseBody = {
  code?: string | number
  message?: string
  errorMessage?: string
  data?: LoginPayload | null
}

/** 用户信息响应 */
export interface UserInfoResponse {
  userName?: string
  avatar?: string
  authorities?: Array<{ authCode: string; authName: string }>
  currentOrg?: string
  tenantId?: string
  cloudnaTenant?: {
    tenantCode?: string
  }
  [key: string]: unknown
}

/** 会话快照（登录成功后返回） */
export interface SessionSnapshot {
  token: string
  refreshToken: string
  expiresAt: number
  username: string
  avatar: string
  permissions: Array<{ label: string; value: string }>
  userInfo: UserInfoResponse
  currentUser: Record<string, unknown>
}

// ======================== 菜单相关类型 ========================

/** 后端菜单项 */
export interface BackendMenuItem {
  id: number | string
  parentId?: number | string
  path: string
  name: string
  component?: string
  depth?: number
  meta: {
    title?: string
    icon?: string
    permissions?: string | string[]
    keepAlive?: boolean
    showMenu?: boolean
    sort?: number
    totalUri?: string | null
    displayMode?: string | null
    [key: string]: unknown
  }
  externalLink?: boolean
  embeddedOpen?: boolean
  useIframe?: boolean
  children?: BackendMenuItem[]
}

// ======================== 签名常量 ========================

const TENANT_CLIENT_KEY = 'T3FvUzqAputJnYsBFPw0TuPatzT9wNnW'

// ======================== API 函数 ========================

/**
 * * @description: 解析租户信息
 * ? @param {string} tenantCode 租户编码
 * ! @return {Promise<TenantContext>} 租户上下文
 */
export async function fetchTenantProfile(
  tenantCode: string
): Promise<TenantContext> {
  const normalizedCode = tenantCode.trim()
  if (!normalizedCode) {
    throw new Error('请输入租户编码')
  }

  // getData 返回的是 axios response.data（已被 request-core 拦截器处理）
  const response = await getData<ApiEnvelope<TenantProfileResponse>>(
    '/user-center/tenent/customized',
    {
      params: { tenentCode: normalizedCode },
    }
  )

  if (!isSuccessCode(response.code) || !response.data?.id) {
    throw new Error(resolveErrorMessage(response, '租户解析失败'))
  }

  return {
    id: String(response.data.id),
    tenentCode: response.data.tenentCode || normalizedCode,
    customizedLogin: response.data.customizedLogin || '',
  }
}

/**
 * * @description: 获取验证码
 * ? @param {string} tenantId 租户 ID
 * ! @return {Promise<string>} 验证码字符串
 */
export async function fetchTenantCode(tenantId: string): Promise<string> {
  try {
    const response = await getData<ApiEnvelope<string>>(
      '/user-center/tenent/code',
      {
        params: { tenentId: tenantId },
      }
    )

    if (!isSuccessCode(response.code)) {
      throw new Error(resolveErrorMessage(response, '获取验证码失败'))
    }

    return response.data || ''
  } catch (error: unknown) {
    if (typeof error === 'object' && error && 'response' in error) {
      const resp = (error as { response?: { status?: number } }).response
      if (resp?.status === 404) {
        throw new Error('验证码接口未找到，请检查代理配置和后端服务')
      }
    }
    throw error instanceof Error ? error : new Error('获取验证码失败')
  }
}

/**
 * * @description: 完整登录流程（含签名、加密、获取用户信息）
 * ? @param {object} params 登录参数
 * ! @return {Promise<SessionSnapshot>} 会话快照
 */
export async function loginWithTenantContext(params: {
  username: string
  password: string
  code: string
  tenant: TenantContext
}): Promise<SessionSnapshot> {
  const nonce = String(Date.now())
  const signature = sign(params.tenant.tenentCode, TENANT_CLIENT_KEY, nonce)
  const encryptedPassword = encryptPassword(params.password)

  const response = await postData<
    ApiEnvelope<LoginResponseBody | LoginPayload>
  >(
    `/user-center/client/tenant-sign/login-check?tenantCode=${params.tenant.tenentCode}&nonce=${nonce}&sign=${signature}&refreshToken=`,
    {
      userAccount: params.username,
      loginPasswd: encryptedPassword,
      validateCode: params.code,
    }
  )

  // 解析登录载荷（兼容嵌套和非嵌套两种响应格式）
  const loginPayload = normalizeLoginPayload(response)
  const token = loginPayload.access_token

  // 获取用户信息
  let userInfo: UserInfoResponse = {}
  try {
    userInfo = await fetchUserInfo(token)
  } catch {
    userInfo = {
      userName: loginPayload.user_name || loginPayload.real_name,
      tenantId: loginPayload.tenant_id,
      authorities: [],
    }
  }

  const permissions =
    userInfo.authorities?.map(item => ({
      label: item.authName,
      value: item.authCode,
    })) || []

  return {
    token,
    refreshToken: loginPayload.refresh_token || '',
    expiresAt: Date.now() + loginPayload.expires_in * 1000,
    username: userInfo.userName || loginPayload.real_name || params.username,
    avatar: userInfo.avatar || '',
    permissions,
    userInfo,
    currentUser: {
      current_org: loginPayload.current_org,
      tenant_id: loginPayload.tenant_id,
      user_id: loginPayload.user_id,
      user_name: loginPayload.user_name,
      real_name: loginPayload.real_name,
    },
  }
}

/**
 * * @description: 获取用户菜单权限列表
 * ? @param {string} subsystemCode 子系统编码（默认 cim）
 * ! @return {Promise<BackendMenuItem[]>} 菜单树
 */
export async function fetchUserMenus(
  subsystemCode = import.meta.env.VITE_MICRO_APP_NAME || 'cim'
): Promise<BackendMenuItem[]> {
  const url = '/authority-center/menu/userMenuTree'
  const token = getStoredAccessToken()

  const response = await getData<ApiEnvelope<BackendMenuItem[]>>(url, {
    params: { subsystemCode },
    headers: token ? buildAuthorizedHeaders(token, url) : {},
  })

  if (!isSuccessCode(response.code)) {
    throw new Error(resolveErrorMessage(response, '加载菜单失败'))
  }

  return normalizeMenus(Array.isArray(response.data) ? response.data : [])
}

/**
 * * @description: 退出登录（仅清除本地，无后端接口）
 */
export async function logoutApi(): Promise<void> {
  // CIM 后端无退出登录接口，仅清除本地数据
}

// ======================== 内部辅助函数 ========================

/** 判断是否为直接登录载荷（非嵌套格式） */
function isDirectLoginPayload(
  payload: LoginPayload | LoginResponseBody
): payload is LoginPayload {
  return 'access_token' in payload
}

/** 规范化登录载荷（兼容嵌套和非嵌套响应） */
function normalizeLoginPayload(
  response: ApiEnvelope<LoginResponseBody | LoginPayload>
): LoginPayload {
  if (!isSuccessCode(response.code)) {
    throw new Error(resolveErrorMessage(response, '登录失败'))
  }

  const nested = response.data
  if (!nested) {
    throw new Error('登录接口返回数据为空')
  }

  // 非嵌套格式：data 直接就是 LoginPayload
  if (isDirectLoginPayload(nested) && nested.access_token) {
    return nested
  }

  // 嵌套格式：data.data 才是 LoginPayload
  const nestedResponse = nested as LoginResponseBody
  if (
    !isSuccessCode(nestedResponse.code) ||
    !nestedResponse.data?.access_token
  ) {
    throw new Error(resolveErrorMessage(nestedResponse, '登录失败'))
  }

  return nestedResponse.data
}

/** 获取用户信息（先尝试 query token，失败则用 bearer token） */
async function fetchUserInfo(token: string): Promise<UserInfoResponse> {
  try {
    return await requestUserInfoByQueryToken(token)
  } catch {
    return requestUserInfoByBearerToken(token)
  }
}

/** 通过 query 参数传递 token 获取用户信息 */
async function requestUserInfoByQueryToken(
  token: string
): Promise<UserInfoResponse> {
  const response = await getData<
    UserInfoResponse | ApiEnvelope<UserInfoResponse>
  >('/cloudna-auth/oauth/user-info', {
    params: { token },
  })
  return unwrapUserInfoResponse(response)
}

/** 通过 Bearer 加密 token 获取用户信息 */
async function requestUserInfoByBearerToken(
  token: string
): Promise<UserInfoResponse> {
  const url = '/cloudna-auth/oauth/current-user-info'
  const response = await getData<
    UserInfoResponse | ApiEnvelope<UserInfoResponse>
  >(url, {
    headers: buildAuthorizedHeaders(token, url),
  })
  return unwrapUserInfoResponse(response)
}

/** 解包用户信息响应（兼容信封和非信封格式） */
function unwrapUserInfoResponse(
  source: UserInfoResponse | ApiEnvelope<UserInfoResponse>
): UserInfoResponse {
  if ('code' in source && 'data' in source && source.data) {
    return source.data as UserInfoResponse
  }
  return source as UserInfoResponse
}

/** 获取存储的 access token */
function getStoredAccessToken(): string {
  const token = localStorage.getItem('ACCESS-TOKEN')
  if (!token) return ''
  try {
    return JSON.parse(token) as string
  } catch {
    return token
  }
}

/** 菜单排序 */
function sortMenus(left: BackendMenuItem, right: BackendMenuItem): number {
  const leftSort = Number(left.meta?.sort || 0)
  const rightSort = Number(right.meta?.sort || 0)
  if (leftSort !== rightSort) return leftSort - rightSort

  const leftDepth = Number(left.depth || 0)
  const rightDepth = Number(right.depth || 0)
  if (leftDepth !== rightDepth) return leftDepth - rightDepth

  return String(left.name).localeCompare(String(right.name))
}

/** 规范化菜单数据 */
function normalizeMenus(menus: BackendMenuItem[]): BackendMenuItem[] {
  return menus
    .map(item => ({
      ...item,
      path: typeof item.path === 'string' ? item.path.trim() : '',
      name: typeof item.name === 'string' ? item.name.trim() : '',
      children: Array.isArray(item.children)
        ? normalizeMenus(item.children)
        : [],
    }))
    .filter(
      item =>
        item.children?.length ||
        Boolean(item.path || item.name || item.meta?.title)
    )
    .sort(sortMenus)
}
