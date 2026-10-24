'use client';
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api';

export type Line = { product_id: string; sku: string; name_ar: string; name_en: string; unit_price: number; list_price: number; quantity: number; line_total: number; stock_quantity: number; min_order_qty: number; image: string | null; issue: 'stock' | 'unavailable' | null };
export type Cart = { items: Line[]; subtotal: number };
type Ctx = { cart: Cart; setQty: (id: string, q: number) => Promise<void>; remove: (id: string) => Promise<void> };
const C = createContext<Ctx>(null!);
export const useCart = () => useContext(C);

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<Cart>({ items: [], subtotal: 0 });
  const refresh = useCallback(() => api<Cart>('/cart').then(setCart).catch(() => {}), []);
  useEffect(() => { refresh(); }, [refresh]);
  const setQty = async (id: string, q: number) => setCart(await api<Cart>(`/cart/items/${id}`, { method: 'PUT', body: JSON.stringify({ quantity: q }) }));
  const remove = async (id: string) => setCart(await api<Cart>(`/cart/items/${id}`, { method: 'DELETE' }));
  return <C.Provider value={{ cart, setQty, remove }}>{children}</C.Provider>;
}
