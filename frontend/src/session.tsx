// Who is acting, which demo bank is open and who reads complaints. No account:
// the picker has a default and only labels the actor for the audit log.

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { api, setActor as sendActor, setWorld as sendWorld } from './api'
import { DEFAULT_WORLD_ID } from './types'
import type { Actor, Health, Preset, World } from './types'
import { tx } from './i18n'
import { MISTAKE } from './words'

interface Session {
  actor: Actor
  setActor: (actor: Actor) => void
  worldId: string
  setWorldId: (worldId: string) => void
  /** null while loading or when the server did not answer. */
  worlds: World[] | null
  /** Loads the list of demo banks again, after one was built. */
  refreshWorlds: () => Promise<void>
  health: Health | null
  /** The real-case presets; empty while loading or when the server did not answer. */
  presets: Preset[]
  /** What a demo bank is called on screen. */
  bankName: (worldId: string) => string
}

const SessionContext = createContext<Session | null>(null)
const ACTORS: Actor[] = ['officer', 'compliance', 'jury']

// A private window may refuse storage. The choice then lasts for this visit only.
function remembered(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function remember(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // nothing to do
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [actor, setActorState] = useState<Actor>(() => {
    const saved = remembered('feeguard.actor') as Actor | null
    const first = saved && ACTORS.includes(saved) ? saved : 'officer'
    sendActor(first)
    return first
  })
  const [worldId, setWorldState] = useState(() => {
    const first = remembered('feeguard.world') ?? DEFAULT_WORLD_ID
    sendWorld(first)
    return first
  })
  const [worlds, setWorlds] = useState<World[] | null>(null)
  const [health, setHealth] = useState<Health | null>(null)
  const [presets, setPresets] = useState<Preset[]>([])

  const refreshWorlds = () =>
    api.worlds().then(
      (list) => setWorlds(list.items),
      () => setWorlds(null),
    )

  useEffect(() => {
    api.health().then(setHealth, () => setHealth(null))
    api.presets().then((list) => setPresets(list.items), () => setPresets([]))
    api.worlds().then(
      (list) => {
        setWorlds(list.items)
        // A demo bank that was deleted falls back to the default one.
        if (!list.items.some((world) => world.world_id === worldId)) {
          sendWorld(DEFAULT_WORLD_ID)
          setWorldState(DEFAULT_WORLD_ID)
        }
      },
      () => setWorlds(null),
    )
    // Once, when the site opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const session = useMemo<Session>(
    () => ({
      actor,
      setActor: (next) => {
        sendActor(next)
        remember('feeguard.actor', next)
        setActorState(next)
      },
      worldId,
      setWorldId: (next) => {
        sendWorld(next)
        remember('feeguard.world', next)
        setWorldState(next)
      },
      worlds,
      refreshWorlds,
      health,
      presets,
      bankName: (id) => {
        if (id === DEFAULT_WORLD_ID) return 'Default'
        const preset = presets.find((item) => item.world_id === id)
        return preset ? `Public case: ${tx(MISTAKE[preset.mistake]).toLowerCase()}` : id
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [actor, worldId, worlds, health, presets],
  )

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
}

export function useSession(): Session {
  const session = useContext(SessionContext)
  if (!session) throw new Error('useSession needs a SessionProvider above it')
  return session
}
