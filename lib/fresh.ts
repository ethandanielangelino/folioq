// Server-only: a few seconds' memory for live prices.
//
// Next's fetch cache (`next: { revalidate }`) hands back the stored copy when
// it is out of date and only then fetches a new one in the background, so the
// first page after a quiet spell can show a price that is minutes or hours
// old. Live prices are fetched uncached instead, and remembered here for a few
// seconds so a busy page (or several viewers) doesn't ask the source again
// for every holding on every refresh. Simultaneous requests share one fetch.

const kept = new Map<string, { at: number; value: Promise<unknown> }>()
const MAX_KEPT = 1000

/**
 * The answer `load` gave for `key` in the last `seconds`, or a new one.
 * Answers that `keep` rejects (a failure) aren't remembered, so the next
 * request tries again.
 */
export function fresh<T>(
  key: string,
  seconds: number,
  load: () => Promise<T>,
  keep: (value: T) => boolean = () => true
): Promise<T> {
  const now = Date.now()
  const hit = kept.get(key)
  if (hit && now - hit.at < seconds * 1000) return hit.value as Promise<T>

  const entry = { at: now, value: Promise.resolve() as Promise<unknown> }
  const value = load().then(
    (result) => {
      if (!keep(result) && kept.get(key) === entry) kept.delete(key)
      return result
    },
    (error: unknown) => {
      if (kept.get(key) === entry) kept.delete(key)
      throw error
    }
  )
  entry.value = value
  kept.set(key, entry)

  // Old entries go first once there are too many.
  if (kept.size > MAX_KEPT) {
    for (const [k, v] of kept) {
      if (now - v.at >= seconds * 1000 || kept.size > MAX_KEPT) kept.delete(k)
      if (kept.size <= MAX_KEPT) break
    }
  }
  return value
}
