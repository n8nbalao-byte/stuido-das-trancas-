import { Router } from 'express';
import { checkPassword, hashPassword, login, logout, publicStaff, requireAdmin } from '../auth.js';
import { adminAction, candidates, loadAppointment } from '../booking.js';
import { q, tx } from '../db.js';
import { fail, int, text } from '../http.js';
import { dispatch } from '../notify.js';
import { normalizePixKey, PIX_TYPES } from '../pix.js';
import { financialReport } from '../reports.js';
import { getSettings, normalizePhone, saveSetting } from '../settings.js';
import { addDays, isDay, spDate, spParts } from '../time.js';
import { connectionStatus, evolution, saveWhatsappConfig, sendWhatsapp, whatsappConfig, whatsappConfigured } from '../whatsapp.js';

const r = Router();

r.post('/auth/login', async (req, res) => res.json(await login(res, req.body?.email, req.body?.password)));
r.post('/auth/logout', async (req, res) => { await logout(req, res); res.json({ ok: true }); });
r.get('/auth/me', (req, res) => res.json(req.staff ? publicStaff(req.staff) : null));

r.post('/auth/password', async (req, res) => {
  if (!req.staff) fail(401, 'Faça login para continuar.');
  const next = String(req.body?.next ?? '');
  if (next.length < 10 || next.length > 200) fail(400, 'A nova senha precisa ter pelo menos 10 caracteres.');
  if (!(await checkPassword(String(req.body?.current ?? ''), req.staff.password_hash))) fail(400, 'Senha atual incorreta.');
  await q('UPDATE staff SET password_hash = ? WHERE id = ?', [await hashPassword(next), req.staff.id]);
  // Outras sessões abertas caem; esta continua (o cookie atual é recriado no próximo login).
  await q('DELETE FROM sessions WHERE staff_id = ? AND token_hash <> ?', [req.staff.id, req.sessionHash ?? '']);
  res.json({ ok: true });
});

r.use('/admin', requireAdmin);

const LIST_SQL = `SELECT a.id, a.code, a.status, a.start_at, a.end_at, a.total_cents, a.deposit_cents, a.balance_cents, a.hold_expires_at,
    a.customer_request, a.proposed_start_at, a.staff_id, st.name AS staff_name, st.color AS staff_color, c.name AS customer_name, c.phone,
    JSON_UNQUOTE(JSON_EXTRACT(a.price_snapshot, '$.service')) AS service, JSON_UNQUOTE(JSON_EXTRACT(a.price_snapshot, '$.variant')) AS variant,
    JSON_EXTRACT(a.price_snapshot, '$.durationMin') AS duration_min, p.status AS payment_status
  FROM appointments a JOIN customers c ON c.id = a.customer_id LEFT JOIN staff st ON st.id = a.staff_id
  LEFT JOIN payments p ON p.appointment_id = a.id`;

