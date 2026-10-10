import { useCallback, useEffect, useState } from 'react'

export type Loaded<T> =
  | { status: 'loading' }
  | { status: 'error'; error: Error }
  | { status: 'ready'; data: T }

/** Loads once per change of `deps`, and again on `reload`. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<Loaded<T>>({ status: 'loading' })
  const [turn, setTurn] = useState(0)

  useEffect(() => {
    let live = true
    setState({ status: 'loading' })
    load().then(
      (data) => live && setState({ status: 'ready', data }),
      (error: Error) => live && setState({ status: 'error', error }),
    )
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, turn])

  const reload = useCallback(() => setTurn((value) => value + 1), [])
  const replace = useCallback((data: T) => setState({ status: 'ready', data }), [])
  return { state, reload, replace }
}
