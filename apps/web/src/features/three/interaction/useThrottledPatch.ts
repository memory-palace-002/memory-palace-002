import { useRef } from 'react'
export function useThrottledPatch<T>(fn: (payload: T) => void, wait = 300) {
  const timer = useRef<number | null>(null)
  const latest = useRef<T | null>(null)
  const schedule = (payload: T) => {
    latest.current = payload
    if (timer.current != null) return
    timer.current = window.setTimeout(() => {
      timer.current = null
      if (latest.current != null) fn(latest.current)
    }, wait)
  }
  const flush = () => {
    if (timer.current != null) { clearTimeout(timer.current); timer.current = null }
    if (latest.current != null) fn(latest.current)
  }
  return { schedule, flush }
}