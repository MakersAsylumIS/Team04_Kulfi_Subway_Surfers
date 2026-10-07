// Small form controls shared by the lab (/lab) and the media dashboard (/media).

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3 py-1 text-sm">
      <span className="text-neutral-500">{label}</span>
      <span className="flex items-center gap-2">{children}</span>
    </label>
  )
}

export function Choice<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T
  options: [T, string][]
  onChange: (v: T) => void
}) {
  return (
    <span className="flex overflow-hidden rounded-md border border-neutral-300">
      {options.map(([v, label]) => (
        <button
          key={String(v)}
          type="button"
          onClick={() => onChange(v)}
          className={`px-2 py-1 text-xs ${v === value ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-700'}`}
        >
          {label}
        </button>
      ))}
    </span>
  )
}

export function Num({ value, onChange, min, max, step = 1 }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number }) {
  return (
    <>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-28" />
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-16 rounded border border-neutral-300 px-1 text-right text-xs"
      />
    </>
  )
}
