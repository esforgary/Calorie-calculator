import { useEffect, useState } from "react";
import { Check, Palette, RotateCcw } from "lucide-react";
import { contrastText, DEFAULT_THEME, normalizeHex, sanitizeTheme, themeStyle } from "./theme";
import type { ThemeColors } from "./theme";

const presets: { label: string; value: ThemeColors }[] = [
  { label: "Графит", value: DEFAULT_THEME },
  { label: "Океан", value: { accent: "#7bb8ff", background: "#101c2b", surface: "#edf4fc" } },
  { label: "Тёплый", value: { accent: "#f7b76d", background: "#29211f", surface: "#fff8ef" } },
  { label: "Ночной", value: { accent: "#c7adff", background: "#111015", surface: "#26232e" } },
];
const fields: { key: keyof ThemeColors; label: string; description: string }[] = [
  { key: "accent", label: "Кнопки и акценты", description: "Основные действия и выбранные пункты" },
  { key: "background", label: "Фон приложения", description: "Пространство вокруг карточек" },
  { key: "surface", label: "Блоки и формы", description: "Карточки, поля и открытые окна" },
];

export function ThemeSettings({ value, onSave, disabled = false }: { value?: ThemeColors; onSave: (theme: ThemeColors) => boolean; disabled?: boolean }) {
  const saved = sanitizeTheme(value);
  const [draft, setDraft] = useState<ThemeColors>(saved);
  const [savedMessage, setSavedMessage] = useState(false);
  useEffect(() => {
    setDraft(sanitizeTheme(value));
  }, [value?.accent, value?.background, value?.surface]);
  const valid = fields.every(field => normalizeHex(draft[field.key]));
  const preview = sanitizeTheme(draft);
  const dirty = fields.some(field => preview[field.key] !== saved[field.key]);
  const change = (key: keyof ThemeColors, color: string) => {
    setDraft(current => ({ ...current, [key]: color }));
    setSavedMessage(false);
  };
  return <section className="card theme-settings">
    <div className="card-heading">
      <div><h2><Palette size={19} />Цветовая гамма</h2><p>Свои цвета для всего дневника</p></div>
    </div>
    <div className="theme-settings-layout">
      <div className="theme-controls">
        <div className="theme-presets" role="group" aria-label="Готовые цветовые гаммы">
          {presets.map(preset => <button type="button" key={preset.label}
            className="theme-preset"
            aria-pressed={fields.every(field => preview[field.key] === preset.value[field.key])}
            onClick={() => { setDraft({ ...preset.value }); setSavedMessage(false); }}>
            <span className="theme-preset-dots" aria-hidden="true">{fields.map(field => <i key={field.key} style={{ background: preset.value[field.key] }} />)}</span>
            {preset.label}
          </button>)}
        </div>
        {fields.map(field => <div className="theme-color-row" key={field.key}>
          <div><label htmlFor={`theme-${field.key}`}>{field.label}</label><p>{field.description}</p></div>
          <div className="theme-color-input">
            <input type="color" aria-label={`${field.label}: палитра`} value={preview[field.key]} onChange={event => change(field.key, event.target.value)} />
            <input id={`theme-${field.key}`} type="text" spellCheck={false} autoComplete="off" aria-invalid={!normalizeHex(draft[field.key])}
              value={draft[field.key]} maxLength={7} onChange={event => change(field.key, event.target.value)} onBlur={() => {
                const color = normalizeHex(draft[field.key]);
                if (color) change(field.key, color);
              }} />
          </div>
        </div>)}
        <p className="helper theme-contrast-note">Текст автоматически становится чёрным или белым — в зависимости от цвета под ним.</p>
        {!valid && <p className="error-text" role="alert">Укажите цвет в формате #A1B2C3 или выберите его в палитре.</p>}
      </div>
      <div className="theme-preview" style={themeStyle(preview)} aria-label="Предпросмотр цветовой гаммы">
        <div className="theme-preview-heading"><span>Ваш дневник</span><i style={{ background: preview.accent }} /></div>
        <div className="theme-preview-card">
          <span>Сегодня</span><strong>1 480 <small>ккал</small></strong>
          <div className="theme-preview-track"><i /></div>
          <div className="theme-preview-macros"><span>Белки <b>94 г</b></span><span>Жиры <b>48 г</b></span><span>Углеводы <b>168 г</b></span></div>
          <span className="theme-preview-button" style={{ color: contrastText(preview.accent) }}>+ Добавить запись</span>
        </div>
        <p>Предпросмотр</p>
      </div>
    </div>
    <div className="theme-settings-actions">
      <button className="text-button" type="button" onClick={() => { setDraft({ ...DEFAULT_THEME }); setSavedMessage(false); }}><RotateCcw size={15} />По умолчанию</button>
      <span className="theme-save-status" role="status">{savedMessage ? <><Check size={15} />Цвета сохранены</> : dirty ? "Есть изменения" : ""}</span>
      <button className="button primary" type="button" disabled={disabled || !valid || !dirty} onClick={() => { if (onSave(sanitizeTheme(draft))) setSavedMessage(true); }}><Check size={16} />Применить</button>
    </div>
  </section>;
}
