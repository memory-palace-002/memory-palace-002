import { useEffect, useState } from 'react'
export function useRenderPause() {
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    const onVis = () => setPaused(document.hidden)
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])
  return paused
}