r.get('/admin/dashboard', async (req, res) => {
  const today = spParts(new Date()).day;
  const from = spDate(today, 0), to = spDate(addDays(today, 1), 0);
  const counts = Object.fromEntries((await q("SELECT status, COUNT(*) n FROM appointments WHERE status IN ('awaiting_payment','proof_submitted','awaiting_approval','alternative_proposed') GROUP BY status")).map((x) => [x.status, x.n]));
  const [orders] = await q("SELECT COUNT(*) n FROM orders WHERE status IN ('created','awaiting_confirmation','awaiting_payment')");
  counts.orders_open = orders.n;
  const s = await getSettings();
  const pending = [];
  const [noDuration] = await q('SELECT COUNT(*) n FROM services s WHERE active = 1 AND duration_min IS NULL AND NOT EXISTS (SELECT 1 FROM service_variants v WHERE v.service_id = s.id AND v.active = 1 AND v.duration_min IS NOT NULL)');
  const [noSkills] = await q('SELECT COUNT(*) n FROM services s WHERE active = 1 AND NOT EXISTS (SELECT 1 FROM staff_skills k WHERE k.service_id = s.id)');
  const [failed] = await q("SELECT COUNT(*) n FROM notification_queue WHERE status = 'failed'");
  if (!s.pix.key) pending.push({ text: 'Chave Pix não cadastrada: a cliente não consegue pagar o sinal.', to: '/admin/configuracoes' });
  if (noSkills.n) pending.push({ text: `${noSkills.n} serviço(s) sem profissional habilitada (não aparecem horários).`, to: '/admin/equipe' });
  if (noDuration.n) pending.push({ text: `${noDuration.n} serviço(s) sem duração: só pelo WhatsApp.`, to: '/admin/servicos' });
  if (!(await whatsappConfigured())) pending.push({ text: 'WhatsApp não configurado: as mensagens ficam na fila até conectar o número.', to: '/admin/notificacoes' });
  if (failed.n) pending.push({ text: `${failed.n} mensagem(ns) de WhatsApp com falha.`, to: '/admin/notificacoes' });
  res.json({
    counts,
    today: await q(`${LIST_SQL} WHERE a.start_at >= ? AND a.start_at < ? AND a.status IN ('confirmed','completed','no_show') ORDER BY a.start_at`, [from, to]),
    requests: await q(`${LIST_SQL} WHERE a.customer_request IS NOT NULL ORDER BY a.updated_at DESC LIMIT 20`),
    upcoming: await q(`${LIST_SQL} WHERE a.start_at >= ? AND a.status = 'confirmed' ORDER BY a.start_at LIMIT 8`, [to]),
    pending,
  });
});

/** Agenda: ?from=YYYY-MM-DD&to=YYYY-MM-DD&staff=id&status=a,b */
r.get('/admin/appointments', async (req, res) => {
  const where = [];
  const params = [];
  if (isDay(req.query.from)) { where.push('a.start_at >= ?'); params.push(spDate(String(req.query.from), 0)); }
  if (isDay(req.query.to)) { where.push('a.start_at < ?'); params.push(spDate(addDays(String(req.query.to), 1), 0)); }
  if (req.query.staff) { where.push('a.staff_id = ?'); params.push(Number(req.query.staff)); }
  if (req.query.status) { where.push('a.status IN (?)'); params.push(String(req.query.status).split(',')); }
  res.json(await q(`${LIST_SQL} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY a.start_at LIMIT 500`, params));
});

r.get('/admin/appointments/:id', async (req, res) => {
  const a = await loadAppointment(q, Number(req.params.id));
  const events = await q('SELECT e.*, s.name AS staff_name FROM appointment_events e LEFT JOIN staff s ON s.id = e.staff_id WHERE e.appointment_id = ? ORDER BY e.id', [a.id]);
  const messages = await q('SELECT id, kind, status, scheduled_for, sent_at, last_error FROM notification_queue WHERE appointment_id = ? ORDER BY id', [a.id]);
  res.json({ ...a, events, messages });
});

/** Profissionais habilitadas e livres para o atendimento: ?start=ISO (padrão: horário pedido). */
r.get('/admin/appointments/:id/candidates', async (req, res) => {
  const a = await loadAppointment(q, Number(req.params.id));
  const S = new Date(String(req.query.start ?? a.start_at));
  if (Number.isNaN(S.getTime())) fail(400, 'Horário inválido.');
  res.json(await candidates(q, a, S, new Date(S.getTime() + a.price_snapshot.blockMin * 60e3)));
});

r.post('/admin/appointments/:id/:action', async (req, res) => {
  const id = Number(req.params.id);
  await tx(async (t) => adminAction(t, await loadAppointment(t, id), req.params.action, req.body ?? {}, req.staff));
  res.json(await loadAppointment(q, id));
});

