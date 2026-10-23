import { useSyncExternalStore } from 'react';

// Carrinho da loja guardado no aparelho (conveniência). O servidor confere preço e estoque ao fechar o pedido.
export type CartItem = { variantId: number; qty: number };
const KEY = 'studio:cart';
const listeners = new Set<() => void>();

function read(): CartItem[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; }
}
let items = read();

function save(next: CartItem[]) {
  items = next.filter((i) => i.qty > 0);
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* sem armazenamento: vale só nesta aba */ }
  listeners.forEach((l) => l());
}

export const cart = {
  add: (variantId: number, qty: number) => {
    const cur = items.find((i) => i.variantId === variantId);
    save(cur ? items.map((i) => (i.variantId === variantId ? { ...i, qty: i.qty + qty } : i)) : [...items, { variantId, qty }]);
  },
  set: (variantId: number, qty: number) => save(items.map((i) => (i.variantId === variantId ? { ...i, qty } : i))),
  clear: () => save([]),
};

export function useCart() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => items);
}
