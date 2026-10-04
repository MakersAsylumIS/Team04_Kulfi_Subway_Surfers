import type { CharName, NotifyName, PetLink } from './link.ts'
import { PET_CHAR, PET_SERVICE } from './protocol.ts'

// Minimal Web Bluetooth typings: the DOM lib doesn't ship them.
interface BtCharacteristic extends EventTarget {
  value?: DataView
  writeValueWithResponse(value: BufferSource): Promise<void>
  startNotifications(): Promise<BtCharacteristic>
}
interface BtService {
  getCharacteristic(uuid: string): Promise<BtCharacteristic>
}
interface BtServer {
  connected: boolean
  connect(): Promise<BtServer>
  disconnect(): void
  getPrimaryService(uuid: string): Promise<BtService>
}
interface BtDevice extends EventTarget {
  name?: string
  gatt?: BtServer
}
interface Bluetooth {
  requestDevice(options: { filters: { services: string[] }[] }): Promise<BtDevice>
}

/**
 * Opens the browser's device picker and connects. Must be called from a tap
 * (Web Bluetooth requires a user gesture), never automatically on load.
 */
export async function pairWebBluetoothPet(): Promise<PetLink> {
  const bluetooth = (navigator as Navigator & { bluetooth: Bluetooth }).bluetooth
  const device = await bluetooth.requestDevice({ filters: [{ services: [PET_SERVICE] }] })
  if (!device.gatt) throw new Error('This pet has no Bluetooth services.')
  const server = await device.gatt.connect()
  const service = await server.getPrimaryService(PET_SERVICE)

  const chars = new Map<string, BtCharacteristic>()
  const get = async (name: CharName | NotifyName) => {
    let c = chars.get(name)
    if (!c) {
      c = await service.getCharacteristic(PET_CHAR[name])
      chars.set(name, c)
    }
    return c
  }
  // Fetch everything up front so a firmware mismatch fails at pairing, not mid-story.
  await Promise.all((['play', 'transport', 'nowShowing', 'haptic', 'playback', 'input'] as const).map(get))

  // GATT allows one operation at a time; queue writes so they never overlap.
  let queue = Promise.resolve()

  return {
    name: device.name || 'Pet',
    fake: false,
    write(name, bytes) {
      const next = queue.then(async () => (await get(name)).writeValueWithResponse(bytes as BufferSource))
      queue = next.catch(() => {})
      return next
    },
    subscribe(name, onValue) {
      queue = queue.then(async () => {
        const c = await get(name)
        c.addEventListener('characteristicvaluechanged', () => {
          if (c.value) onValue(c.value)
        })
        await c.startNotifications()
      })
    },
    onDisconnect(handler) {
      device.addEventListener('gattserverdisconnected', handler)
    },
    disconnect() {
      if (server.connected) server.disconnect()
    },
  }
}
