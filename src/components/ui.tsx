import type { ReactNode } from 'react'

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { id: T; label: string; title?: string }[]
  onChange: (v: T) => void
  label?: string
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          title={o.title}
          className={o.id === value ? 'seg on' : 'seg'}
          aria-pressed={o.id === value}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Field({
  label,
  value,
  onChange,
  suffix,
  placeholder,
  readOnly,
  invalid,
  hint,
  list,
  inputMode = 'decimal',
}: {
  label: string
  value: string
  onChange?: (v: string) => void
  suffix?: ReactNode
  placeholder?: string
  readOnly?: boolean
  invalid?: boolean
  hint?: string
  list?: string
  inputMode?: 'decimal' | 'numeric' | 'text'
}) {
  return (
    <label className={`field${readOnly ? ' field--out' : ''}`}>
      <span className="field__label">{label}</span>
      <span className="field__box">
        <input
          className={invalid ? 'input bad' : 'input'}
          value={value}
          placeholder={placeholder}
          readOnly={readOnly}
          tabIndex={readOnly ? -1 : undefined}
          inputMode={inputMode}
          list={list}
          onChange={(e) => onChange?.(e.target.value)}
          onFocus={(e) => !readOnly && e.currentTarget.select()}
        />
        {suffix ? <span className="field__suffix">{suffix}</span> : null}
      </span>
      {hint ? <span className="field__hint">{hint}</span> : null}
    </label>
  )
}

export function Panel({
  title,
  derived,
  onClaim,
  children,
  aside,
}: {
  title: string
  /** True when this group is the one being calculated. */
  derived?: boolean
  onClaim?: () => void
  children: ReactNode
  aside?: ReactNode
}) {
  return (
    <section className={derived ? 'panel panel--derived' : 'panel'}>
      <header className="panel__head">
        <h2>{title}</h2>
        {derived ? (
          <span className="chip chip--out" title="This group is calculated from the other two">
            calculated
          </span>
        ) : onClaim ? (
          <button type="button" className="chip chip--btn" onClick={onClaim}>
            solve for this
          </button>
        ) : null}
        {aside}
      </header>
      <div className="panel__body">{children}</div>
    </section>
  )
}

export function Stat({
  label,
  value,
  sub,
  wide,
  tone,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  wide?: boolean
  tone?: 'accent' | 'warn'
}) {
  return (
    <div className={`stat${wide ? ' stat--wide' : ''}${tone ? ` stat--${tone}` : ''}`}>
      <div className="stat__label">{label}</div>
      <div className="stat__value">{value}</div>
      {sub ? <div className="stat__sub">{sub}</div> : null}
    </div>
  )
}
