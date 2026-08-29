const KEY = 'dmhub_domain_favorites'

function read(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

function write(ids: string[]) {
  localStorage.setItem(KEY, JSON.stringify([...new Set(ids)]))
}

export function getFavoriteDomainIds(): string[] {
  return read()
}

export function isFavoriteDomain(id: string): boolean {
  return read().includes(id)
}

export function toggleFavoriteDomain(id: string): boolean {
  const list = read()
  const idx = list.indexOf(id)
  if (idx >= 0) {
    list.splice(idx, 1)
    write(list)
    return false
  }
  list.unshift(id)
  write(list)
  return true
}

export function setFavoriteDomain(id: string, favorite: boolean) {
  const list = read().filter((x) => x !== id)
  if (favorite) list.unshift(id)
  write(list)
}
