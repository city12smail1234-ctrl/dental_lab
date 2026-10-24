import { SupabaseService } from '../supabase/supabase.service';

export type DoctorInfo = { full_name: string | null; email: string | null; phone: string | null; clinic_name: string | null };

/** Adds the doctor's name, phone and clinic to rows that have a doctor_id, so lists never show only a code. */
export async function attachDoctors<T extends { doctor_id: string }>(sb: SupabaseService, rows: T[]): Promise<(T & { doctor: DoctorInfo | null })[]> {
  const ids = [...new Set(rows.map((r) => r.doctor_id).filter(Boolean))];
  if (!ids.length) return rows.map((r) => ({ ...r, doctor: null }));
  const [p, d] = await Promise.all([
    sb.admin.from('profiles').select('id,full_name,email,phone').in('id', ids),
    sb.admin.from('doctor_profiles').select('user_id,clinic_name').in('user_id', ids),
  ]);
  const prof = new Map((p.data ?? []).map((x) => [x.id, x]));
  const clinic = new Map((d.data ?? []).map((x) => [x.user_id, x.clinic_name as string | null]));
  return rows.map((r) => {
    const x = prof.get(r.doctor_id);
    return { ...r, doctor: x ? { full_name: x.full_name ?? x.email, email: x.email, phone: x.phone, clinic_name: clinic.get(r.doctor_id) ?? null } : null };
  });
}
