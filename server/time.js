// Fuso do salão. O Brasil não tem horário de verão desde 2019: São Paulo é sempre UTC−3.
// ponytail: deslocamento fixo; se o horário de verão voltar, trocar por Intl.DateTimeFormat com timeZone.
const OFFSET_MIN = 180;

/** 'YYYY-MM-DD' + minutos do dia (hora de São Paulo) → Date (UTC). */
export function spDate(day, min) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, min + OFFSET_MIN));
}

/** Date → dia, minutos do dia e dia da semana em São Paulo. */
export function spParts(date) {
  const t = new Date(date.getTime() - OFFSET_MIN * 60e3);
  return { day: t.toISOString().slice(0, 10), min: t.getUTCHours() * 60 + t.getUTCMinutes(), weekday: t.getUTCDay() };
}

export const weekdayOf = (day) => new Date(`${day}T12:00:00Z`).getUTCDay();
export const addDays = (day, n) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86400e3).toISOString().slice(0, 10);
export const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s)) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`));
export const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
