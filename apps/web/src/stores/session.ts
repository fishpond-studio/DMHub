import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '@/lib/axios'

export interface SessionInfo {
  id: string
  userId: string
  deviceInfo: string | null
  expiresAt: string
  createdAt: string
  current: boolean
}

export const useSessionStore = defineStore('session', () => {
  const sessions = ref<SessionInfo[]>([])
  const loading = ref(false)

  async function fetchSessions() {
    loading.value = true
    try {
      const { data } = await api.get('/auth/sessions')
      sessions.value = data.sessions
      return data.sessions
    } finally {
      loading.value = false
    }
  }

  async function revokeSession(id: string) {
    await api.delete(`/auth/sessions/${id}`)
    sessions.value = sessions.value.filter((s) => s.id !== id)
  }

  async function revokeOthers() {
    await api.delete('/auth/sessions')
    sessions.value = sessions.value.filter((s) => s.current)
  }

  return { sessions, loading, fetchSessions, revokeSession, revokeOthers }
})
