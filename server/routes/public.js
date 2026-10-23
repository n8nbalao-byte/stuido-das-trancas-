import { Router } from 'express';
import { createBooking, customerAction, daySlots, loadAppointment, loadContext, loadItem } from '../booking.js';
import { q, tx } from '../db.js';
import { fail, limit, text } from '../http.js';
import { RULES } from '../notify.js';
import { getSettings, normalizePhone } from '../settings.js';
import { addDays, isDay, spParts } from '../time.js';

const r = Router();
const MAX_DAYS_AHEAD = 90;

const publicService = (s, variants, skilled) => ({
  id: s.id, slug: s.slug, name: s.name, category: s.category, description: s.description, instructions: s.instructions,
  priceCents: s.price_cents, priceType: s.price_type, durationMin: s.duration_min, durationNote: s.duration_note, photoUrl: s.photo_url,
  variants: variants.filter((v) => v.service_id === s.id).map((v) => ({ id: v.id, name: v.name, priceCents: v.price_cents, durationMin: v.duration_min })),
  // Agendamento online só com duração e ao menos uma profissional habilitada; senão, WhatsApp.
  bookable: skilled.has(s.id) && (s.duration_min != null || variants.some((v) => v.service_id === s.id && v.duration_min != null)),
});

async function catalog() {
  const services = await q('SELECT * FROM services WHERE active = 1 ORDER BY sort, name');
  const variants = await q('SELECT * FROM service_variants WHERE active = 1 ORDER BY sort');
  const skilled = new Set((await q('SELECT DISTINCT k.service_id FROM staff_skills k JOIN staff s ON s.id = k.staff_id AND s.active = 1')).map((x) => x.service_id));
  return services.map((s) => publicService(s, variants, skilled));
}

r.get('/site', async (req, res) => {
  const s = await getSettings();
  const hours = await q('SELECT weekday, open_min AS open, close_min AS close FROM business_hours ORDER BY weekday');
  res.json({ salon: s.salon, holdMinutes: s.holdMinutes, pixConfigured: !!s.pix.key, hours, rules: RULES });
});

r.get('/services', async (req, res) => res.json(await catalog()));

r.get('/services/:slug', async (req, res) => {
  const s = (await catalog()).find((x) => x.slug === req.params.slug);
  if (!s) fail(404, 'Serviço não encontrado.');
  res.json(s);
});

/** ?service&variant&month=YYYY-MM → dias com vaga; ?service&variant&day=YYYY-MM-DD → horários. */
r.get('/availability', async (req, res) => {
  const item = await loadItem(q, Number(req.query.service), req.query.variant);
  if (!item.block) return res.json({ manual: true, days: {}, slots: [] });
  const today = spParts(new Date()).day;
  const last = addDays(today, MAX_DAYS_AHEAD);
  if (req.query.day) {
    const day = String(req.query.day);
    if (!isDay(day) || day < today || day > last) return res.json({ slots: [] });
    const ctx = await loadContext(q, item.service.id, day, day);
    return res.json({ slots: daySlots(ctx, day, item.block) });
  }
  const month = String(req.query.month ?? '');
  if (!/^\d{4}-\d{2}$/.test(month)) fail(400, 'Mês inválido.');
  const from = `${month}-01` < today ? today : `${month}-01`;
  let to = addDays(`${addDays(`${month}-28`, 4).slice(0, 7)}-01`, -1); // último dia do mês
  if (to > last) to = last;
  const days = {};
  if (from <= to) {
    const ctx = await loadContext(q, item.service.id, from, to);
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const n = daySlots(ctx, d, item.block).length;
      if (n) days[d] = n;
    }
  }
  res.json({ days });
});

const shape = (a, s) => ({
  code: a.code, status: a.status, service: a.service_name, startAt: a.start_at, endAt: a.end_at,
  durationMin: a.price_snapshot.durationMin, priceType: a.price_snapshot.priceType,
  totalCents: a.total_cents, depositCents: a.deposit_cents, balanceCents: a.balance_cents,
  holdExpiresAt: a.hold_expires_at, paymentStatus: a.payment_status, txid: a.txid,
  pixPayload: ['awaiting_payment', 'expired'].includes(a.status) ? a.pix_payload : null,
  pixName: s.pix.name || null,
  proposedStartAt: a.proposed_start_at, customerRequest: a.customer_request,
  staffName: a.status === 'confirmed' || a.status === 'completed' ? a.staff_name : null,
  customerName: a.customer_name,
});

r.post('/bookings', limit(6, 3600e3), async (req, res) => {
  const b = req.body ?? {};
  const name = text(b.name, 'nome', { min: 2, max: 120 });
  const phone = normalizePhone(b.phone);
  if (!phone) fail(400, 'Informe um WhatsApp válido com DDD.');
  if (!b.acceptRules) fail(400, 'É preciso aceitar as regras de atendimento.');
  if (!b.consent) fail(400, 'É preciso autorizar o uso dos dados para o agendamento.');
  const a = await tx((t) => createBooking(t, { serviceId: Number(b.serviceId), variantId: b.variantId, start: b.start, name, phone }));
  res.status(201).json(shape(a, await getSettings()));
});

async function findByCode(code, rawPhone) {
  const phone = normalizePhone(rawPhone);
  const [row] = await q('SELECT a.id FROM appointments a JOIN customers c ON c.id = a.customer_id WHERE a.code = ? AND c.phone = ?', [String(code ?? '').toUpperCase(), phone ?? '']);
  if (!row) fail(404, 'Não encontramos uma solicitação com esse código e telefone.');
  return row.id;
}

r.get('/bookings/:code', limit(30, 600e3), async (req, res) => {
  const id = await findByCode(req.params.code, req.query.phone);
  res.json(shape(await loadAppointment(q, id), await getSettings()));
});

r.post('/bookings/:code/:action', limit(20, 600e3), async (req, res) => {
  const id = await findByCode(req.params.code, req.body?.phone);
  await tx(async (t) => customerAction(t, await loadAppointment(t, id), req.params.action, req.body));
  res.json(shape(await loadAppointment(q, id), await getSettings()));
});

export default r;
