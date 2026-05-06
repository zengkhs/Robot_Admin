/*
 * @Author: ChenYu ycyplus@gmail.com
 * @Date: 2026-04-29
 * @FilePath: \Robot_Admin\src\utils\d_crypto.ts
 * @Description: 加密工具 — RSA 密码加密 + SHA256 签名 + Token AES 加密
 *               对齐 CIM 后端认证体系（与 cim-micro-lite 一致）
 * Copyright (c) 2026 by CHENY, All Rights Reserved 😎.
 */

import JSEncrypt from 'jsencrypt'
import CryptoJS, { AES as aes } from 'crypto-js'

// ======================== RSA 密码加密 ========================

/** RSA 公钥（与 CIM 后端一致） */
const RSA_PUBLIC_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAw4r5JZ/nd8mBQbOyNt3Fpxy7XDY6jkiII4S7kq1r15CqCZPK4wbKNdemtB1S/hLPXgqzLifzsamXxhvYBLjPgi1tARqqnEWEZo5IYJWGnXN/+YMxHk6RJ82Y1QCLSFB0SKioGsVgT+6ZEWwM66SdecGCjAllRNBKirZXJm9rIKqg9oJSbIec9SVIzZoynrajk/0JDqWRU/7yjjH9JnBvDf9Xw2M+RPwkwuZ/T/3jXtOoZtVUSOj9lYO2jDmvXNWXNpAP2PVj5C+uLjWrXUhgC7F7h1435hiyrvcIuH++5zxJX/yiUlwlH9nQDGHRGoF4AOqCWYsyjfmy7aeEP2G2PwIDAQAB'

/**
 * * @description: RSA 加密密码（登录时使用）
 * ? @param {string} source 明文密码
 * ! @return {string} RSA 加密后的密文
 */
export function encryptPassword(source: string): string {
  const encryptor = new JSEncrypt()
  encryptor.setPublicKey(RSA_PUBLIC_KEY)
  return encryptor.encrypt(source) || ''
}

// ======================== SHA256 签名 ========================

/** 签名 ClientKey（与 CIM 后端一致） */
const TENANT_CLIENT_KEY = 'T3FvUzqAputJnYsBFPw0TuPatzT9wNnW'

/**
 * * @description: 生成租户签名（登录时使用）
 * ? @param {string} tenantCode 租户编码
 * ? @param {string} clientKey 客户端密钥
 * ? @param {string} nonce 随机数（时间戳）
 * ! @return {string} SHA256 签名（大写）
 *
 * 算法: SHA256("clientKey{tenantCode}clientSecret{clientKey}nonce{nonce}").toUpperCase()
 */
export function sign(
  tenantCode: string,
  clientKey: string = TENANT_CLIENT_KEY,
  nonce: string
): string {
  const content = `clientKey${tenantCode}clientSecret${clientKey}nonce${nonce}`
  return CryptoJS.SHA256(content).toString().toUpperCase()
}

// ======================== Token AES 加密 ========================

/** Token AES 密钥（与 CIM 后端一致） */
const TOKEN_AES_KEY = 'rIJ62TEe3cPwUdGixjm18w=='

/**
 * * @description: AES 加密 Token（每次请求时使用）
 * ? @param {string} token 原始 JWT token
 * ? @param {string} url 请求 URL 路径
 * ! @return {string} 加密后的 token
 *
 * 加密逻辑：
 * 1. 将 token 按 "." 拆分为 3 段（JWT 格式）
 * 2. 取前两段 + URL pathname 组成明文 JSON
 * 3. AES-CBC + PKCS7 加密
 * 4. 拼接第三段后截取重组
 */
export function getEncryptToken(token: string, url: string): string {
  const segments = token.split('.')

  // 非 JWT 格式直接返回
  if (segments.length !== 3) {
    return token
  }

  // 规范化 URL（确保有 pathname）
  let normalizedUrl = url
  if (
    normalizedUrl.length < 4 ||
    normalizedUrl.slice(0, 4).toLowerCase() !== 'http'
  ) {
    normalizedUrl = normalizedUrl.startsWith('/')
      ? `http://t.t${normalizedUrl}`
      : `http://t.t/${normalizedUrl}`
  }

  const uri = new URL(normalizedUrl).pathname
  const encrypted = aes.encrypt(
    JSON.stringify({
      t: `${segments[0]}.${segments[1]}`,
      u: uri,
    }),
    TOKEN_AES_KEY,
    {
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    }
  )

  const encryptedToken = `${encrypted.toString()}.${segments[2]}`
  return `${encryptedToken.slice(10, 26)}.${encryptedToken.slice(26)}`
}

/**
 * * @description: 构建带加密 Token 的请求头
 * ? @param {string} token 原始 token
 * ? @param {string} url 请求 URL 路径
 * ! @return {Record<string, string>} 包含 Authorization 的请求头
 */
export function buildAuthorizedHeaders(
  token: string,
  url: string
): Record<string, string> {
  return {
    Authorization: `Bearer ${getEncryptToken(token, url)}`,
  }
}
