import { useEffect, useState } from "react";
import { Check, Palette, Pencil, RotateCcw, Save, Trash2, X } from "lucide-react";
import { contrastText, DEFAULT_THEME, normalizeHex, sanitizeTheme, themeStyle } from "./theme";
import type { ThemeColors } from "./theme";
import type { SavedThemePreset } from "./types";

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

export function ThemeSettings({ value, onSave, customPresets = [], onPresetsChange, disabled = false }: {
  value?: ThemeColors;
  onSave: (theme: ThemeColors) => boolean;
  customPresets?: SavedThemePreset[];
  onPresetsChange: (update: (current: SavedThemePreset[]) => SavedThemePreset[]) => boolean;
  disabled?: boolean;
}) {
  const saved = sanitizeTheme(value);
  const [draft, setDraft] = useState<ThemeColors>(saved);
  const [savedMessage, setSavedMessage] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [presetError, setPresetError] = useState("");
  const [presetMessage, setPresetMessage] = useState("");
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
  const choose = (colors: ThemeColors) => {
    setDraft({ ...colors });
    setSavedMessage(false);
  };
  const validateName = (name: string, exceptId?: string) => {
    if (!name.trim() || name.trim().length > 40) return "Введите название от 1 до 40 символов.";
    if (customPresets.some(preset => preset.id !== exceptId && preset.name.trim().toLowerCase() === name.trim().toLowerCase())) return "Шаблон с таким названием уже есть. Выберите другое название.";
    return "";
  };
  const savePreset = () => {
    if (disabled || !valid) return;
    setPresetMessage("");
    const error = validateName(presetName);
    setPresetError(error);
    if (error) return;
    const preset: SavedThemePreset = { id: crypto.randomUUID(), name: presetName.trim(), colors: sanitizeTheme(draft) };
    if (onPresetsChange(current => [...current, preset])) {
      setPresetName("");
      setPresetMessage(`Шаблон «${preset.name}» сохранён`);
    }
  };
  const renamePreset = (id: string) => {
    if (disabled) return;
    setPresetMessage("");
    const error = validateName(editingName, id);
    setPresetError(error);
    if (error) return;
    if (onPresetsChange(current => current.map(preset => preset.id === id ? { ...preset, name: editingName.trim() } : preset))) {
      setEditingId(null);
      setPresetMessage("Название шаблона изменено");
    }
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
            onClick={() => choose(preset.value)}>
            <span className="theme-preset-dots" aria-hidden="true">{fields.map(field => <i key={field.key} style={{ background: preset.value[field.key] }} />)}</span>
            {preset.label}
          </button>)}
        </div>
        <div className="theme-custom-presets">
          <h3>Мои шаблоны</h3>
          <p className="helper">Выберите шаблон и нажмите «Применить».</p>
          {customPresets.length === 0 ? <p className="theme-presets-empty">Сохраните свои цвета — они появятся здесь.</p> : <ul className="theme-custom-list" aria-label="Сохранённые шаблоны темы">
            {customPresets.map(preset => <li key={preset.id}>
              {editingId === preset.id ? <form className="theme-preset-rename" onSubmit={event => { event.preventDefault(); renamePreset(preset.id); }}>
                <input autoFocus aria-label="Новое название шаблона" maxLength={40} value={editingName} disabled={disabled}
                  onChange={event => { setEditingName(event.target.value); setPresetError(""); }} />
                <button type="submit" className="icon-button" disabled={disabled || !editingName.trim()} aria-label="Сохранить название"><Check size={16} /></button>
                <button type="button" className="icon-button" aria-label="Отменить переименование" onClick={() => { setEditingId(null); setPresetError(""); }}><X size={16} /></button>
              </form> : <div className="theme-custom-row">
                <button type="button" className="theme-preset" aria-pressed={fields.every(field => preview[field.key] === normalizeHex(preset.colors[field.key]))} onClick={() => choose(preset.colors)}>
                  <span className="theme-preset-dots" aria-hidden="true">{fields.map(field => <i key={field.key} style={{ background: preset.colors[field.key] }} />)}</span>
                  <span className="theme-preset-name">{preset.name}</span>
                </button>
                <button type="button" className="icon-button" disabled={disabled} aria-label={`Переименовать шаблон «${preset.name}»`} title="Переименовать" onClick={() => {
                  setEditingId(preset.id); setEditingName(preset.name); setDeletingId(null); setPresetError(""); setPresetMessage("");
                }}><Pencil size={15} /></button>
                <button type="button" className="icon-button" disabled={disabled} aria-label={`Удалить шаблон «${preset.name}»`} title="Удалить" onClick={() => {
                  setDeletingId(preset.id); setEditingId(null); setPresetError(""); setPresetMessage("");
                }}><Trash2 size={15} /></button>
              </div>}
              {deletingId === preset.id && <div className="theme-preset-confirm">
                <p>Удалить «{preset.name}»? Текущие цвета останутся.</p>
                <button type="button" className="text-button" onClick={() => setDeletingId(null)}>Отмена</button>
                <button type="button" className="button secondary" disabled={disabled} onClick={() => {
                  if (!disabled && onPresetsChange(current => current.filter(item => item.id !== preset.id))) { setDeletingId(null); setPresetMessage("Шаблон удалён"); }
                }}>Удалить шаблон</button>
              </div>}
            </li>)}
          </ul>}
          {editingId && presetError && <p className="error-text" role="alert">{presetError}</p>}
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
        <form className="theme-preset-save" onSubmit={event => { event.preventDefault(); savePreset(); }}>
          <label htmlFor="theme-preset-name">Сохранить эти цвета как шаблон</label>
          <div>
            <input id="theme-preset-name" placeholder="Название шаблона" maxLength={40} value={presetName} disabled={disabled}
              onChange={event => { setPresetName(event.target.value); setPresetError(""); setPresetMessage(""); }} />
            <button type="submit" className="button secondary" disabled={disabled || !valid || !presetName.trim()}><Save size={16} />Сохранить шаблон</button>
          </div>
        </form>
        {!editingId && presetError && <p className="error-text" role="alert">{presetError}</p>}
        <p className="theme-preset-status" role="status">{presetMessage}</p>
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
