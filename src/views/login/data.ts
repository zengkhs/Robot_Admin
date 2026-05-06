/*
 * @Author: ChenYu ycyplus@gmail.com
 * @Date: 2025-04-29 23:35:57
 * @LastEditors: ChenYu ycyplus@gmail.com
 * @LastEditTime: 2026-04-30
 * @FilePath: \Robot_Admin\src\views\login\data.ts
 * @Description: 登录页数据配置（供 C_Login 组件使用）
 *               仅保留密码登录，关闭其余所有功能
 * Copyright (c) 2025 by CHENY, All Rights Reserved 😎.
 */
import type { LoginFeatures } from '@robot-admin/naive-ui-components'

// ================= 登录功能开关 =================
export const LOGIN_FEATURES: LoginFeatures = {
  passwordLogin: true,
  captchaLogin: false,
  qrcodeLogin: false,
  socialLogin: false,
  register: false,
  captchaVerify: false,
  rememberMe: false,
  forgotPassword: false,
}
