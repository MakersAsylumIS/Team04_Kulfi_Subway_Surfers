import { lazy } from 'react'

// Loaded only on /media, so visitors never download it.
export const LazyMediaDashboard = lazy(() => import('./MediaDashboard.tsx').then((m) => ({ default: m.MediaDashboard })))
