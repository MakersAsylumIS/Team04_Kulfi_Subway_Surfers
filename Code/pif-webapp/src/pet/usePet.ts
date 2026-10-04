import { useCallback, useState } from 'react'
import type { Story } from '../data/types.ts'
import { FakePet } from './fakePet.ts'
import type { PetLink } from './link.ts'
import { pairWebBluetoothPet } from './webBluetooth.ts'

/** The pet connection lives outside journeys: pair once, ride many times. */
export function usePet(stories: readonly Story[]) {
  const [pet, setPet] = useState<PetLink | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const adopt = useCallback((link: PetLink) => {
    link.onDisconnect(() => setPet((p) => (p === link ? null : p)))
    setPet(link)
    setError(null)
  }, [])

  /** Call from a tap: the browser shows its own device picker. */
  const pair = useCallback(async () => {
    setConnecting(true)
    setError(null)
    try {
      adopt(await pairWebBluetoothPet())
    } catch (e) {
      // Closing the picker is not an error worth showing.
      if (!(e instanceof DOMException && e.name === 'NotFoundError')) {
        setError(e instanceof Error ? e.message : 'Could not connect to the pet.')
      }
    } finally {
      setConnecting(false)
    }
  }, [adopt])

  const connectFake = useCallback(() => adopt(new FakePet(stories)), [adopt, stories])

  const disconnect = useCallback(() => pet?.disconnect(), [pet])

  return { pet, connecting, error, pair, connectFake, disconnect }
}
