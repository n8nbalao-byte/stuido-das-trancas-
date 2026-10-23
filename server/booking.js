// Agendamento com banco: carrega expediente, jornadas, competências, folgas e ocupação, e aplica as regras de slots.js.
// Toda escrita que ocupa a agenda trava as linhas de `staff` (SELECT … FOR UPDATE): reservas simultâneas viram fila.
import { randomInt } from 'node:crypto';
import { fail } from './http.js';
import { cancelReminders, enqueue, msg, scheduleReminders } from './notify.js';
import { brCode } from './pix.js';
import { getSettings } from './settings.js';
import { freeSlots, MAX_PARALLEL, splitDeposit, staffFree } from './slots.js';
import { addDays, spDate, spParts, weekdayOf } from './time.js';

// Status que ocupam capacidade da agenda.
export const ACTIVE = ['awaiting_payment', 'proof_submitted', 'awaiting_approval', 'confirmed', 'alternative_proposed'];

/** Serviço (+ opção) com preço e duração efetivos. */
export async function loadItem(run, serviceId, variantId) {
  const [service] = await run('SELECT * FROM services WHERE id = ? AND active = 1', [serviceId]);
  if (!service) fail(404, 'Serviço não encontrado.');
  const variants = await run('SELECT * FROM service_variants WHERE service_id = ? AND active = 1 ORDER BY sort', [service.id]);
  let variant = null;
  if (variants.length) {
    variant = variants.find((v) => v.id === Number(variantId));
    if (!variant) fail(400, 'Escolha uma das opções do serviço.');
  }
  const price = variant ? variant.price_cents : service.price_cents;
  const duration = variant ? variant.duration_min : service.duration_min;
  return {
    service, variant, price, duration,
    block: duration ? duration + service.buffer_min : null,
    name: variant ? `${service.name} — ${variant.name}` : service.name,
  };
}

/** Ocupação e folgas num intervalo [from, to), sem o atendimento `excludeId`. */
async function loadBusy(run, from, to, excludeId = 0) {
  const rows = await run(
    `SELECT id, status, staff_id, start_at, end_at, hold_expires_at, proposed_start_at, proposed_end_at, proposed_staff_id
     FROM appointments WHERE status IN (?) AND id <> ?
       AND ((start_at < ? AND end_at > ?) OR (proposed_start_at < ? AND proposed_end_at > ?))`,
    [ACTIVE, excludeId, to, from, to, from],
  );
  const now = new Date();
  const busy = [];
  for (const r of rows) {
    if (r.status === 'awaiting_payment' && !(r.hold_expires_at > now)) continue; // reserva expirada libera o horário
    if (r.status === 'alternative_proposed') busy.push({ staffId: r.proposed_staff_id, start: r.proposed_start_at, end: r.proposed_end_at });
    else busy.push({ staffId: r.status === 'confirmed' ? r.staff_id : null, start: r.start_at, end: r.end_at });
  }
  const off = (await run('SELECT staff_id, starts_at, ends_at FROM staff_time_off WHERE starts_at < ? AND ends_at > ?', [to, from]))
    .map((o) => ({ staffId: o.staff_id, start: o.starts_at, end: o.ends_at }));
  return { busy, off };
}

/** Tudo o que a agenda precisa para os dias [fromDay, toDay]. serviceId = null: todas as profissionais ativas. */
export async function loadContext(run, serviceId, fromDay, toDay, excludeId = 0) {
  const business = new Map((await run('SELECT * FROM business_hours')).map((b) => [b.weekday, { open: b.open_min, close: b.close_min }]));
  const hours = await run(
    `SELECT h.*, s.name FROM staff_hours h JOIN staff s ON s.id = h.staff_id AND s.active = 1
     ${serviceId ? 'JOIN staff_skills k ON k.staff_id = h.staff_id AND k.service_id = ?' : ''}`,
    serviceId ? [serviceId] : [],
  );
  const staffByWeekday = new Map();
  for (const h of hours) {
    const list = staffByWeekday.get(h.weekday) ?? [];
    list.push({ id: h.staff_id, name: h.name, start: h.start_min, end: h.end_min, breakStart: h.break_start_min, breakEnd: h.break_end_min });
    staffByWeekday.set(h.weekday, list);
  }
  const { busy, off } = await loadBusy(run, spDate(fromDay, 0), spDate(addDays(toDay, 1), 0), excludeId);
  return { business, staffByWeekday, busy, off };
}

