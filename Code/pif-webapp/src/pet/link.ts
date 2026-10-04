// A connected pet, at the level of bytes on characteristics. The real Web Bluetooth
// link and the fake pet both implement this, so the fake exercises the same encoding.

export type CharName = 'play' | 'transport' | 'nowShowing' | 'haptic'
export type NotifyName = 'playback' | 'input'

export interface PetLink {
  readonly name: string
  readonly fake: boolean
  write(char: CharName, bytes: Uint8Array): Promise<void>
  subscribe(char: NotifyName, onValue: (view: DataView) => void): void
  onDisconnect(handler: () => void): void
  disconnect(): void
}

export const hasWebBluetooth = typeof navigator !== 'undefined' && 'bluetooth' in navigator