/** Relatório financeiro: ?from=YYYY-MM-DD&to=YYYY-MM-DD (até 1 ano). */
r.get('/admin/reports', async (req, res) => {
  const from = String(req.query.from ?? ''), to = String(req.query.to ?? '');
  if (!isDay(from) || !isDay(to) || to < from) fail(400, 'Período inválido.');
  if (Date.parse(to) - Date.parse(from) > 366 * 86400e3) fail(400, 'Escolha um período de até 1 ano.');
  res.json(await financialReport(q, from, to));
});

// ---- Serviços -------------------------------------------------------------------------------------------------

r.get('/admin/services', async (req, res) => {
  const services = await q('SELECT s.*, (SELECT COUNT(*) FROM staff_skills k WHERE k.service_id = s.id) AS staff_count FROM services s ORDER BY s.sort, s.name');
  const variants = await q('SELECT * FROM service_variants ORDER BY sort');
  res.json(services.map((s) => ({ ...s, variants: variants.filter((v) => v.service_id === s.id) })));
});

r.get('/admin/services/:id/history', async (req, res) => {
  res.json(await q('SELECT h.*, s.name AS staff_name, v.name AS variant_name FROM service_price_history h LEFT JOIN staff s ON s.id = h.staff_id LEFT JOIN service_variants v ON v.id = h.variant_id WHERE h.service_id = ? ORDER BY h.id DESC', [Number(req.params.id)]));
});

const optInt = (v, field, min, max) => (v === null || v === '' || v === undefined ? null : int(v, field, min, max));
const slugify = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90);
const TRACKED = ['price_cents', 'price_type', 'duration_min', 'active'];

function serviceFields(b) {
  return {
    name: text(b.name, 'nome', { max: 120 }),
    category: text(b.category, 'categoria', { max: 40 }),
    description: text(b.description, 'descrição', { optional: true, max: 2000 }),
    instructions: text(b.instructions, 'instruções', { optional: true, max: 2000 }),
    price_cents: optInt(b.price_cents, 'preço', 0, 10_000_000),
    price_type: b.price_type === 'from' ? 'from' : 'fixed',
    duration_min: optInt(b.duration_min, 'duração', 5, 720),
    duration_note: text(b.duration_note, 'observação da duração', { optional: true, max: 60 }),
    buffer_min: optInt(b.buffer_min, 'preparo', 0, 240) ?? 0,
    photo_url: text(b.photo_url, 'foto', { optional: true, max: 300 }),
    active: b.active ? 1 : 0,
  };
}

r.post('/admin/services', async (req, res) => {
  const f = serviceFields(req.body ?? {});
  const result = await q('INSERT INTO services SET ?, slug = ?, sort = 999', [f, `${slugify(f.name)}-${Date.now().toString(36)}`]);
  res.status(201).json({ id: result.insertId });
});

r.put('/admin/services/:id', async (req, res) => {
  const id = Number(req.params.id);
  const f = serviceFields(req.body ?? {});
  await tx(async (t) => {
    const [old] = await t('SELECT * FROM services WHERE id = ? FOR UPDATE', [id]);
    if (!old) fail(404, 'Serviço não encontrado.');
    await t('UPDATE services SET ? WHERE id = ?', [f, id]);
    // Histórico de preço/duração; reservas antigas guardam o próprio valor (price_snapshot) e não mudam.
    for (const k of TRACKED) {
      if (String(old[k] ?? '') !== String(f[k] ?? '')) await t('INSERT INTO service_price_history (service_id, field, old_value, new_value, staff_id) VALUES (?,?,?,?,?)', [id, k, old[k], f[k], req.staff.id]);
    }
  });
  res.json({ ok: true });
});

function variantFields(b) {
  return {
    name: text(b.name, 'nome da opção', { max: 80 }),
    price_cents: int(b.price_cents, 'preço', 0, 10_000_000),
    duration_min: optInt(b.duration_min, 'duração', 5, 720),
    sort: optInt(b.sort, 'ordem', 0, 999) ?? 0,
    active: b.active ? 1 : 0,
  };
}

