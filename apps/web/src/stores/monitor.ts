import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '@/lib/axios'

export interface MonitorCheckRow {
  id: string
  domainId: string
  checkType: string
  status: 'up' | 'down'
  statusCode: number | null
  responseMs: number | null
  error: string | null
  checkedAt: string
}

export interface MonitorSummary {
  monitored: number
  up: number
  down: number
  unknown: number
  domains: Array<{
    id: string
    name: string
    status: string
    monitorStatus: string | null
    monitorResponseMs: number | null
    monitorLastCheckedAt: string | null
  }>
}

export const useMonitorStore = defineStore('monitor', () => {
  const summary = ref<MonitorSummary | null>(null)
  const history = ref<MonitorCheckRow[]>([])
  const loading = ref(false)
  const checking = ref(false)

  async function fetchSummary() {
    const { data } = await api.get('/monitor/summary')
    summary.value = data
    return data
  }

  async function fetchHistory(domainId: string, hours = 24) {
    const { data } = await api.get(`/monitor/${domainId}/history`, { params: { hours } })
    history.value = data.history
    return data.history
  }

  async function checkNow(domainId: string) {
    checking.value = true
    try {
      const { data } = await api.post(`/monitor/${domainId}/check`)
      return data
    } finally {
      checking.value = false
    }
  }

  async function setEnabled(domainId: string, enabled: boolean) {
    await api.put(`/monitor/${domainId}/enabled`, { enabled })
  }

  return { summary, history, loading, checking, fetchSummary, fetchHistory, checkNow, setEnabled }
})
