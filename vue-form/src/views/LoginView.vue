<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

interface WebServiceStatus {
  available: boolean
  running: boolean
  addr: string
  lan_addr: string
  configured: string
}

const username = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)
const router = useRouter()
const auth = useAuthStore()

const ws = ref<WebServiceStatus | null>(null)
const wsBusy = ref(false)
const wsError = ref('')

// 仅本机（桌面窗口 127.0.0.1）显示 Web 服务启停按钮；局域网页面隐藏
const isLocalPage =
  window.location.hostname === '127.0.0.1' ||
  window.location.hostname === 'localhost' ||
  window.location.hostname === '::1'

async function refreshWebService() {
  if (!isLocalPage) {
    ws.value = null
    return
  }
  try {
    const res = await fetch('/api/desktop/web-service')
    if (!res.ok) {
      ws.value = null
      return
    }
    const data: WebServiceStatus = await res.json()
    // 仅桌面端环境显示控制按钮
    ws.value = data.available ? data : null
  } catch {
    ws.value = null
  }
}

async function toggleWebService() {
  if (!ws.value || wsBusy.value) return
  wsBusy.value = true
  wsError.value = ''
  try {
    const res = await fetch('/api/desktop/web-service', {
      method: ws.value.running ? 'DELETE' : 'POST',
    })
    const data = await res.json()
    if (!res.ok) {
      wsError.value = (data && data.error) || '操作失败，请查看后端日志'
      return
    }
    ws.value = data
  } catch (e: any) {
    wsError.value = e?.message || '网络错误'
  } finally {
    wsBusy.value = false
  }
}

onMounted(refreshWebService)

async function login() {
  error.value = ''
  loading.value = true
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.value, password: password.value }),
    })
    if (res.ok) {
      // 从 /api/me 获取用户信息并同步到 store，再跳转
      await auth.fetchMe()
      router.push('/portal')
    } else {
      const data = await res.json()
      error.value = data.error || '登录失败'
    }
  } catch {
    error.value = '网络错误，请稍后重试'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <h1>用户登录</h1>

      <form @submit.prevent="login">
        <div class="field">
          <label>用户名</label>
          <input v-model="username" type="text" placeholder="请输入用户名" autocomplete="username" required />
        </div>
        <div class="field">
          <label>密码</label>
          <input v-model="password" type="password" placeholder="请输入密码" autocomplete="current-password" required />
        </div>
        <p v-if="error" class="error-msg">{{ error }}</p>
        <button type="submit" :disabled="loading">
          {{ loading ? '登录中…' : '登录' }}
        </button>
      </form>

      <p class="register-link">
        没有账号？
        <a href="/register" @click.prevent="router.push('/register')">去注册</a>
      </p>

      <div v-if="isLocalPage && ws" class="ws-divider"></div>
      <div v-if="isLocalPage && ws" class="web-service">
        <div class="ws-head">
          <span class="ws-dot" :class="ws.running ? 'on' : 'off'"></span>
          <span class="ws-title">Web 服务</span>
        </div>
        <p class="ws-desc">
          <template v-if="ws.running">
            运行中 ·
            <a
              v-if="ws.lan_addr"
              :href="ws.lan_addr"
              target="_blank"
              rel="noopener"
              class="ws-link"
            >{{ ws.lan_addr }}</a>
            <span v-else class="ws-addr">{{ ws.addr }}</span>
            <span class="ws-tag">{{ ws.lan_addr ? '局域网可访问' : '仅本机' }}</span>
          </template>
          <template v-else>未启动</template>
        </p>
        <p v-if="wsError" class="ws-error">{{ wsError }}</p>
        <button type="button" class="ws-btn" :disabled="wsBusy" @click="toggleWebService">
          {{ wsBusy ? '处理中…' : ws.running ? '停止 Web 服务' : '启动 Web 服务' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  background:
    radial-gradient(circle at 16% 18%, #eaf1ff 0%, transparent 45%),
    radial-gradient(circle at 84% 16%, #f0fbf5 0%, transparent 40%),
    linear-gradient(145deg, #edf2ff 0%, #f4f6ff 45%, #f5f0ff 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.login-card {
  background: rgba(255, 255, 255, .86);
  border-radius: 16px;
  padding: 2.5rem 2rem;
  width: 100%;
  max-width: 380px;
  border: 1px solid rgba(221, 227, 241, .9);
  box-shadow: 0 14px 36px rgba(76, 92, 148, .18);
  backdrop-filter: blur(8px);
}

h1 { margin: 0 0 .8rem; font-size: 1.5rem; color: #1a1a2e; text-align: center; }
.subtitle { color: #888; margin: 0 0 1.8rem; font-size: .9rem; }

.field { margin-bottom: 1.1rem; }
.field label { display: block; font-size: .85rem; color: #444; margin-bottom: .4rem; font-weight: 500; }
.field input {
  width: 100%;
  padding: .65rem .85rem;
  border: 1.5px solid #d9dfeb;
  border-radius: 8px;
  font-size: 1rem;
  box-sizing: border-box;
  transition: border-color .2s;
}
.field input:focus {
  outline: none;
  border-color: #4b68f2;
  box-shadow: 0 0 0 3px rgba(75, 104, 242, .13);
}

.error-msg { color: #e53e3e; font-size: .85rem; margin: -.3rem 0 .8rem; }

button {
  width: 100%;
  padding: .75rem;
  background: #4b68f2;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  cursor: pointer;
  transition: background .2s;
}
button:hover:not(:disabled) { background: #3f58d6; }
button:disabled { opacity: .6; cursor: not-allowed; }

.register-link {
  text-align: center;
  margin-top: .5rem;
  font-size: .82rem;
  color: #7a869f;
}

.register-link a {
  color: var(--brand-600);
  text-decoration: none;
}

.ws-divider {
  height: 1px;
  background: #e4e8f2;
  margin: 1.2rem 0 .9rem;
}

.web-service {
  text-align: left;
}

.ws-head {
  display: flex;
  align-items: center;
  gap: .5rem;
  margin-bottom: .35rem;
}

.ws-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
}

.ws-dot.on {
  background: var(--status-success);
  box-shadow: 0 0 0 3px rgba(47, 159, 99, .16);
}

.ws-dot.off {
  background: var(--text-muted);
  box-shadow: 0 0 0 3px rgba(138, 146, 166, .14);
}

.ws-title {
  font-size: .9rem;
  font-weight: 600;
  color: #1a1a2e;
}

.ws-desc {
  font-size: .8rem;
  color: #7a869f;
  margin: 0 0 .65rem;
  word-break: break-all;
}

.ws-link {
  color: var(--brand-600);
  text-decoration: none;
  font-weight: 500;
}

.ws-link:hover {
  text-decoration: underline;
}

.ws-addr {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.ws-tag {
  display: inline-block;
  margin-left: .35rem;
  padding: 0 .4rem;
  border-radius: 999px;
  font-size: .72rem;
  background: var(--bg-soft-green);
  color: var(--status-success);
}

.ws-error {
  color: #e53e3e;
  font-size: .78rem;
  margin: 0 0 .6rem;
}

.ws-btn {
  width: 100%;
  padding: .55rem;
  background: #4b68f2;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: .88rem;
  cursor: pointer;
  transition: background .2s;
}
.ws-btn:hover:not(:disabled) { background: #3f58d6; }
.ws-btn:disabled { opacity: .6; cursor: not-allowed; }
</style>
