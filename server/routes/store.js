import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import { requireAdmin } from '../auth.js';
import { q, tx } from '../db.js';
import { fail, int, limit, text } from '../http.js';
import { normalizePhone } from '../settings.js';
import { adjustStock, createOrder, loadOrder, orderText, setOrderStatus } from '../store.js';

const r = Router();
export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || 'uploads');

const publicProduct = (p, variants) => ({
  id: p.id, slug: p.slug, name: p.name, category: p.category, description: p.description, photoUrl: p.photo_url,
  variants: variants.filter((v) => v.product_id === p.id).map((v) => ({ id: v.id, name: v.name, priceCents: v.price_cents, available: Math.max(0, v.stock_qty - v.reserved_qty) })),
});

async function catalog() {
  const products = await q('SELECT * FROM products WHERE active = 1 ORDER BY sort, name');
  const variants = await q('SELECT * FROM product_variants WHERE active = 1 ORDER BY sort, id');
  return products.map((p) => publicProduct(p, variants)).filter((p) => p.variants.length);
}

r.get('/products', async (req, res) => res.json(await catalog()));

r.get('/products/:slug', async (req, res) => {
  const p = (await catalog()).find((x) => x.slug === req.params.slug);
  if (!p) fail(404, 'Produto não encontrado.');
  res.json(p);
});

r.post('/orders', limit(10, 3600e3), async (req, res) => {
  const b = req.body ?? {};
  const name = text(b.name, 'nome', { min: 2, max: 120 });
  const phone = normalizePhone(b.phone);
  if (!phone) fail(400, 'Informe um WhatsApp válido com DDD.');
  if (!b.consent) fail(400, 'É preciso autorizar o uso dos dados para o pedido.');
  const o = await tx((t) => createOrder(t, { items: b.items, name, phone, delivery: b.delivery, notes: text(b.notes, 'observação', { optional: true, max: 500 }) }));
  res.status(201).json({ code: o.code, totalCents: o.total_cents, text: orderText(o, o.items) });
});

// ---- Painel -------------------------------------------------------------------------------------------------------

r.use('/admin', requireAdmin);

r.get('/admin/products', async (req, res) => {
  const products = await q('SELECT * FROM products ORDER BY sort, name');
  const variants = await q('SELECT * FROM product_variants ORDER BY sort, id');
  res.json(products.map((p) => ({ ...p, variants: variants.filter((v) => v.product_id === p.id) })));
});

const slugify = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
const productFields = (b) => ({
  name: text(b.name, 'nome', { max: 120 }),
  category: text(b.category, 'categoria', { max: 40 }),
  description: text(b.description, 'descrição', { optional: true, max: 2000 }),
  photo_url: text(b.photo_url, 'foto', { optional: true, max: 300 }),
  active: b.active ? 1 : 0,
});

r.post('/admin/products', async (req, res) => {
  const f = productFields(req.body ?? {});
  const id = await tx(async (t) => {
    const x = await t('INSERT INTO products SET ?, slug = ?', [f, `${slugify(f.name)}-${Date.now().toString(36)}`]);
    // Variação inicial: o produto já nasce vendável quando a Mariana informa preço e estoque.
    const price = int(req.body.price_cents ?? 0, 'preço', 0, 10_000_000);
    const stock = int(req.body.stock_qty ?? 0, 'estoque', 0, 100000);
    const v = await t("INSERT INTO product_variants (product_id, name, price_cents) VALUES (?, 'Padrão', ?)", [x.insertId, price]);
    if (stock) await adjustStock(t, v.insertId, stock, 'Estoque inicial', req.staff.id);
    return x.insertId;
  });
  res.status(201).json({ id });
});

r.put('/admin/products/:id', async (req, res) => {
  const r2 = await q('UPDATE products SET ? WHERE id = ?', [productFields(req.body ?? {}), Number(req.params.id)]);
  if (!r2.affectedRows) fail(404, 'Produto não encontrado.');
  res.json({ ok: true });
});

const variantFields = (b) => ({
  name: text(b.name, 'nome da variação', { max: 80 }),
  price_cents: int(b.price_cents, 'preço', 0, 10_000_000),
  active: b.active ? 1 : 0,
});

r.post('/admin/products/:id/variants', async (req, res) => {
  const v = await q('INSERT INTO product_variants SET ?, product_id = ?, sort = 9', [variantFields(req.body ?? {}), Number(req.params.id)]);
  res.status(201).json({ id: v.insertId });
});

r.put('/admin/product-variants/:id', async (req, res) => {
  await q('UPDATE product_variants SET ? WHERE id = ?', [variantFields(req.body ?? {}), Number(req.params.id)]);
  res.json({ ok: true });
});

r.post('/admin/product-variants/:id/stock', async (req, res) => {
  await tx((t) => adjustStock(t, Number(req.params.id), Number(req.body?.delta), text(req.body?.reason, 'motivo', { optional: true, max: 200 }), req.staff.id));
  res.json({ ok: true });
});

r.get('/admin/orders', async (req, res) => {
  const status = req.query.status ? String(req.query.status).split(',') : null;
  res.json(await q(
    `SELECT o.*, c.name AS customer_name, c.phone, (SELECT SUM(qty) FROM order_items i WHERE i.order_id = o.id) AS items
     FROM orders o JOIN customers c ON c.id = o.customer_id ${status ? 'WHERE o.status IN (?)' : ''} ORDER BY o.id DESC LIMIT 300`,
    status ? [status] : []));
});

r.get('/admin/orders/:id', async (req, res) => {
  const o = await loadOrder(q, Number(req.params.id));
  const events = await q('SELECT e.*, s.name AS staff_name FROM order_events e LEFT JOIN staff s ON s.id = e.staff_id WHERE e.order_id = ? ORDER BY e.id', [o.id]);
  res.json({ ...o, events });
});

r.post('/admin/orders/:id/status', async (req, res) => {
  await tx((t) => setOrderStatus(t, Number(req.params.id), String(req.body?.status), text(req.body?.reason, 'motivo', { optional: true, max: 500 }), req.staff.id));
  res.json({ ok: true });
});

// Foto enviada pelo painel (base64). Fica fora da pasta do deploy (UPLOAD_DIR), servida em /uploads.
const TYPES = [['jpg', [0xff, 0xd8, 0xff]], ['png', [0x89, 0x50, 0x4e, 0x47]], ['webp', [0x52, 0x49, 0x46, 0x46]]];
r.post('/admin/uploads', async (req, res) => {
  const m = /^data:image\/(?:jpeg|png|webp);base64,(.+)$/.exec(String(req.body?.data ?? ''));
  if (!m) fail(400, 'Envie uma imagem JPG, PNG ou WebP.');
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length > 4 * 1024 * 1024) fail(400, 'Imagem maior que 4 MB.');
  const type = TYPES.find(([, sig]) => sig.every((b, i) => buf[i] === b));
  if (!type) fail(400, 'Arquivo de imagem inválido.');
  await mkdir(UPLOAD_DIR, { recursive: true });
  const name = `${randomBytes(12).toString('hex')}.${type[0]}`;
  await writeFile(path.join(UPLOAD_DIR, name), buf);
  res.status(201).json({ url: `/uploads/${name}` });
});

export default r;
