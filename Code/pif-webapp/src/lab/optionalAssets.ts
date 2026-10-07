// Test media the lab can use when it's present locally, but that isn't in the public
// repository (third-party pictures, or media without a licence to share). Found with
// import.meta.glob, so the app builds and runs without them; the lab hides what's missing.
//   src/pet/crane.json                 the crane flight sprite (scripts/convert-crane.mjs)
//   assets/pet-boot/up-in-the-sky.mp4  a short test video

export interface CraneData {
  width: number
  height: number
  palette: string[]
  frames: string[]
}

const craneFiles = import.meta.glob<{ default: CraneData }>('../pet/crane.json', { eager: true })
export const crane: CraneData | null = Object.values(craneFiles)[0]?.default ?? null

const skyFiles = import.meta.glob<string>('../../assets/pet-boot/up-in-the-sky.mp4', { eager: true, query: '?url', import: 'default' })
export const skyUrl: string | null = Object.values(skyFiles)[0] ?? null
