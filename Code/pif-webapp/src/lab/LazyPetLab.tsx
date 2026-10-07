import { lazy } from 'react'

// Loaded only on /lab, so visitors never download the lab.
export const LazyPetLab = lazy(() => import('./PetLab.tsx').then((m) => ({ default: m.PetLab })))
