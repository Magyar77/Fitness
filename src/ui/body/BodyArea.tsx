import { useState, type ReactNode } from 'react';
import type { ProgressData } from '../../data/progress';
import { MeasurementsSection } from './MeasurementsSection';
import { PhotosSection } from './PhotosSection';

type Part = 'weight' | 'measurements' | 'photos';
const PARTS: { id: Part; label: string }[] = [
  { id: 'weight', label: 'Weight' },
  { id: 'measurements', label: 'Measurements' },
  { id: 'photos', label: 'Photos' },
];

function remembered(): Part {
  try {
    const v = localStorage.getItem('body-part');
    return PARTS.some((p) => p.id === v) ? (v as Part) : 'weight';
  } catch {
    return 'weight';
  }
}

/** Body tab: weight, measurements and progress photos. */
export function BodyArea({ data, onChange, weight }: { data: ProgressData; onChange: () => void; weight: ReactNode }) {
  const [part, setPart] = useState<Part>(remembered);
  const choose = (p: Part) => {
    setPart(p);
    try {
      localStorage.setItem('body-part', p);
    } catch {
      // only a convenience
    }
  };
  return (
    <>
      <div className="segmented body-switch">
        {PARTS.map((p) => (
          <button key={p.id} type="button" className={part === p.id ? '' : 'secondary'} aria-pressed={part === p.id} onClick={() => choose(p.id)}>
            {p.label}
          </button>
        ))}
      </div>
      {part === 'weight' ? weight : part === 'measurements' ? <MeasurementsSection entries={data.measurements} onChange={onChange} /> : <PhotosSection />}
    </>
  );
}
