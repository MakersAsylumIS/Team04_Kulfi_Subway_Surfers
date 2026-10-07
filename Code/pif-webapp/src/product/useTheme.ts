import { useEffect, useState } from 'react'

export type ThemeChoice = 'auto' | 'light' | 'dark'
const KEY = 'pif.theme'

function systemDark() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
}

/** Light, dark, or follow the phone. Remembered on this device. */
export function useTheme() {
  const [choice, setChoiceState] = useState<ThemeChoice>(() => {
    try {
      const saved = localStorage.getItem(KEY)
      if (saved === 'light' || saved === 'dark' || saved === 'auto') return saved
    } catch {
      // no storage
    }
    return 'auto'
  })
  const [sysDark, setSysDark] = useState(systemDark)

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mq) return
    const onChange = () => setSysDark(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const dark = choice === 'dark' || (choice === 'auto' && sysDark)

  useEffect(() => {
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0a0b0c' : '#f4f3ef')
  }, [dark])

  const setChoice = (c: ThemeChoice) => {
    setChoiceState(c)
    try {
      localStorage.setItem(KEY, c)
    } catch {
      // ignore
    }
  }
  // One button cycles: follow the phone, then light, then dark.
  const cycle = () => setChoice(choice === 'auto' ? 'light' : choice === 'light' ? 'dark' : 'auto')

  return { choice, dark, cycle }
}
