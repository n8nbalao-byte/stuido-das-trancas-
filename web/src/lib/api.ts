export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = opts.method ?? (opts.body === undefined ? 'GET' : 'POST');
  const res = await fetch(`/api${path}`, {
    cache: 'no-store',
    method,
    headers: opts.body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? 'Erro inesperado. Tente novamente.');
  return data as T;
}

export type Variant = { id: number; name: string; priceCents: number; durationMin: number | null };
export type Service = {
  id: number; slug: string; name: string; category: string; description: string | null; instructions: string | null;
  priceCents: number | null; priceType: 'fixed' | 'from'; durationMin: number | null; durationNote: string | null; photoUrl: string | null;
  variants: Variant[]; bookable: boolean;
};
export type Product = {
  id: number; slug: string; name: string; category: string; description: string | null; photoUrl: string | null;
  variants: { id: number; name: string; priceCents: number; available: number }[];
};
export type Site = {
  salon: { name: string; whatsapp: string; address: string; reference: string };
  holdMinutes: number; pixConfigured: boolean; hours: { weekday: number; open: number; close: number }[]; rules: string[];
};
export type Booking = {
  code: string; status: string; service: string; startAt: string; endAt: string; durationMin: number; priceType: string;
  totalCents: number; depositCents: number; balanceCents: number; holdExpiresAt: string | null; paymentStatus: string;
  txid: string; pixPayload: string | null; pixName: string | null; proposedStartAt: string | null; customerRequest: string | null;
  staffName: string | null; customerName: string;
};

const TZ = 'America/Sao_Paulo';
export const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const fmtDate = (s: string) => new Date(s).toLocaleDateString('pt-BR', { timeZone: TZ, weekday: 'long', day: '2-digit', month: 'long' });
export const fmtShort = (s: string) => new Date(s).toLocaleDateString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit' });
export const fmtTime = (s: string) => new Date(s).toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
export const fmtDateTime = (s: string) => new Date(s).toLocaleString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export const todaySP = () => new Date().toLocaleDateString('sv-SE', { timeZone: TZ });
export const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
export const toMin = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
export function fmtDuration(min: number | null, note?: string | null) {
  if (note) return note;
  if (!min) return 'Duração a confirmar';
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`;
}
/** "R$ 470,00", "A partir de R$ 280,00" ou "R$ 150,00 ou R$ 270,00". */
export function priceLabel(s: Pick<Service, 'priceCents' | 'priceType' | 'variants'>) {
  if (s.variants.length) return [...new Set(s.variants.map((v) => money(v.priceCents)))].join(' ou ');
  if (s.priceCents == null) return 'Preço a confirmar';
  return s.priceType === 'from' ? `A partir de ${money(s.priceCents)}` : money(s.priceCents);
}
export const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const waLink = (phone: string, text?: string) => `https://wa.me/55${phone}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
export const fmtPhone = (p: string) => p.replace(/^(\d{2})(\d{4,5})(\d{4})$/, '($1) $2-$3');

export const CATEGORIES = ['Fulani Braids', 'Box Braids', 'Nagô', 'Goddess Braids', 'French Braids', 'Faux Locs', 'Twist', 'Entrelace', 'Boho Braids', 'Rabo de cavalo', 'Tiarinha', 'Kids', 'Outros'];
const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const CAT_IMG: Record<string, string> = { 'Fulani Braids': 'fulani', 'Goddess Braids': 'goddess', 'French Braids': 'french', 'Boho Braids': 'boho' };
/** Foto do serviço; sem foto, a imagem da categoria (web/public/img/cat-*.webp); sem ela, a estampa da marca (CSS). */
export const serviceImage = (s: Pick<Service, 'photoUrl' | 'category'>) => s.photoUrl || `/img/cat-${CAT_IMG[s.category] ?? slug(s.category)}.webp`;

export const STATUS: Record<string, string> = {
  awaiting_payment: 'Aguardando pagamento do sinal',
  proof_submitted: 'Pagamento informado — em conferência',
  awaiting_approval: 'Pagamento confirmado — aguardando aprovação da Mariana',
  alternative_proposed: 'Novo horário sugerido',
  confirmed: 'Confirmado',
  completed: 'Concluído',
  cancelled: 'Cancelado',
  no_show: 'Não compareceu',
  expired: 'Reserva expirada',
};
export const STATUS_TONE: Record<string, string> = {
  awaiting_payment: 'warn', proof_submitted: 'info', awaiting_approval: 'info', alternative_proposed: 'warn',
  confirmed: 'ok', completed: 'muted', cancelled: 'danger', no_show: 'danger', expired: 'muted',
};

export const ORDER_STATUS: Record<string, string> = {
  created: 'Pedido criado', awaiting_confirmation: 'Aguardando confirmação', awaiting_payment: 'Pagamento pendente',
  paid: 'Pago', preparing: 'Preparando', ready: 'Disponível para retirada', delivered: 'Entregue', cancelled: 'Cancelado',
};
export const ORDER_TONE: Record<string, string> = {
  created: 'warn', awaiting_confirmation: 'warn', awaiting_payment: 'warn', paid: 'info', preparing: 'info', ready: 'ok', delivered: 'muted', cancelled: 'danger',
};