r.post('/admin/services/:id/variants', async (req, res) => {
  const f = variantFields(req.body ?? {});
  const result = await q('INSERT INTO service_variants SET ?, service_id = ?', [f, Number(req.params.id)]);
  res.status(201).json({ id: result.insertId });
});

r.put('/admin/variants/:id', async (req, res) => {
  const id = Number(req.params.id);
  const f = variantFields(req.body ?? {});
  await tx(async (t) => {
    const [old] = await t('SELECT * FROM service_variants WHERE id = ? FOR UPDATE', [id]);
    if (!old) fail(404, 'Opção não encontrada.');
    await t('UPDATE service_variants SET ? WHERE id = ?', [f, id]);
    for (const k of ['price_cents', 'duration_min', 'active']) {
      if (String(old[k] ?? '') !== String(f[k] ?? '')) await t('INSERT INTO service_price_history (service_id, variant_id, field, old_value, new_value, staff_id) VALUES (?,?,?,?,?,?)', [old.service_id, id, k, old[k], f[k], req.staff.id]);
    }
  });
  res.json({ ok: true });
});

// ---- Equipe ---------------------------------------------------------------------------------------------------

r.get('/admin/staff', async (req, res) => {
  const staff = await q('SELECT id, name, phone, role, color, active, email FROM staff ORDER BY id');
  const hours = await q('SELECT * FROM staff_hours ORDER BY weekday');
  const skills = await q('SELECT * FROM staff_skills');
  const off = await q('SELECT * FROM staff_time_off WHERE ends_at > ? ORDER BY starts_at', [new Date()]);
  res.json(staff.map((s) => ({
    ...s,
    hours: hours.filter((h) => h.staff_id === s.id),
    skills: skills.filter((k) => k.staff_id === s.id).map((k) => k.service_id),
    timeOff: off.filter((o) => o.staff_id === s.id),
  })));
});

r.post('/admin/staff', async (req, res) => {
  const b = req.body ?? {};
  const name = text(b.name, 'nome', { max: 80 });
  const phone = b.phone ? normalizePhone(b.phone) : null;
  if (b.phone && !phone) fail(400, 'WhatsApp inválido.');
  const id = await tx(async (t) => {
    const result = await t("INSERT INTO staff (name, phone, color, role) VALUES (?,?,?,'trancista')", [name, phone, /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : '#5A1F3B']);
    // Jornada inicial = expediente do salão (editável depois); competências ficam vazias até a Mariana marcar.
    await t('INSERT INTO staff_hours (staff_id, weekday, start_min, end_min) SELECT ?, weekday, open_min, close_min FROM business_hours', [result.insertId]);
    return result.insertId;
  });
  res.status(201).json({ id });
});

r.put('/admin/staff/:id', async (req, res) => {
  const b = req.body ?? {};
  const phone = b.phone ? normalizePhone(b.phone) : null;
  if (b.phone && !phone) fail(400, 'WhatsApp inválido.');
  await q('UPDATE staff SET name = ?, phone = ?, color = ?, active = ? WHERE id = ?', [text(b.name, 'nome', { max: 80 }), phone, /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : '#5A1F3B', b.active ? 1 : 0, Number(req.params.id)]);
  res.json({ ok: true });
});

/** Jornada: [{ weekday, start, end, breakStart, breakEnd }] em minutos; dia ausente = não trabalha. */
r.put('/admin/staff/:id/hours', async (req, res) => {
  const id = Number(req.params.id);
  const rows = (Array.isArray(req.body) ? req.body : []).map((h) => {
    const row = [id, int(h.weekday, 'dia', 0, 6), int(h.start, 'início', 0, 1439), int(h.end, 'fim', 1, 1440), optInt(h.breakStart, 'pausa', 0, 1439), optInt(h.breakEnd, 'fim da pausa', 1, 1440)];
    if (row[3] <= row[2]) fail(400, 'O fim da jornada precisa ser depois do início.');
    if ((row[4] == null) !== (row[5] == null) || (row[4] != null && (row[5] <= row[4] || row[4] < row[2] || row[5] > row[3]))) fail(400, 'Pausa inválida: precisa estar dentro da jornada.');
    return row;
  });
  await tx(async (t) => {
    await t('DELETE FROM staff_hours WHERE staff_id = ?', [id]);
    if (rows.length) await t('INSERT INTO staff_hours (staff_id, weekday, start_min, end_min, break_start_min, break_end_min) VALUES ?', [rows]);
  });
  res.json({ ok: true });
});

