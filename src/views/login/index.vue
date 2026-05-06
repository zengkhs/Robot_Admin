<!--
 * @Author: ChenYu ycyplus@gmail.com
 * @Date: 2025-04-29 23:07:28
 * @LastEditors: ChenYu ycyplus@gmail.com
 * @LastEditTime: 2026-04-30
 * @FilePath: \Robot_Admin\src\views\login\index.vue
 * @Description: 登录页 — 保留原始 C_Login 风格
 *               在面板底部追加租户编码和验证码字段（视觉融入面板）
 *               移除人机校验（puzzle-captcha）
 *               支持独立运行和微前端嵌入双模式
 * Copyright (c) 2026 by CHENY, All Rights Reserved 😎.
-->
<template>
  <div class="login-container bg-[#181818]">
    <!-- 打字机动画 -->
    <Typewriter
      v-if="showTypewriter"
      :text="t('lp_typewriter', 'Hey！伙计，欢迎来到我的世界。')"
      :duration="2000"
      :delay="300"
      :pause-after="1000"
      @hidden="showTypewriter = false"
    />

    <!-- Spline 3D 背景 -->
    <div class="spline-background">
      <Spline
        scene="https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode"
      />
    </div>

    <!-- 右上角工具栏：语言 + 主题 -->
    <div class="login-toolbar">
      <NTooltip
        placement="bottom"
        trigger="hover"
      >
        <template #trigger>
          <NButton
            circle
            class="login-toolbar__btn"
            @click="toggleTheme"
          >
            <template #icon>
              <C_Icon
                :name="
                  themeStore.isDark ? 'mdi:weather-sunny' : 'mdi:weather-night'
                "
                :size="16"
              />
            </template>
          </NButton>
        </template>
        {{ themeStore.isDark ? '切换亮色' : '切换暗色' }}
      </NTooltip>
      <NTooltip
        placement="bottom"
        trigger="hover"
      >
        <template #trigger>
          <NButton
            circle
            class="login-toolbar__btn"
            @click="toggleLang"
          >
            <template #icon>
              <C_Icon
                name="mdi:translate"
                :size="16"
              />
            </template>
          </NButton>
        </template>
        {{ langStore.currentLang === 'zh-cn' ? 'English' : '中文' }}
      </NTooltip>
    </div>

    <!-- 登录面板 -->
    <div class="login-wrapper">
      <C_Login
        ref="loginRef"
        title="Robot Admin"
        subtitle="管理系统 · 请登录您的账号"
        logo-icon="mdi:robot-outline"
        :features="LOGIN_FEATURES"
        :loading="loading"
        @submit="handleLogin"
      />

      <!-- 租户编码 + 验证码（紧贴 C_Login 面板底部，视觉上融为一体） -->
      <div
        v-if="!isMicroMode"
        class="login-extra-fields"
      >
        <!-- 租户编码 -->
        <div class="login-extra-fields__row">
          <NInput
            v-model:value="formValue.tenantCode"
            placeholder="请输入租户编码，例如 cim"
            clearable
          >
            <template #prefix>
              <C_Icon
                name="mdi:office-building-outline"
                :size="16"
              />
            </template>
          </NInput>
          <NButton
            secondary
            :loading="tenantLoading"
            @click="resolveTenant()"
          >
            解析租户
          </NButton>
        </div>
        <div
          v-if="resolvedTenantLabel"
          class="login-extra-fields__resolved"
        >
          {{ resolvedTenantLabel }}
        </div>

        <!-- 验证码 -->
        <div class="login-extra-fields__row">
          <NInput
            v-model:value="formValue.code"
            placeholder="请输入验证码"
            clearable
          >
            <template #prefix>
              <C_Icon
                name="mdi:shield-check-outline"
                :size="16"
              />
            </template>
          </NInput>
          <NButton
            secondary
            :loading="captchaLoading"
            @click="refreshCode"
          >
            {{ captchaCode || '获取验证码' }}
          </NButton>
        </div>

        <!-- 错误提示 -->
        <NAlert
          v-if="errorMessage"
          type="error"
          :show-icon="false"
          class="login-extra-fields__alert"
          closable
          @close="errorMessage = ''"
        >
          {{ errorMessage }}
        </NAlert>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import type { PasswordFormData } from '@robot-admin/naive-ui-components'
  import { initDynamicRouter } from '@/router/dynamicRouter'
  import { s_userStore } from '@/stores/user'
  import { s_themeStore } from '@/stores/theme'
  import { s_languageStore } from '@/stores/language'
  import {
    fetchTenantProfile,
    fetchTenantCode,
    loginWithTenantContext,
  } from '@/api/auth'
  import { isMicroApp } from '@/utils/micro-app-bridge'
  import { LOGIN_FEATURES } from './data'
  import Spline from './components/Spline.vue'
  import Typewriter from './components/Typewriter.vue'
  import './index.scss'

  defineOptions({ name: 'LoginView' })

  const router = useRouter()
  const message = useMessage()
  const userStore = s_userStore()
  const themeStore = s_themeStore()
  const langStore = s_languageStore()

  // ===== i18n helper =====
  const t = (key: string, fallback: string) => fallback

  // ===== 状态 =====
  const showTypewriter = ref(true)
  const loading = ref(false)
  const captchaLoading = ref(false)
  const tenantLoading = ref(false)
  const errorMessage = ref('')
  const captchaCode = ref('')
  const loginRef = ref<{ resetCaptcha: () => void } | null>(null)

  const isMicroMode = computed(() => isMicroApp())

  // ===== 表单数据（租户 + 验证码，C_Login 自管理账号密码） =====
  const formValue = reactive({
    tenantId: userStore.tenant?.id || '',
    tenantCode: userStore.tenant?.tenentCode || '',
    code: '',
  })

  const resolvedTenantLabel = computed(() =>
    formValue.tenantId
      ? `已解析租户：${formValue.tenantCode} / ID ${formValue.tenantId}`
      : ''
  )

  // ===== 工具栏 =====
  const toggleTheme = () =>
    themeStore.setMode(themeStore.isDark ? 'light' : 'dark')
  const toggleLang = () =>
    langStore.setLanguage(langStore.currentLang === 'zh-cn' ? 'en' : 'zh-cn')

  // ===== 租户解析 =====
  /**
   * * @description: 解析租户信息
   * ? @param {boolean} showSuccessMessage 是否显示成功提示
   * ! @return {Promise<boolean>} 是否解析成功
   */
  async function resolveTenant(showSuccessMessage = true) {
    const tenantCode = formValue.tenantCode.trim()
    if (!tenantCode) {
      errorMessage.value = '请先输入租户编码'
      return false
    }

    tenantLoading.value = true
    errorMessage.value = ''

    try {
      const tenant = await fetchTenantProfile(tenantCode)
      formValue.tenantId = tenant.id
      formValue.tenantCode = tenant.tenentCode
      userStore.setTenantContext(tenant)

      if (showSuccessMessage) {
        message.success(`租户解析成功：${tenant.tenentCode}`)
      }
      return true
    } catch (error) {
      errorMessage.value =
        error instanceof Error ? error.message : '租户解析失败'
      return false
    } finally {
      tenantLoading.value = false
    }
  }

  /**
   * * @description: 确保租户已解析
   * ! @return {Promise<boolean>} 租户是否就绪
   */
  async function ensureTenantReady() {
    if (formValue.tenantId) return true
    if (!formValue.tenantCode.trim()) {
      errorMessage.value = '请先输入租户编码'
      return false
    }
    return resolveTenant(false)
  }

  // ===== 验证码 =====
  /**
   * * @description: 获取验证码
   */
  async function refreshCode() {
    errorMessage.value = ''
    captchaLoading.value = true

    try {
      const ready = await ensureTenantReady()
      if (!ready || !formValue.tenantId) {
        throw new Error('租户解析失败')
      }

      captchaCode.value = await fetchTenantCode(formValue.tenantId)
      userStore.setTenantContext({
        id: formValue.tenantId,
        tenentCode: formValue.tenantCode,
      })

      if (!captchaCode.value) {
        errorMessage.value = '验证码接口返回为空'
      }
    } catch (error) {
      errorMessage.value =
        error instanceof Error
          ? error.message
          : '验证码获取失败，请检查后端服务'
      captchaCode.value = ''
    } finally {
      captchaLoading.value = false
    }
  }

  // ===== C_Login 事件处理 =====
  /**
   * * @description: 密码登录处理
   * ? @param {PasswordFormData} formData C_Login 提交的表单数据
   */
  async function handleLogin(formData: PasswordFormData) {
    errorMessage.value = ''

    // 独立运行模式需要租户和验证码
    if (!isMicroMode.value) {
      const tenantReady = await ensureTenantReady()
      if (!tenantReady || !formValue.tenantId) {
        errorMessage.value = errorMessage.value || '租户解析失败'
        return
      }

      if (!formValue.code.trim()) {
        errorMessage.value = '请输入验证码'
        return
      }
    }

    userStore.setTenantContext({
      id: formValue.tenantId,
      tenentCode: formValue.tenantCode,
    })

    loading.value = true

    try {
      const session = await loginWithTenantContext({
        username: formData.username,
        password: formData.password,
        code: formValue.code,
        tenant: {
          id: formValue.tenantId,
          tenentCode: formValue.tenantCode,
        },
      })

      // 应用会话快照
      userStore.applySession(session)

      // 初始化动态路由
      const ok = await initDynamicRouter()
      if (!ok) throw new Error('动态路由初始化失败')

      message.success('登录成功')
      router.replace('/home')
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '登录失败'
      loginRef.value?.resetCaptcha()
    } finally {
      loading.value = false
    }
  }
</script>

<style lang="scss" scoped>
  /* 租户编码 + 验证码扩展区域 — 紧贴 C_Login 面板底部，视觉融合 */
  .login-extra-fields {
    width: var(--cl-panel-width, 370px);
    margin-top: -2px;
    padding: 14px 26px 20px;
    border-radius: 0 0 var(--cl-panel-radius, 16px) var(--cl-panel-radius, 16px);
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-top: none;
    backdrop-filter: blur(12px);

    &__alert {
      margin-top: 10px;
    }

    &__row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 10px;
      margin-bottom: 10px;

      &:last-child {
        margin-bottom: 0;
      }
    }

    &__resolved {
      margin-top: -4px;
      margin-bottom: 10px;
      padding: 6px 10px;
      border-radius: 8px;
      background: rgba(15, 99, 223, 0.12);
      color: #60a5fa;
      font-size: 12px;
    }
  }

  @media (max-width: 640px) {
    .login-extra-fields {
      width: min(90vw, 370px);

      &__row {
        grid-template-columns: 1fr;
      }
    }
  }
</style>
