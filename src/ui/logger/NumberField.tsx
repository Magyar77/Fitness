import { useState } from 'react';

interface Props {
  label: string;
  value: number | null | undefined;
  onCommit: (value: number | null) => void;
  integer?: boolean;
  disabled?: boolean;
}

/**
 * Numeric input that keeps what is typed ("17." or "") while committing valid numbers
 * immediately, so every keystroke that forms a number is autosaved.
 */
const show = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));

export function NumberField({ label, value, onCommit, integer, disabled }: Props) {
  const [text, setText] = useState(show(value));
  const [seen, setSeen] = useState(value);
  // Adopt changes made elsewhere (e.g. the stopwatch) without disturbing what is being typed.
  if (value !== seen) {
    setSeen(value);
    const typed = text.trim() === '' ? null : Number(text);
    if (typed !== (value ?? null)) setText(show(value));
  }

  function change(raw: string) {
    const normalized = raw.replace(',', '.');
    setText(normalized);
    if (normalized.trim() === '') return onCommit(null);
    const n = Number(normalized);
    if (Number.isFinite(n) && n >= 0 && (!integer || Number.isInteger(n))) onCommit(n);
  }

  return (
    <label className="num">
      <span>{label}</span>
      <input
        type="text"
        inputMode={integer ? 'numeric' : 'decimal'}
        value={text}
        disabled={disabled}
        onChange={(e) => change(e.target.value)}
        onFocus={(e) => e.target.select()}
        aria-label={label}
      />
    </label>
  );
}
