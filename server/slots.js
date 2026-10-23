// Disponibilidade da agenda, sem banco (testável). Os dados chegam prontos de booking.js.
import { hhmm, spDate, spParts } from './time.js';

export const MAX_PARALLEL = 3;
export const STEP_MIN = 30;
export const MIN_LEAD_MIN = 60;

const overlaps = (a, b) => a.start < b.end && a.end > b.start;

/**
 * A profissional `p` (jornada do dia: start, end, breakStart, breakEnd em minutos) pode atender o bloco [S, E)?
 * busy: [{ staffId|null, start, end }] já excluindo o próprio atendimento; off: folgas/bloqueios.
 */
export function staffFree(p, S, E, { busy, off }) {
  const s = spParts(S).min;
  const e = s + (E - S) / 60e3;
  if (s < p.start || e > p.end) return false;
  if (p.breakStart != null && s < p.breakEnd && e > p.breakStart) return false;
  const block = { start: S, end: E };
  if (off.some((o) => o.staffId === p.id && overlaps(o, block))) return false;
  return !busy.some((b) => b.staffId === p.id && overlaps(b, block));
}

/**
 * O bloco [S, E) cabe? Exige uma profissional habilitada e livre que sobre depois de reservar uma para cada
 * solicitação ainda sem trancista no mesmo intervalo, e no máximo MAX_PARALLEL atendimentos simultâneos.
 * ponytail: contagem gulosa (não é emparelhamento completo); a aprovação da Mariana revalida por profissional.
 */
export function fits(S, E, { staff, busy, off }) {
  const block = { start: S, end: E };
  const ov = busy.filter((b) => overlaps(b, block));
  if (ov.length >= MAX_PARALLEL) return false;
  const free = staff.filter((p) => staffFree(p, S, E, { busy: ov, off }));
  const unassigned = ov.filter((b) => b.staffId == null).length;
  return free.length - unassigned > 0;
}

/**
 * Horários de início livres num dia.
 * business: { open, close } (minutos) ou null se fechado; staff: jornadas do dia das profissionais habilitadas.
 */
export function freeSlots({ day, block, business, staff, busy, off, now = new Date() }) {
  if (!business || !block || !staff.length) return [];
  const out = [];
  const earliest = now.getTime() + MIN_LEAD_MIN * 60e3;
  for (let s = business.open; s + block <= business.close; s += STEP_MIN) {
    const S = spDate(day, s);
    if (S.getTime() < earliest) continue;
    const E = new Date(S.getTime() + block * 60e3);
    if (fits(S, E, { staff, busy, off })) out.push({ start: S.toISOString(), time: hhmm(s) });
  }
  return out;
}

/** Sinal de 30% e saldo em centavos inteiros; a soma sempre fecha com o total. */
export function splitDeposit(totalCents) {
  const deposit = Math.round((totalCents * 30) / 100);
  return { deposit, balance: totalCents - deposit };
}
