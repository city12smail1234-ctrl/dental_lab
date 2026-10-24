/** "Gloves ×2, Burs ×1 +1" - what an order contains, in one short line. */
export function itemsSummary(items: { name_ar: string; name_en: string; quantity: number }[] | undefined, lang: 'ar' | 'en') {
  if (!items?.length) return '';
  const parts = items.slice(0, 2).map((i) => `${lang === 'ar' ? i.name_ar : i.name_en} ×${i.quantity}`);
  return parts.join(lang === 'ar' ? '، ' : ', ') + (items.length > 2 ? ` +${items.length - 2}` : '');
}
