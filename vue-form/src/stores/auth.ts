import { ref } from 'vue'
import { defineStore } from 'pinia'

export interface AuthUser {
  id: number
  username: string
  role: string
}

export const ROLE_LABELS: Record<string, string> = {
  admin: '管理员',
  user: '普通用户',
  staff: '职员',
  dept_head: '部门负责人',
  senior_leader: '部门以上领导',
  division_leader: '分管领导',
  top_leader: '主管领导',
}

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null)
  const checked = ref(false)

  async function fetchMe() {
    try {
      const res = await fetch('/api/me')
      if (res.ok) {
        user.value = await res.json()
      } else {
        user.value = null
      }
    } catch {
      user.value = null
    } finally {
      checked.value = true
    }
  }

  function setUser(u: AuthUser | null) {
    user.value = u
    checked.value = true
  }

  const isLoggedIn = () => user.value !== null
  const isAdmin = () => user.value?.role === 'admin'

  return { user, checked, fetchMe, setUser, isLoggedIn, isAdmin }
})
