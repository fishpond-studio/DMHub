const KEY = 'dmhub_recent_domains'
const MAX = 12

export interface RecentDomain {
  id: string
  name: string
  visitedAt: number
}

function read(): RecentDomain[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr
      .filter((x) => x && typeof x.id === 'string' && typeof x.name === 'string')
      .map((x) => ({
        id: x.id as string,
        name: x.name as string,
        visitedAt: typeof x.visitedAt === 'number' ? x.visitedAt : Date.now(),
      }))
  } catch {
    return []
  }
}

function write(list: RecentDomain[]) {
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)))
}

export function getRecentDomains(): RecentDomain[] {
  return read()
}

export function pushRecentDomain(id: string, name: string) {
  if (!id || !name) return
  const list = read().filter((x) => x.id !== id)
  list.unshift({ id, name, visitedAt: Date.now() })
  write(list)
}

export function clearRecentDomains() {
  localStorage.removeItem(KEY)
}