r.put('/admin/staff/:id/skills', async (req, res) => {
  const id = Number(req.params.id);
  const ids = [...new Set((req.body?.serviceIds ?? []).map(Number).filter(Number.isInteger))];
  await tx(async (t) => {
    await t('DELETE FROM staff_skills WHERE staff_id = ?', [id]);
    if (ids.length) await t('INSERT INTO staff_skills (staff_id, service_id) VALUES ?', [ids.map((s) => [id, s])]);
  });
  res.json({ ok: true });
});

r.post('/admin/staff/:id/time-off', async (req, res) => {
  const b = req.body ?? {};
  const S = new Date(b.start), E = new Date(b.end);
  if (Number.isNaN(S.getTime()) || Number.isNaN(E.getTime()) || E <= S) fail(400, 'Período inválido.');
  await q('INSERT INTO staff_time_off (staff_id, starts_at, ends_at, reason) VALUES (?,?,?,?)', [Number(req.params.id), S, E, text(b.reason, 'motivo', { optional: true, max: 200 })]);
  res.status(201).json({ ok: true });
});

r.delete('/admin/time-off/:id', async (req, res) => {
  await q('DELETE FROM staff_time_off WHERE id = ?', [Number(req.params.id)]);
  res.json({ ok: true });
});

// ---- Configurações e mensagens -----------------------------------------------------------------------------------

r.get('/admin/settings', async (req, res) => {
  const hours = await q('SELECT weekday, open_min AS open, close_min AS close FROM business_hours ORDER BY weekday');
  res.json({ ...(await getSettings()), hours, whatsappConfigured: await whatsappConfigured() });
});

r.put('/admin/settings', async (req, res) => {
  const b = req.body ?? {};
  const salon = {
    name: text(b.salon?.name, 'nome do salão', { max: 80 }),
    whatsapp: normalizePhone(b.salon?.whatsapp) ?? fail(400, 'WhatsApp do salão inválido.'),
    address: text(b.salon?.address, 'endereço', { max: 200 }),
    reference: text(b.salon?.reference, 'referência', { optional: true, max: 120 }) ?? '',
  };
  let pix = { type: '', key: '', name: '', city: 'Campinas' };
  if (b.pix?.key) {
    if (!PIX_TYPES.includes(b.pix.type)) fail(400, 'Tipo de chave Pix inválido.');
    const key = normalizePixKey(b.pix.type, b.pix.key);
    if (!key) fail(400, 'Chave Pix inválida para o tipo escolhido.');
    pix = { type: b.pix.type, key, name: text(b.pix.name, 'nome do recebedor', { max: 60 }), city: text(b.pix.city, 'cidade', { max: 40 }) };
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(b.reminderTime))) fail(400, 'Horário do lembrete inválido.');
  const adminPhone = normalizePhone(b.adminPhone) ?? fail(400, 'WhatsApp da administração inválido.');
  const hold = int(b.holdMinutes, 'prazo da reserva', 10, 1440);
  const hours = (Array.isArray(b.hours) ? b.hours : []).map((h) => [int(h.weekday, 'dia', 0, 6), int(h.open, 'abertura', 0, 1439), int(h.close, 'fechamento', 1, 1440)]);
  if (hours.some((h) => h[2] <= h[1])) fail(400, 'Expediente: o fechamento precisa ser depois da abertura.');
  await saveSetting('salon', salon, req.staff.id);
  await saveSetting('pix', pix, req.staff.id);
  await saveSetting('holdMinutes', hold, req.staff.id);
  await saveSetting('reminderTime', b.reminderTime, req.staff.id);
  await saveSetting('adminPhone', adminPhone, req.staff.id);
  await tx(async (t) => {
    await t('DELETE FROM business_hours');
    if (hours.length) await t('INSERT INTO business_hours (weekday, open_min, close_min) VALUES ?', [hours]);
  });
  res.json({ ok: true });
});

