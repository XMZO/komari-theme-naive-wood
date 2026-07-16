<script setup lang="ts">
import type { FormInst } from 'naive-ui'
import { NAlert, NButton, NDivider, NForm, NFormItem, NInput, NInputOtp } from 'naive-ui'

import { computed, ref } from 'vue'
import { useAppStore } from '@/stores/app'
import { ApiError, getSharedApi } from '@/utils/api'
import { reconnectAfterLogin } from '@/utils/init'

const emit = defineEmits<{
  loginSuccess: []
}>()

const appStore = useAppStore()
const api = getSharedApi()

const formRef = ref<FormInst | undefined>()

const form = ref({
  username: '',
  password: '',
})

const loading = ref(false)
const showOtpDialog = ref(false)
const otpCode = ref<string[]>(['', '', '', '', '', ''])
const otpLoading = ref(false)
const passwordLoginEnabled = computed(() => !appStore.publicSettings?.disable_password_login)
const oauthLoginEnabled = computed(() => Boolean(appStore.publicSettings?.oauth_enable))

const onlyAllowNumber = (value: string) => !value || /^\d+$/.test(value)

const rules = ref({
  username: [{ required: true, message: '请输入用户名', trigger: ['blur'] }],
  password: [{ required: true, message: '请输入密码', trigger: ['blur'] }],
})

function getLoginErrorMessage(error: unknown, otp = false): string {
  if (!(error instanceof ApiError))
    return otp ? '验证失败，请重试' : '登录失败，请重试'

  switch (error.kind) {
    case 'invalid_credentials':
      return otp ? '用户名或密码已失效，请重新登录' : '用户名或密码错误'
    case 'two_factor_invalid':
      return '验证码错误，请重试'
    case 'password_login_disabled':
      return '密码登录已被管理员禁用'
    case 'network':
      return '网络连接失败，请检查面板地址或反向代理'
    case 'timeout':
      return '登录请求超时，请稍后重试'
    case 'protocol':
      return '面板返回了无法识别的响应'
    case 'unauthenticated':
      return error.message || '登录会话未生效'
    default:
      return otp ? '验证失败，请重试' : '登录失败，请重试'
  }
}

async function handleLogin() {
  try {
    await formRef.value?.validate()
  }
  catch {
    return
  }

  loading.value = true

  try {
    await api.login(form.value.username, form.value.password)
    await completeLogin()
  }
  catch (error) {
    if (error instanceof ApiError && error.kind === 'two_factor_required') {
      showOtpDialog.value = true
      return
    }
    console.error('[LoginDialog] Login error:', error)
    window.$message?.error(getLoginErrorMessage(error))
  }
  finally {
    loading.value = false
  }
}

async function handleOtpSubmit() {
  const code = otpCode.value.join('')
  if (code.length < 6) {
    window.$message?.warning('请输入 6 位验证码')
    return
  }

  otpLoading.value = true

  try {
    await api.login(form.value.username, form.value.password, code)
    await completeLogin()
  }
  catch (error) {
    console.error('[LoginDialog] OTP error:', error)
    window.$message?.error(getLoginErrorMessage(error, true))
    if (error instanceof ApiError && error.kind === 'two_factor_invalid') {
      otpCode.value = ['', '', '', '', '', '']
    }
  }
  finally {
    otpLoading.value = false
  }
}

async function completeLogin() {
  // 不能只相信 login 响应；必须确认 HttpOnly session cookie 已真正生效。
  const me = await api.getMe()
  if (!me.logged_in) {
    throw new ApiError('登录会话未生效，请检查反向代理或 Cookie 设置', 'error', 401, { kind: 'unauthenticated' })
  }
  appStore.setUserInfo(me)
  await reconnectAfterLogin()
  emit('loginSuccess')
  window.$modal?.destroyAll()
  window.$message?.success('登录成功')
}

function handleOAuth2Login() {
  api.oauthLogin()
}
</script>

<template>
  <div class="w-full">
    <!-- 登录表单 -->
    <div v-if="!showOtpDialog && passwordLoginEnabled" class="flex flex-col">
      <NForm ref="formRef" :model="form" :rules="rules" class="w-full">
        <NFormItem label="用户名" path="username">
          <NInput v-model:value="form.username" placeholder="请输入用户名" :disabled="loading" />
        </NFormItem>
        <NFormItem label="密码" path="password">
          <NInput
            v-model:value="form.password"
            type="password"
            placeholder="请输入密码"
            :disabled="loading"
            @keydown.enter="handleLogin"
          />
        </NFormItem>
      </NForm>
      <NButton type="primary" :loading="loading" block @click="handleLogin">
        <template #icon>
          <div class="i-icon-park-outline-login" />
        </template>
        登录
      </NButton>
    </div>

    <!-- OTP 验证表单 -->
    <div v-if="showOtpDialog" class="flex flex-col gap-4 w-full items-center overflow-x-auto">
      <div class="text-center">
        <div class="text-lg font-medium mb-2">
          两步验证
        </div>
        <div class="text-sm text-gray-500">
          请输入验证器中的 6 位数字验证码
        </div>
      </div>
      <NInputOtp
        v-model:value="otpCode"
        :length="6"
        :disabled="otpLoading"
        :allow-input="onlyAllowNumber"
        @keydown.enter="handleOtpSubmit"
      />
      <div class="flex gap-2 w-full">
        <NButton quaternary :disabled="otpLoading" @click="showOtpDialog = false">
          返回
        </NButton>
        <NButton type="primary" class="flex-1" :loading="otpLoading" @click="handleOtpSubmit">
          验证
        </NButton>
      </div>
    </div>

    <template v-if="!showOtpDialog && oauthLoginEnabled">
      <NDivider v-if="passwordLoginEnabled" />
      <div class="flex flex-col">
        <NButton block @click="handleOAuth2Login">
          <template #icon>
            <div class="i-icon-park-outline-outbound" />
          </template>
          使用 OAuth2 登录
        </NButton>
      </div>
    </template>

    <NAlert v-if="!showOtpDialog && !passwordLoginEnabled && !oauthLoginEnabled" type="error" :show-icon="false">
      当前站点未启用任何可用的登录方式，请联系管理员。
    </NAlert>
  </div>
</template>
