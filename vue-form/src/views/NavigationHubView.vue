<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const auth = useAuthStore()

const roleText = computed(() => auth.user?.role === 'admin' ? '管理员' : '普通用户')
const isAdmin = computed(() => auth.user?.role === 'admin')

async function logout() {
  await fetch('/api/logout', { method: 'POST' })
  auth.setUser(null)
  router.push('/login')
}
</script>

<template>
  <div class="hub-page">
    <header class="hub-header">
      <h1>工作导航</h1>
      <div class="hub-user">
        <span>{{ auth.user?.username }}</span>
        <span class="role">{{ roleText }}</span>
        <button class="link-btn" @click="router.push('/change-password')">修改密码</button>
        <button class="link-btn" @click="logout">退出</button>
      </div>
    </header>

    <main class="hub-main">
      <button class="entry-card" @click="router.push('/')">
        <h2>填写表单</h2>
        <p>进入表单中心，选择并提交业务表单。</p>
        <span>进入 →</span>
      </button>

      <button class="entry-card" @click="router.push('/admin/analytics')">
        <h2>数据分析作图</h2>
        <p>上传数据、配置图表映射并生成分析图表。</p>
        <span>进入 →</span>
      </button>

      <button v-if="isAdmin" class="entry-card" @click="router.push('/admin')">
        <h2>表单后台管理</h2>
        <p>管理表单配置、查看数据并维护后台设置。</p>
        <span>进入 →</span>
      </button>

      <button v-if="isAdmin" class="entry-card" @click="router.push('/admin/users')">
        <h2>用户管理</h2>
        <p>查看、导入、编辑用户并调整权限。</p>
        <span>进入 →</span>
      </button>
    </main>
  </div>
</template>

<style scoped>
.hub-page {
  min-height: 100vh;
  background: transparent;
  padding: 24px;
  box-sizing: border-box;
}

.hub-header {
  max-width: 1200px;
  margin: 0 auto 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.hub-header h1 {
  margin: 0;
  color: #1a1a2e;
}

.hub-user {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #4a5568;
}

.role {
  background: #edf2f7;
  border-radius: 999px;
  padding: 2px 10px;
  font-size: 12px;
}

.link-btn {
  border: 1px solid #d9d9d9;
  background: #fff;
  color: #4a5568;
  border-radius: 6px;
  padding: 6px 10px;
  cursor: pointer;
}

.hub-main {
  max-width: 1200px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.entry-card {
  text-align: left;
  border: 1px solid #d9e2f0;
  border-radius: 12px;
  background: #fff;
  padding: 20px;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.entry-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
}

.entry-card h2 {
  margin: 0 0 8px;
  color: #1f2937;
}

.entry-card p {
  margin: 0 0 16px;
  color: #64748b;
}

.entry-card span {
  color: #1677ff;
  font-weight: 600;
}

@media (max-width: 860px) {
  .hub-main {
    grid-template-columns: 1fr;
  }

  .hub-header {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
