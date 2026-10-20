import { useMemo, useState } from 'react';
import type { Exercise } from '../../engine/model';
import { BODY_PARTS, EQUIPMENT_KINDS, EXERCISE_TYPES, searchLibrary, type LibraryFilter } from '../../engine/library/groups';
import { ExerciseDetail, muscleSummary } from './ExerciseDetail';

const PAGE = 40;

interface Props {
  exercises: Exercise[];
  /** When set, each row gets an Add button (the workout editor). */
  onPick?: (e: Exercise) => void;
  initialQuery?: string;
  onQueryChange?: (q: string) => void;
}

function ChipRow<T extends string>({ label, options, value, onChange }: { label: string; options: { id: T; label: string }[]; value: T | null; onChange: (v: T | null) => void }) {
  return (
    <div className="chip-row" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" className="secondary chip" aria-pressed={value === o.id} onClick={() => onChange(value === o.id ? null : o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Search and filter the whole library by body part, equipment and type. */
export function ExerciseBrowser({ exercises, onPick, initialQuery = '', onQueryChange }: Props) {
  const [filter, setFilter] = useState<LibraryFilter>({ query: initialQuery });
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(null);
  const results = useMemo(() => searchLibrary(exercises, filter), [exercises, filter]);
  const set = (p: Partial<LibraryFilter>) => {
    setFilter({ ...filter, ...p });
    setShown(PAGE);
    if (p.query !== undefined) onQueryChange?.(p.query);
  };
  const active = !!(filter.part || filter.equipment || filter.type);

  return (
    <div className="browser">
      <input type="search" placeholder={`Search ${exercises.length} exercises`} value={filter.query ?? ''} onChange={(e) => set({ query: e.target.value })} aria-label="Search exercises" />
      <ChipRow label="Body part" options={BODY_PARTS} value={filter.part ?? null} onChange={(part) => set({ part })} />
      <ChipRow label="Equipment" options={EQUIPMENT_KINDS} value={filter.equipment ?? null} onChange={(equipment) => set({ equipment })} />
      <ChipRow label="Type" options={EXERCISE_TYPES} value={filter.type ?? null} onChange={(type) => set({ type })} />
      <p className="muted small results-line">
        {results.length} {results.length === 1 ? 'exercise' : 'exercises'}
        {active && <button type="button" className="link" onClick={() => set({ part: null, equipment: null, type: null })}>Clear filters</button>}
      </p>
      <ul className="library-list">
        {results.slice(0, shown).map((e) => (
          <li key={e.id} className={open === e.id ? 'open' : ''}>
            <div className="library-row">
              <button type="button" className="library-name" aria-expanded={open === e.id} onClick={() => setOpen(open === e.id ? null : e.id)}>
                <span>
                  {e.name}
                  {e.custom && <span className="badge">yours</span>}
                </span>
                <small>{muscleSummary(e) || e.loadConvention}</small>
              </button>
              {onPick && <button type="button" className="secondary add" onClick={() => onPick(e)} aria-label={`Add ${e.name}`}>Add</button>}
            </div>
            {open === e.id && <ExerciseDetail exercise={e} />}
          </li>
        ))}
      </ul>
      {results.length > shown && (
        <button type="button" className="secondary wide" onClick={() => setShown(shown + PAGE)}>
          Show more ({results.length - shown} left)
        </button>
      )}
    </div>
  );
}
