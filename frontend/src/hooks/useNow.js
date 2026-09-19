import { useEffect, useState } from 'react'

/**
 * One 1Hz interval for every clock on the page. Ticks only while `active`;
 * returns the last tick, which callers clamp against their own start times.
 */
export function useNow(active) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!active) return undefined
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [active])

  return now
}