r.get('/admin/notifications', async (req, res) => {
  res.json({
    configured: await whatsappConfigured(),
    items: await q('SELECT n.id, n.kind, n.phone, n.body, n.status, n.attempts, n.last_error, n.scheduled_for, n.sent_at, a.code FROM notification_queue n LEFT JOIN appointments a ON a.id = n.appointment_id ORDER BY n.id DESC LIMIT 200'),
  });
});

r.post('/admin/notifications/:id/retry', async (req, res) => {
  await q("UPDATE notification_queue SET status = 'pending', attempts = 0, scheduled_for = ? WHERE id = ? AND status IN ('failed','pending')", [new Date(), Number(req.params.id)]);
  await dispatch();
  res.json({ ok: true });
});

// ---- WhatsApp: a Mariana conecta o número sozinha (QR Code ou código de pareamento) ---------------------------------

r.get('/admin/whatsapp', async (req, res) => res.json(await connectionStatus()));

r.put('/admin/whatsapp', async (req, res) => {
  if ((await whatsappConfig())?.source === 'env') fail(409, 'A configuração vem das variáveis do servidor (EVOLUTION_*).');
  const url = String(req.body?.url ?? '').trim().replace(/\/+$/, '');
  const instance = String(req.body?.instance ?? '').trim();
  const key = String(req.body?.key ?? '').trim();
  if (!/^https:\/\/[^\s/]+/i.test(url) || url.length > 200) fail(400, 'Endereço da Evolution API inválido (comece com https://).');
  if (!/^[\p{L}\p{N} _-]{1,60}$/u.test(instance)) fail(400, 'Nome da instância inválido.');
  if (key.length > 200) fail(400, 'Chave grande demais.');
  if (!key && !(await whatsappConfig())?.key) fail(400, 'Informe a chave (apikey) da Evolution API.');
  await saveWhatsappConfig({ url, key, instance }, req.staff.id);
  res.json({ ok: true });
});

r.post('/admin/whatsapp/connect', async (req, res) => {
  let number = null;
  if (req.body?.method === 'code') {
    const phone = normalizePhone(req.body.phone);
    if (!phone) fail(400, 'Informe o celular do salão com DDD.');
    number = `55${phone}`;
  }
  const data = await evolution(`/instance/connect/{instance}${number ? `?number=${number}` : ''}`, { timeout: 30000 });
  const qr = typeof data?.base64 === 'string' && data.base64.startsWith('data:image/png;base64,') ? data.base64 : null;
  const pairingCode = typeof data?.pairingCode === 'string' ? data.pairingCode.replace(/[^A-Z0-9-]/gi, '').slice(0, 16) : null;
  if (!qr && !pairingCode) {
    if ((await connectionStatus()).state === 'open') return res.json({ state: 'open' });
    fail(502, 'A Evolution API não devolveu QR Code nem código. Tente de novo em alguns segundos.');
  }
  res.json({ qr: number ? null : qr, pairingCode: number ? pairingCode : null });
});

r.post('/admin/whatsapp/logout', async (req, res) => {
  await evolution('/instance/logout/{instance}', { method: 'DELETE' });
  res.json({ ok: true });
});

r.post('/admin/whatsapp/test', async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  if (!phone) fail(400, 'Informe um celular com DDD.');
  await sendWhatsapp(phone, 'Teste do Studio das Tranças: o WhatsApp do site está conectado. ✅');
  res.json({ ok: true });
});

r.post('/admin/notifications/dispatch', async (req, res) => { await dispatch(); res.json({ ok: true }); });

export default r;