export function daySlots(ctx, day, block, now = new Date()) {
  const wd = weekdayOf(day);
  return freeSlots({ day, block, business: ctx.business.get(wd), staff: ctx.staffByWeekday.get(wd) ?? [], busy: ctx.busy, off: ctx.off, now });
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const newCode = () => Array.from({ length: 6 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('');
const lockAgenda = (run) => run('SELECT id FROM staff FOR UPDATE');

/** Cria a solicitação: revalida o horário no servidor, grava o preço do momento e gera o Pix do sinal. */
export async function createBooking(run, { serviceId, variantId, start, name, phone }) {
  await lockAgenda(run);
  const item = await loadItem(run, serviceId, variantId);
  if (!item.duration) fail(409, 'Este serviço ainda não tem duração definida. Fale com o salão pelo WhatsApp.');
  if (item.price == null) fail(409, 'Este serviço ainda não tem preço definido. Fale com o salão pelo WhatsApp.');
  const S = new Date(start);
  if (Number.isNaN(S.getTime())) fail(400, 'Horário inválido.');
  const { day } = spParts(S);
  const ctx = await loadContext(run, item.service.id, day, day);
  if (!daySlots(ctx, day, item.block).some((s) => s.start === S.toISOString())) fail(409, 'Esse horário acabou de ser ocupado. Escolha outro, por favor.');

  // Um telefone não segura a agenda com várias reservas: no máximo 2 solicitações em andamento.
  const [open] = await run(
    `SELECT COUNT(*) n FROM appointments a JOIN customers c ON c.id = a.customer_id
     WHERE c.phone = ? AND (a.status IN ('proof_submitted','awaiting_approval','alternative_proposed') OR (a.status = 'awaiting_payment' AND a.hold_expires_at > ?))`,
    [phone, new Date()]);
  if (open.n >= 2) fail(429, 'Você já tem solicitações em andamento. Acompanhe em "Minha solicitação" ou fale com o salão pelo WhatsApp.');

  const s = await getSettings(run);
  const { deposit, balance } = splitDeposit(item.price);
  await run('INSERT INTO customers (name, phone, consent_at) VALUES (?,?,?) ON DUPLICATE KEY UPDATE name = VALUES(name), consent_at = VALUES(consent_at)', [name, phone, new Date()]);
  const [customer] = await run('SELECT id FROM customers WHERE phone = ?', [phone]);
  const snapshot = {
    service: item.service.name, variant: item.variant?.name ?? null, category: item.service.category,
    priceCents: item.price, priceType: item.variant ? 'fixed' : item.service.price_type,
    durationMin: item.duration, bufferMin: item.service.buffer_min, blockMin: item.block,
  };
  const E = new Date(S.getTime() + item.block * 60e3);
  const hold = new Date(Date.now() + s.holdMinutes * 60e3);
  let code;
  for (let i = 0; ; i++) {
    code = newCode();
    const [dup] = await run('SELECT 1 FROM appointments WHERE code = ?', [code]);
    if (!dup) break;
    if (i > 5) fail(500, 'Não foi possível gerar o código. Tente de novo.');
  }
  const r = await run(
    `INSERT INTO appointments (code, customer_id, service_id, variant_id, start_at, end_at, status, total_cents, deposit_cents, balance_cents, price_snapshot, hold_expires_at)
     VALUES (?,?,?,?,?,?,'awaiting_payment',?,?,?,?,?)`,
    [code, customer.id, item.service.id, item.variant?.id ?? null, S, E, item.price, deposit, balance, JSON.stringify(snapshot), hold],
  );
  const txid = `STD${code}`;
  const payload = s.pix.key ? brCode({ key: s.pix.key, amountCents: deposit, name: s.pix.name, city: s.pix.city, txid }) : null;
  await run('INSERT INTO payments (appointment_id, amount_cents, txid, pix_payload) VALUES (?,?,?,?)', [r.insertId, deposit, txid, payload]);
  await run("INSERT INTO appointment_events (appointment_id, type, to_status) VALUES (?, 'created', 'awaiting_payment')", [r.insertId]);
  const a = await loadAppointment(run, r.insertId);
  await enqueue(run, { key: `created-${a.id}`, kind: 'created', appointmentId: a.id, phone: a.phone, body: msg.created(a, s) });
  return a;
}

/** Atendimento com nomes de cliente, serviço e trancista (para telas e mensagens). */
export async function loadAppointment(run, id) {
  const [a] = await run(
    `SELECT a.*, c.name AS customer_name, c.phone, st.name AS staff_name, st.phone AS staff_phone,
            ps.name AS proposed_staff_name, p.status AS payment_status, p.txid, p.pix_payload, p.declared_at, p.confirmed_at,
            JSON_UNQUOTE(JSON_EXTRACT(a.price_snapshot, '$.service')) AS service_base,
            JSON_UNQUOTE(JSON_EXTRACT(a.price_snapshot, '$.variant')) AS variant_name
     FROM appointments a JOIN customers c ON c.id = a.customer_id
     LEFT JOIN staff st ON st.id = a.staff_id LEFT JOIN staff ps ON ps.id = a.proposed_staff_id
     LEFT JOIN payments p ON p.appointment_id = a.id WHERE a.id = ?`, [id]);
  if (!a) fail(404, 'Agendamento não encontrado.');
  a.service_name = a.variant_name && a.variant_name !== 'null' ? `${a.service_base} — ${a.variant_name}` : a.service_base;
  if (typeof a.price_snapshot === 'string') a.price_snapshot = JSON.parse(a.price_snapshot);
  return a;
}

/**
 * A profissional pode atender esse atendimento em [S, E)? Habilitada no serviço, dentro da jornada, sem folga,
 * sem outro atendimento dela no intervalo e respeitando o limite de simultâneos. Lança 409 com o motivo.
 */
export async function assertAssignable(run, a, staffId, S, E) {
  const [skill] = await run('SELECT 1 FROM staff_skills k JOIN staff s ON s.id = k.staff_id AND s.active = 1 WHERE k.staff_id = ? AND k.service_id = ?', [staffId, a.service_id]);
  if (!skill) fail(409, 'Essa profissional não está habilitada para este serviço (veja Equipe → Competências).');
  const { day, weekday } = spParts(S);
  const [h] = await run('SELECT * FROM staff_hours WHERE staff_id = ? AND weekday = ?', [staffId, weekday]);
  if (!h) fail(409, 'A profissional não trabalha nesse dia.');
  const ctx = await loadContext(run, null, day, day, a.id);
  const p = { id: staffId, start: h.start_min, end: h.end_min, breakStart: h.break_start_min, breakEnd: h.break_end_min };
  if (!staffFree(p, S, E, ctx)) fail(409, 'A profissional não está livre nesse horário (jornada, pausa, folga ou outro atendimento).');
  const overlapping = ctx.busy.filter((b) => b.start < E && b.end > S).length;
  if (overlapping >= MAX_PARALLEL) fail(409, `Já há ${MAX_PARALLEL} atendimentos nesse horário.`);
}

/** Profissionais habilitadas e livres para o atendimento no horário dado (tela de aprovação). */
export async function candidates(run, a, S, E) {
  const { day, weekday } = spParts(S);
  const ctx = await loadContext(run, a.service_id, day, day, a.id);
  const full = ctx.busy.filter((b) => b.start < E && b.end > S).length >= MAX_PARALLEL;
  return (ctx.staffByWeekday.get(weekday) ?? []).map((p) => ({ id: p.id, name: p.name, free: !full && staffFree(p, S, E, ctx) }));
}

const event = (run, a, type, to, reason, staffId) =>
  run('INSERT INTO appointment_events (appointment_id, type, from_status, to_status, reason, staff_id) VALUES (?,?,?,?,?,?)', [a.id, type, a.status, to, reason ?? null, staffId ?? null]);

const need = (a, ...statuses) => { if (!statuses.includes(a.status)) fail(409, 'Essa ação não vale para o status atual do agendamento.'); };

/** Ações da cliente (código + telefone já conferidos). */
export async function customerAction(run, a, action, body = {}) {
  const s = await getSettings(run);
  if (action === 'paid') {
    need(a, 'awaiting_payment', 'expired');
    const late = a.status === 'expired';
    await run("UPDATE appointments SET status = 'proof_submitted' WHERE id = ?", [a.id]);
    await run("UPDATE payments SET status = 'declared', declared_at = ? WHERE appointment_id = ? AND status = 'pending'", [new Date(), a.id]);
    await event(run, a, 'payment_declared', 'proof_submitted', late ? 'Pagamento informado depois do prazo da reserva: conferir horário manualmente.' : null);
    await enqueue(run, { key: `declared-${a.id}-${Date.now()}`, kind: 'admin', appointmentId: a.id, phone: s.adminPhone, body: msg.declared(a) });
    return;
  }
  if (action === 'accept') {
    need(a, 'alternative_proposed');
    await lockAgenda(run);
    const S = new Date(a.proposed_start_at), E = new Date(a.proposed_end_at);
    await assertAssignable(run, a, a.proposed_staff_id, S, E).catch(() => fail(409, 'Esse horário sugerido não está mais disponível. Fale com o salão pelo WhatsApp.'));
    await run("UPDATE appointments SET status = 'confirmed', start_at = ?, end_at = ?, staff_id = proposed_staff_id, proposed_start_at = NULL, proposed_end_at = NULL, proposed_staff_id = NULL WHERE id = ?", [S, E, a.id]);
    await event(run, a, 'alternative_accepted', 'confirmed');
    await afterConfirm(run, a.id, s);
    return;
  }
  if (action === 'cancel' || action === 'reschedule') {
    need(a, 'awaiting_payment', 'proof_submitted', 'awaiting_approval', 'alternative_proposed', 'confirmed');
    const text = String(body.message ?? '').trim().slice(0, 300);
    const label = action === 'cancel' ? 'Cancelamento' : 'Remarcação';
    await run('UPDATE appointments SET customer_request = ? WHERE id = ?', [`${label}${text ? `: ${text}` : ''}`, a.id]);
    await event(run, a, `request_${action}`, a.status, text || null);
    await enqueue(run, { key: `req-${action}-${a.id}-${Date.now()}`, kind: 'admin', appointmentId: a.id, phone: s.adminPhone, body: msg.customerRequest(a, action, text) });
    return;
  }
  fail(404, 'Ação desconhecida.');
}

async function afterConfirm(run, id, s) {
  const a = await loadAppointment(run, id);
  await cancelReminders(run, a.id);
  const tag = new Date(a.start_at).toISOString();
  await enqueue(run, { key: `confirmed-${a.id}-${tag}`, kind: 'confirmed', appointmentId: a.id, phone: a.phone, body: msg.confirmed(a, s) });
  await enqueue(run, { key: `staff-${a.id}-${a.staff_id}-${tag}`, kind: 'staff', appointmentId: a.id, phone: a.staff_phone, body: msg.staffAssigned(a) });
  await scheduleReminders(run, a, s);
}

/** Ações da Mariana no painel. */
export async function adminAction(run, a, action, body, staff) {
  const s = await getSettings(run);
  const reason = body.reason ? String(body.reason).trim().slice(0, 500) : null;
  const by = staff.id;
  const timeAndStaff = async (keepTime = false) => {
    const S = new Date(keepTime ? a.start_at : body.start);
    if (Number.isNaN(S.getTime())) fail(400, 'Horário inválido.');
    const E = new Date(S.getTime() + a.price_snapshot.blockMin * 60e3);
    const staffId = Number(body.staffId);
    if (!staffId) fail(400, 'Escolha a profissional.');
    await lockAgenda(run);
    await assertAssignable(run, a, staffId, S, E);
    return { S, E, staffId };
  };

  switch (action) {
    case 'confirm-payment': {
      need(a, 'proof_submitted', 'awaiting_payment', 'expired');
      await run("UPDATE payments SET status = 'confirmed', confirmed_by = ?, confirmed_at = ? WHERE appointment_id = ?", [by, new Date(), a.id]);
      await run("UPDATE appointments SET status = 'awaiting_approval', hold_expires_at = NULL WHERE id = ?", [a.id]);
      await event(run, a, 'payment_confirmed', 'awaiting_approval', reason, by);
      await enqueue(run, { key: `paid-${a.id}`, kind: 'payment', appointmentId: a.id, phone: a.phone, body: msg.paymentConfirmed(a) });
      return;
    }
    case 'reject-payment': {
      need(a, 'proof_submitted');
      await run("UPDATE payments SET status = 'pending', declared_at = NULL WHERE appointment_id = ?", [a.id]);
      await run("UPDATE appointments SET status = 'awaiting_payment', hold_expires_at = ? WHERE id = ?", [new Date(Date.now() + s.holdMinutes * 60e3), a.id]);
      await event(run, a, 'payment_rejected', 'awaiting_payment', reason, by);
      await enqueue(run, { key: `payrej-${a.id}-${Date.now()}`, kind: 'payment', appointmentId: a.id, phone: a.phone, body: msg.paymentRejected(a, s, reason) });
      return;
    }
    case 'approve': {
      need(a, 'awaiting_approval');
      const { staffId } = await timeAndStaff(true);
      await run("UPDATE appointments SET status = 'confirmed', staff_id = ? WHERE id = ?", [staffId, a.id]);
      await event(run, a, 'approved', 'confirmed', reason, by);
      await afterConfirm(run, a.id, s);
      return;
    }
    case 'propose': {
      need(a, 'awaiting_approval', 'alternative_proposed');
      const { S, E, staffId } = await timeAndStaff();
      await run("UPDATE appointments SET status = 'alternative_proposed', proposed_start_at = ?, proposed_end_at = ?, proposed_staff_id = ? WHERE id = ?", [S, E, staffId, a.id]);
      await event(run, a, 'alternative_proposed', 'alternative_proposed', reason, by);
      await enqueue(run, { key: `proposed-${a.id}-${S.toISOString()}`, kind: 'proposed', appointmentId: a.id, phone: a.phone, body: msg.proposed({ ...a, proposed_start_at: S }) });
      return;
    }
    case 'reschedule': {
      need(a, 'confirmed');
      if (!reason) fail(400, 'Informe o motivo da remarcação.');
      const { S, E, staffId } = await timeAndStaff();
      await run('UPDATE appointments SET start_at = ?, end_at = ?, staff_id = ?, customer_request = NULL WHERE id = ?', [S, E, staffId, a.id]);
      await event(run, a, 'rescheduled', 'confirmed', `${reason} (antes: ${new Date(a.start_at).toISOString()})`, by);
      const b = await loadAppointment(run, a.id);
      await cancelReminders(run, a.id);
      await enqueue(run, { key: `resched-${a.id}-${S.toISOString()}`, kind: 'rescheduled', appointmentId: a.id, phone: b.phone, body: msg.rescheduled(b) });
      await scheduleReminders(run, b, s);
      return;
    }
    case 'cancel':
    case 'reject':
    case 'no-show': {
      if (action === 'no-show') need(a, 'confirmed'); else need(a, ...ACTIVE, 'expired');
      if (!reason) fail(400, 'Informe o motivo.');
      const to = action === 'no-show' ? 'no_show' : 'cancelled';
      await run('UPDATE appointments SET status = ?, customer_request = NULL WHERE id = ?', [to, a.id]);
      await event(run, a, action === 'reject' ? 'rejected' : action === 'no-show' ? 'no_show' : 'cancelled', to, reason, by);
      await cancelReminders(run, a.id);
      if (action !== 'no-show') await enqueue(run, { key: `cancel-${a.id}`, kind: 'cancelled', appointmentId: a.id, phone: a.phone, body: msg.cancelled(a, s, reason) });
      return;
    }
    case 'late': {
      need(a, 'confirmed');
      if (!reason) fail(400, 'Descreva o atraso.');
      await event(run, a, 'late', a.status, reason, by);
      return;
    }
    case 'complete': {
      need(a, 'confirmed');
      await run("UPDATE appointments SET status = 'completed' WHERE id = ?", [a.id]);
      await event(run, a, 'completed', 'completed', reason, by);
      return;
    }
    case 'resolve-request': {
      await run('UPDATE appointments SET customer_request = NULL WHERE id = ?', [a.id]);
      await event(run, a, 'request_resolved', a.status, reason, by);
      return;
    }
    case 'note': {
      if (!reason) fail(400, 'Escreva a observação.');
      await event(run, a, 'note', a.status, reason, by);
      return;
    }
    default:
      fail(404, 'Ação desconhecida.');
  }
}

/** Reservas não pagas no prazo expiram e liberam o horário. */
export async function expireHolds(run) {
  const rows = await run("SELECT id, status FROM appointments WHERE status = 'awaiting_payment' AND hold_expires_at < ?", [new Date()]);
  for (const a of rows) {
    const r = await run("UPDATE appointments SET status = 'expired' WHERE id = ? AND status = 'awaiting_payment'", [a.id]);
    if (r.affectedRows) await event(run, a, 'expired', 'expired', 'Sinal não informado dentro do prazo da reserva.');
  }
}
