/*
 * @Author: ChenYu ycyplus@gmail.com
 * @Date: 2025-04-29 23:35:57
 * @LastEditors: ChenYu ycyplus@gmail.com
 * @LastEditTime: 2026-04-29
 * @FilePath: \Robot_Admin\src\views\login\data.ts
 * @Description: 登录页数据配置（供 C_Login 组件使用）
 *               关闭人机校验、扫码登录等不需要的功能
 * Copyright (c) 2025 by CHENY, All Rights Reserved 😎.
 */
import type {
  SocialProvider,
  LoginFeatures,
} from '@robot-admin/naive-ui-components'

// ================= 登录功能开关 =================
export const LOGIN_FEATURES: LoginFeatures = {
  passwordLogin: true,
  captchaLogin: false,
  qrcodeLogin: false,
  socialLogin: true,
  register: false,
  captchaVerify: false, // 关闭人机校验
  rememberMe: true,
  forgotPassword: true,
}

// ================= 社交登录配置 =================
export const SOCIAL_PROVIDERS: SocialProvider[] = [
  { key: 'github', label: 'GitHub', icon: 'mdi:github' },
  { key: 'google', label: 'Google', icon: 'mdi:google' },
  { key: 'wechat', label: '微信登录', icon: 'mdi:wechat' },
  { key: 'qq', label: 'QQ 登录', icon: 'mdi:qqchat' },
]
