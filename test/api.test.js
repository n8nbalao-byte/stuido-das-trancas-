// Integração contra um MariaDB/MySQL descartável (TEST_DATABASE_URL). O banco é apagado e recriado.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mysql from 'mysql2/promise';

const url = process.env.TEST_DATABASE_URL;
const skip = url ? false : 'TEST_DATABASE_URL não definido';
const PASSWORD = 'senha-de-teste-123';
let server, base, q, closeDb, expireHolds, tx;
const s = {}; // estado compartilhado entre os testes, que rodam em sequência

async function call(method, route, body, cookie = s.admin) {
  const res = await fetch(base + route, {
    method,
    headers: { cookie: cookie ?? '', ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: (res.headers.get('content-type') ?? '').includes('json') ? await res.json() : null, res };
}

/** Próxima sexta-feira (08–20) com pelo menos 2 dias de folga. */
function nextFriday() {
  const d = new Date(Date.now() + 2 * 86400e3);
  while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
const book = (serviceId, start, phone, name = 'Cliente Teste') =>
  call('POST', '/api/bookings', { serviceId, start, name, phone, acceptRules: true, consent: true }, null);

before(async () => {
  if (skip) return;
  const u = new URL(url);
  const dbName = u.pathname.slice(1);
  const root = await mysql.createConnection({ uri: `${u.protocol}//${u.username}:${u.password}@${u.host}/` });
  await root.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
  await root.query(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await root.end();
  process.env.DATABASE_URL = url;
  process.env.NODE_ENV = 'test';
  await (await import('../server/migrate.js')).migrate(url);
  ({ q, closeDb, tx } = await import('../server/db.js'));
  ({ expireHolds } = await import('../server/booking.js'));
  const { hashPassword } = await import('../server/auth.js');
  await q("UPDATE staff SET email = 'mariana@teste.com', password_hash = ? WHERE id = 1", [await hashPassword(PASSWORD)]);
  const [boho] = await q("SELECT id FROM services WHERE slug = 'boho-braids'");
  s.boho = boho.id;
  await q('INSERT INTO staff_skills (staff_id, service_id) VALUES (1,?),(2,?),(3,?)', [s.boho, s.boho, s.boho]);
  await q("INSERT INTO app_settings (name, value) VALUES ('pix', ?)", [JSON.stringify({ type: 'ALEATORIA', key: '123e4567-e89b-12d3-a456-426614174000', name: 'Mariana Teste', city: 'Campinas' })]);
  const { app } = await import('../server/app.js');
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  s.day = nextFriday();
  s.start = new Date(`${s.day}T11:00:00.000Z`).toISOString(); // 08:00 em São Paulo
});

after(async () => {
  server?.close();
  await closeDb?.();
});

test('catálogo: 45 serviços com preços reais; sem duração ou sem trancista = só WhatsApp', { skip }, async () => {
  const { body } = await call('GET', '/api/services');
  assert.equal(body.length, 45);
  const boho = body.find((x) => x.slug === 'boho-braids');
  assert.equal(boho.priceCents, 58000);
  assert.equal(boho.bookable, true);
  assert.equal(body.find((x) => x.slug === 'nago').bookable, false, 'duração pendente');
  assert.equal(body.find((x) => x.slug === 'faux-locs').bookable, false, 'sem profissional habilitada');
  assert.equal(body.find((x) => x.slug === 'goddess-braids').variants.length, 2);
});

test('disponibilidade: sexta tem 08:00 para um serviço de 8 h', { skip }, async () => {
  const month = await call('GET', `/api/availability?service=${s.boho}&month=${s.day.slice(0, 7)}`);
  assert.ok(month.body.days[s.day] > 0);
  const day = await call('GET', `/api/availability?service=${s.boho}&day=${s.day}`);
  assert.equal(day.body.slots[0].time, '08:00');
  assert.equal(day.body.slots.at(-1).time, '12:00');
});

test('reserva grava preço, sinal 30% e saldo, e gera o Pix com valor exato', { skip }, async () => {
  const r = await book(s.boho, s.start, '(19) 98888-0001');
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.status, 'awaiting_payment');
  assert.equal(r.body.totalCents, 58000);
  assert.equal(r.body.depositCents, 17400);
  assert.equal(r.body.balanceCents, 40600);
  assert.match(r.body.pixPayload, /^000201/);
  assert.ok(r.body.pixPayload.includes('5406174.00'));
  assert.ok(r.body.pixPayload.includes(`STD${r.body.code}`));
  s.a1 = r.body.code;
  assert.equal((await call('GET', `/api/bookings/${s.a1}?phone=19988880002`)).status, 404, 'telefone errado não acha');
  assert.equal((await call('GET', `/api/bookings/${s.a1}?phone=19988880001`)).body.code, s.a1);
});

test('capacidade: 3 profissionais = 3 reservas no mesmo horário; a quarta é recusada', { skip }, async () => {
  s.a2 = (await book(s.boho, s.start, '19988880002')).body.code;
  s.a3 = (await book(s.boho, s.start, '19988880003')).body.code;
  assert.ok(s.a2 && s.a3);
  const fourth = await book(s.boho, s.start, '19988880004');
  assert.equal(fourth.status, 409);
});

test('cliente informa pagamento: não confirma o horário', { skip }, async () => {
  const r = await call('POST', `/api/bookings/${s.a1}/paid`, { phone: '19988880001' }, null);
  assert.equal(r.body.status, 'proof_submitted');
  const [msg] = await q("SELECT phone FROM notification_queue WHERE kind = 'admin'");
  assert.equal(msg.phone, '19988651935', 'aviso vai para a Mariana');
});

test('painel exige login', { skip }, async () => {
  assert.equal((await call('GET', '/api/admin/dashboard', null, null)).status, 401);
  assert.equal((await call('POST', '/api/auth/login', { email: 'mariana@teste.com', password: 'errada' }, null)).status, 401);
  const ok = await call('POST', '/api/auth/login', { email: 'mariana@teste.com', password: PASSWORD }, null);
  assert.equal(ok.status, 200);
  s.admin = ok.res.headers.getSetCookie()[0].split(';')[0];
  assert.equal((await call('GET', '/api/admin/dashboard')).status, 200);
});

test('Mariana confere o Pix e aprova com trancista; sobreposição na mesma trancista é bloqueada', { skip }, async () => {
  const id = async (code) => (await q('SELECT id FROM appointments WHERE code = ?', [code]))[0].id;
  s.id1 = await id(s.a1);
  s.id2 = await id(s.a2);
  assert.equal((await call('POST', `/api/admin/appointments/${s.id1}/approve`, { staffId: 2 })).status, 409, 'sem pagamento conferido não aprova');
  assert.equal((await call('POST', `/api/admin/appointments/${s.id1}/confirm-payment`, {})).body.status, 'awaiting_approval');
  const cands = (await call('GET', `/api/admin/appointments/${s.id1}/candidates`)).body;
  assert.deepEqual(cands.map((c) => c.free), [true, true, true]);
  const ok = await call('POST', `/api/admin/appointments/${s.id1}/approve`, { staffId: 2 });
  assert.equal(ok.body.status, 'confirmed');
  assert.equal(ok.body.staff_id, 2);
  const rem = await q("SELECT COUNT(*) n FROM notification_queue WHERE appointment_id = ? AND kind = 'reminder' AND status = 'pending'", [s.id1]);
  assert.ok(rem[0].n >= 1, 'lembretes agendados');

  await call('POST', `/api/admin/appointments/${s.id2}/confirm-payment`, {});
  assert.equal((await call('POST', `/api/admin/appointments/${s.id2}/approve`, { staffId: 2 })).status, 409, 'Leide já ocupada');
  assert.equal((await call('POST', `/api/admin/appointments/${s.id2}/approve`, { staffId: 3 })).body.status, 'confirmed');
});

test('mudar o preço não altera reservas já feitas e registra histórico', { skip }, async () => {
  const [svc] = await q('SELECT * FROM services WHERE id = ?', [s.boho]);
  const r = await call('PUT', `/api/admin/services/${s.boho}`, { ...svc, price_cents: 60000, active: true });
  assert.equal(r.status, 200);
  const [a] = await q('SELECT total_cents, deposit_cents FROM appointments WHERE id = ?', [s.id1]);
  assert.deepEqual([a.total_cents, a.deposit_cents], [58000, 17400]);
  const hist = (await call('GET', `/api/admin/services/${s.boho}/history`)).body;
  assert.equal(hist[0].field, 'price_cents');
  assert.equal(hist[0].new_value, '60000');
});

test('cancelar exige motivo e cancela os lembretes pendentes', { skip }, async () => {
  assert.equal((await call('POST', `/api/admin/appointments/${s.id1}/cancel`, {})).status, 400);
  assert.equal((await call('POST', `/api/admin/appointments/${s.id1}/cancel`, { reason: 'Cliente desistiu' })).body.status, 'cancelled');
  const [rem] = await q("SELECT COUNT(*) n FROM notification_queue WHERE appointment_id = ? AND kind = 'reminder' AND status = 'pending'", [s.id1]);
  assert.equal(rem.n, 0);
});

test('reserva não paga expira e libera o horário', { skip }, async () => {
  await q("UPDATE appointments SET hold_expires_at = ? WHERE code = ?", [new Date(Date.now() - 60e3), s.a3]);
  await tx(expireHolds);
  const [a] = await q('SELECT status FROM appointments WHERE code = ?', [s.a3]);
  assert.equal(a.status, 'expired');
  const day = await call('GET', `/api/availability?service=${s.boho}&day=${s.day}`);
  assert.equal(day.body.slots[0].time, '08:00');
});

test('cliente aceita horário alternativo sugerido (com revalidação)', { skip }, async () => {
  const b = await book(s.boho, s.start, '19988880005');
  const id = (await q('SELECT id FROM appointments WHERE code = ?', [b.body.code]))[0].id;
  await call('POST', `/api/bookings/${b.body.code}/paid`, { phone: '19988880005' }, null);
  await call('POST', `/api/admin/appointments/${id}/confirm-payment`, {});
  const later = new Date(new Date(s.start).getTime() + 2 * 3600e3).toISOString(); // 10:00
  assert.equal((await call('POST', `/api/admin/appointments/${id}/propose`, { start: later, staffId: 3 })).status, 409, 'Jhennifer ocupada até 16:00');
  assert.equal((await call('POST', `/api/admin/appointments/${id}/propose`, { start: later, staffId: 1 })).body.status, 'alternative_proposed');
  const acc = await call('POST', `/api/bookings/${b.body.code}/accept`, { phone: '19988880005' }, null);
  assert.equal(acc.body.status, 'confirmed');
  assert.equal(new Date(acc.body.startAt).toISOString(), later);
});

test('loja: produto com estoque, pedido reserva, pagamento vira venda, estoque nunca negativo', { skip }, async () => {
  const created = await call('POST', '/api/admin/products', { name: 'Jumbo Teste', category: 'Jumbos', price_cents: 2500, stock_qty: 5, active: true });
  assert.equal(created.status, 201);
  const pid = created.body.id;
  const [v] = await q('SELECT id FROM product_variants WHERE product_id = ?', [pid]);
  const pub = (await call('GET', '/api/products', null, null)).body.find((p) => p.id === pid);
  assert.equal(pub.variants[0].available, 5);

  const order = (items, phone = '19977770001') => call('POST', '/api/orders', { items, name: 'Compradora', phone, consent: true }, null);
  assert.equal((await order([{ variantId: v.id, qty: 6 }])).status, 409, 'mais que o estoque');
  const o1 = await order([{ variantId: v.id, qty: 2 }]);
  assert.equal(o1.status, 201);
  assert.equal(o1.body.totalCents, 5000);
  assert.match(o1.body.text, /Jumbo Teste/);
  const avail = async () => (await call('GET', '/api/products', null, null)).body.find((p) => p.id === pid).variants[0].available;
  assert.equal(await avail(), 3, 'reserva tira do disponível');
  const row = async () => (await q('SELECT stock_qty, reserved_qty FROM product_variants WHERE id = ?', [v.id]))[0];

  assert.equal((await call('POST', `/api/admin/product-variants/${v.id}/stock`, { delta: -4, reason: 'perda' })).status, 409, 'saída não come a reserva');
  const id1 = (await q('SELECT id FROM orders WHERE code = ?', [o1.body.code]))[0].id;
  assert.equal((await call('POST', `/api/admin/orders/${id1}/status`, { status: 'paid' })).status, 200);
  assert.deepEqual(await row(), { stock_qty: 3, reserved_qty: 0 }, 'pago = venda');
  assert.equal((await call('POST', `/api/admin/orders/${id1}/status`, { status: 'awaiting_payment' })).status, 409, 'pago não volta');
  assert.equal((await call('POST', `/api/admin/orders/${id1}/status`, { status: 'cancelled', reason: 'Devolvido' })).status, 200);
  assert.deepEqual(await row(), { stock_qty: 5, reserved_qty: 0 }, 'cancelar pago devolve ao estoque');

  const o2 = await order([{ variantId: v.id, qty: 1 }], '19977770002');
  const id2 = (await q('SELECT id FROM orders WHERE code = ?', [o2.body.code]))[0].id;
  await call('POST', `/api/admin/orders/${id2}/status`, { status: 'cancelled', reason: 'Desistiu' });
  assert.deepEqual(await row(), { stock_qty: 5, reserved_qty: 0 }, 'cancelar não pago libera a reserva');
  const [mv] = await q("SELECT COUNT(*) n FROM stock_movements WHERE variant_id = ? AND kind IN ('venda','devolucao')", [v.id]);
  assert.equal(mv.n, 2);
});

test('limites anti-abuso: 3 pedidos em aberto por telefone; pedido abandonado expira e libera a reserva', { skip }, async () => {
  const [v] = await q("SELECT v.id FROM product_variants v JOIN products p ON p.id = v.product_id WHERE p.name = 'Jumbo Teste'");
  const order = () => call('POST', '/api/orders', { items: [{ variantId: v.id, qty: 1 }], name: 'Abusada', phone: '19966660000', consent: true }, null);
  for (let i = 0; i < 3; i++) assert.equal((await order()).status, 201);
  assert.equal((await order()).status, 429);
  await q("UPDATE orders SET created_at = ? WHERE status = 'created'", [new Date(Date.now() - 49 * 3600e3)]);
  const { expireOrders } = await import('../server/store.js');
  await tx(expireOrders);
  const [row] = await q('SELECT reserved_qty FROM product_variants WHERE id = ?', [v.id]);
  assert.equal(row.reserved_qty, 0);
});
