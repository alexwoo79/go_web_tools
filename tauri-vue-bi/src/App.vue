<script setup lang="ts">
// src/App.vue
// 主布局 (Main Layout)
//
// 布局结构：
//   ┌────────┬────────────────────────────────┐
//   │        │  标题栏 (Header)                │
//   │ 侧边栏  ├────────────────────────────────┤
//   │ (Menu) │  路由内容区 (router-view)        │
//   │        │                                │
//   └────────┴────────────────────────────────┘
//
// 侧边栏菜单项对应四个主视图：
//   1. 数据加载与清洗  → /load-clean
//   2. 图表分析        → /chart-analysis
//   3. 多维透视分析    → /pivot-analysis
//   4. 甘特图分析      → /gantt-analysis

import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'

const router = useRouter()
const route = useRoute()

// 当前激活的菜单项（与路由 name 对应）
const activeMenu = ref<string>((route.name as string) || 'load-clean')

// 暗色模式状态
const isDark = ref(true)

function handleMenuSelect(key: string) {
  activeMenu.value = key
  router.push({ name: key })
}

function toggleDark(dark: boolean) {
  if (dark) {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
}
</script>

<template>
  <el-container class="app-container" style="height: 100vh;">
    <!-- 侧边栏 Sidebar -->
    <el-aside width="220px" class="sidebar">
      <div class="sidebar-logo">
        <span class="logo-icon">📊</span>
        <span class="logo-text">BI 分析工具</span>
      </div>

      <el-menu
        :default-active="activeMenu"
        background-color="var(--el-bg-color-overlay)"
        text-color="var(--el-text-color-primary)"
        active-text-color="var(--el-color-primary)"
        class="sidebar-menu"
        @select="handleMenuSelect"
      >
        <el-menu-item index="load-clean">
          <template #title>⬇️ 数据加载与清洗</template>
        </el-menu-item>

        <el-menu-item index="chart-analysis">
          <template #title>📊 图表分析</template>
        </el-menu-item>

        <el-menu-item index="pivot-analysis">
          <template #title>🔢 多维透视分析</template>
        </el-menu-item>

        <el-menu-item index="gantt-analysis">
          <template #title>📅 甘特图分析</template>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <!-- 主内容区 Main content -->
    <el-container direction="vertical">
      <!-- 顶部标题栏 Header -->
      <el-header class="app-header" height="56px">
        <div class="header-title">
          {{ route.meta?.title ?? 'BI 分析工具' }}
        </div>
        <div class="header-actions">
          <!-- 暗色/亮色模式切换 -->
          <el-switch
            v-model="isDark"
            active-text="🌙"
            inactive-text="☀️"
            @change="toggleDark"
          />
        </div>
      </el-header>

      <!-- 路由内容区 -->
      <el-main class="app-main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
.app-container {
  background-color: var(--el-bg-color);
  color: var(--el-text-color-primary);
}

.sidebar {
  border-right: 1px solid var(--el-border-color);
  display: flex;
  flex-direction: column;
}

.sidebar-logo {
  height: 56px;
  display: flex;
  align-items: center;
  padding: 0 16px;
  gap: 8px;
  border-bottom: 1px solid var(--el-border-color);
  font-size: 16px;
  font-weight: bold;
}

.logo-icon {
  font-size: 24px;
}

.sidebar-menu {
  flex: 1;
  border-right: none;
}

.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--el-border-color);
  padding: 0 24px;
  background-color: var(--el-bg-color-overlay);
}

.header-title {
  font-size: 18px;
  font-weight: 600;
}

.app-main {
  overflow: auto;
  padding: 24px;
}
</style>
