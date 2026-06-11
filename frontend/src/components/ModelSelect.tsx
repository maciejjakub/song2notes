import type { SeparatorModel } from '../types';

// Fallback used until the backend's /config arrives (or if it's unreachable).
// Keys mirror settings.SEPARATOR_MODELS on the backend.
const DEFAULT_MODELS: SeparatorModel[] = [
  { key: 'htdemucs', label: 'Demucs v4 (htdemucs)' },
  { key: 'mdx_voc_ft', label: 'MDX-Net Voc FT' },
  { key: 'roformer', label: 'Mel-Band Roformer' },
];

// Rough per-clip speed/quality hints from the model evaluation; purely informative.
const MODEL_HINTS: Record<string, string> = {
  htdemucs: 'balanced · ~12s',
  mdx_voc_ft: 'fastest · ~8s',
  roformer: 'best quality · ~20s',
};

type Props = {
  models?: SeparatorModel[];
  value: string;
  onChange: (key: string) => void;
};

export function ModelSelect({ models, value, onChange }: Props) {
  const options = models && models.length > 0 ? models : DEFAULT_MODELS;

  return (
    <fieldset className="model-select">
      <legend className="model-select-label">Vocal separation model</legend>
      <div className="model-select-options" role="radiogroup">
        {options.map((m) => (
          <label
            key={m.key}
            className={`model-option${value === m.key ? ' selected' : ''}`}
          >
            <input
              type="radio"
              name="separator-model"
              value={m.key}
              checked={value === m.key}
              onChange={() => onChange(m.key)}
            />
            <span className="model-option-label">{m.label}</span>
            {MODEL_HINTS[m.key] && (
              <span className="model-option-hint">{MODEL_HINTS[m.key]}</span>
            )}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
