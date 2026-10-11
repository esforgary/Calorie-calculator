import { useState } from "react";
import type { FormEvent } from "react";
import { Activity, Bike, Dumbbell, Footprints, Waves } from "lucide-react";
import { ACTIVITY_INTENSITIES, ACTIVITY_KINDS, activityDefinition, activityStats, activityValidationError, isStepActivity } from "./activity";
import type { ActivityKind, Profile, WalkEntry } from "./types";
import "./activity.css";

export function ActivityIcon({ kind = "walk", size = 22 }: { kind?: ActivityKind; size?: number }) {
  const icons = { walk: Footprints, running: Activity, dumbbells: Dumbbell, cycling: Bike, gym: Dumbbell, swimming: Waves };
  if (kind === "basketball" || kind === "tennis") return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      {kind === "basketball" ? <><path d="M3 12h18M12 3v18M5.6 5.6c7 2 11 6 12.8 12.8M18.4 5.6c-7 2-11 6-12.8 12.8" /></> : <><path d="M5 6.4c5.5 2.3 5.5 8.9 0 11.2M19 6.4c-5.5 2.3-5.5 8.9 0 11.2" /></>}
    </svg>
  );
  const Icon = icons[kind];
  return <Icon size={size} aria-hidden="true" />;
}

export function ActivityForm({ profile, date, onSave, onCancel, initialKind = "walk" }: {
  profile: Profile;
  date: string;
  onSave: (entry: WalkEntry) => void;
  onCancel: () => void;
  initialKind?: ActivityKind;
}) {
  const [kind, setKind] = useState<ActivityKind>(initialKind);
  const [minutes, setMinutes] = useState("30");
  const [weight, setWeight] = useState(profile.configured && Number.isFinite(profile.weight) ? String(profile.weight) : "");
  const [steps, setSteps] = useState("");
  const [distance, setDistance] = useState("");
  const [pace, setPace] = useState<WalkEntry["pace"]>("moderate");
  const [time, setTime] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  });
  const [error, setError] = useState("");
  const definition = activityDefinition(kind);
  const hasSteps = isStepActivity(kind);
  const canEstimateDistance = kind === "walk" && profile.configured && Number.isFinite(profile.stride) && profile.stride > 0;
  const estimatedDistance = canEstimateDistance ? Number(steps) * profile.stride / 1000 : 0;
  const entry: WalkEntry = {
    id: "", kind, date, time, pace, minutes: Number(minutes), weight: Number(weight),
    steps: hasSteps ? Number(steps) : 0,
    distance: hasSteps ? (distance.trim() === "" ? estimatedDistance : Number(distance)) : 0,
  };
  const validation = activityValidationError(entry);
  const estimate = activityStats(entry);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (validation) { setError(validation); return; }
    setError("");
    onSave({ ...entry, id: crypto.randomUUID() });
  }
  return (
    <form className="form-stack activity-form" onSubmit={submit} noValidate>
      <fieldset className="activity-picker">
        <legend>Вид активности</legend>
        <div className="activity-type-grid">
          {ACTIVITY_KINDS.map(value => (
            <button type="button" className={`activity-type${kind === value ? " selected" : ""}`} aria-pressed={kind === value} key={value} onClick={() => { setKind(value); setError(""); }}>
              <ActivityIcon kind={value} /><span>{activityDefinition(value).label}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <div className="activity-fields">
        <label className="field"><span>Длительность, мин</span><input className="input" type="number" inputMode="decimal" min="1" max="600" step="any" value={minutes} onChange={e => setMinutes(e.target.value)} required /></label>
        <label className="field"><span>Время начала</span><input className="input" type="time" value={time} onChange={e => setTime(e.target.value)} required /></label>
        <label className="field"><span>Ваш вес, кг</span><input className="input" type="number" inputMode="decimal" min="30" max="350" step="any" value={weight} onChange={e => setWeight(e.target.value)} placeholder="Введите вес" required /></label>
      </div>
      {!profile.configured && <p className="helper">Для этой записи нужен только вес. Остальные параметры можно заполнить позже.</p>}
      <fieldset className="activity-picker">
        <legend>Интенсивность</legend>
        <div className="activity-intensity-grid">
          {ACTIVITY_INTENSITIES.map(value => (
            <button className={`activity-intensity${pace === value ? " selected" : ""}`} type="button" aria-pressed={pace === value} key={value} onClick={() => setPace(value)}>
              <strong>{definition.intensity[value].label}</strong><small>{definition.intensity[value].detail}</small>
            </button>
          ))}
        </div>
      </fieldset>
      {hasSteps && <div className="activity-step-fields">
        <label className="field"><span>Шаги, если считали</span><input className="input" type="number" inputMode="numeric" min="0" max="100000" step="1" value={steps} onChange={e => setSteps(e.target.value)} placeholder="Необязательно" /></label>
        <label className="field"><span>Расстояние, км</span><input className="input" type="number" inputMode="decimal" min="0" max="300" step="any" value={distance} onChange={e => setDistance(e.target.value)} placeholder={canEstimateDistance && estimatedDistance > 0 ? `≈ ${estimatedDistance.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} по шагам` : "Необязательно"} /></label>
        <p className="helper">Шаги попадут в дневной итог.{canEstimateDistance ? " Без введённого расстояния рассчитаем его по вашей длине шага." : " Шаги и расстояние можно оставить пустыми."}</p>
      </div>}
      <div className="activity-estimate" aria-live="polite" aria-atomic="true">
        <span>Примерный расход</span>
        <strong>{validation ? "—" : `≈ ${estimate.active.toLocaleString("ru-RU")}`} <small>активных ккал</small></strong>
        <p>{validation ? "Укажите длительность и вес" : `Всего за ${minutes} мин: ≈ ${estimate.gross.toLocaleString("ru-RU")} ккал, включая расход в покое`}</p>
      </div>
      <p className="helper activity-estimate-note">Расчёт по времени, весу и нагрузке. Запись не увеличивает лимит питания. Указывайте время занятия без долгих перерывов. <a href={definition.source} target="_blank" rel="noreferrer">Источник оценок</a></p>
      {error && <p className="error-text" role="alert">{error}</p>}
      <div className="form-actions"><button className="button secondary" type="button" onClick={onCancel}>Отмена</button><button className="button primary" type="submit">Записать активность</button></div>
    </form>
  );
}
