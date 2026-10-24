// Currency is fixed to EGP for now; move to a settings table when the business needs more.
export const money = (n: number, lang: 'ar' | 'en') =>
  new Intl.NumberFormat(lang === 'ar' ? 'ar-EG' : 'en-EG', { style: 'currency', currency: 'EGP', maximumFractionDigits: 2 }).format(n);
