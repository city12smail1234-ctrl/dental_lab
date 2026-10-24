import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { UpdateDoctorProfileDto } from './dto';

// Allowed approval transitions (validated on the server).
const TRANSITIONS: Record<string, string[]> = {
  pending: ['approved', 'rejected'],
  approved: ['suspended'],
  suspended: ['approved'],
  rejected: ['approved'],
};

@Injectable()
export class DoctorsService {
  constructor(private readonly sb: SupabaseService) {}

  async getMe(userId: string) {
    const [{ data: p }, { data: d }] = await Promise.all([
      this.sb.admin.from('profiles').select('full_name,email,phone').eq('id', userId).maybeSingle(),
      this.sb.admin.from('doctor_profiles').select('clinic_name,clinic_address,status').eq('user_id', userId).maybeSingle(),
    ]);
    if (!p || !d) throw new NotFoundException('Doctor profile not found');
    return { ...p, ...d, profileComplete: !!(p.full_name && p.phone && d.clinic_name) };
  }

  async updateMe(userId: string, dto: UpdateDoctorProfileDto) {
    const a = await this.sb.admin.from('profiles').update({ full_name: dto.full_name, phone: dto.phone }).eq('id', userId);
    const b = await this.sb.admin.from('doctor_profiles')
      .update({ clinic_name: dto.clinic_name, clinic_address: dto.clinic_address ?? null }).eq('user_id', userId);
    if (a.error || b.error) throw new BadRequestException('Could not save profile');
    return this.getMe(userId);
  }

  async list(status?: string, page = 1) {
    const limit = 50;
    let q = this.sb.admin
      .from('doctor_profiles')
      .select('user_id,status,clinic_name,clinic_address,created_at,profiles(full_name,email,phone)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);
    if (status) q = q.eq('status', status);
    const { data, count, error } = await q;
    if (error) throw new BadRequestException(error.message);
    return { items: data, total: count ?? 0, page, limit };
  }

  async setStatus(adminId: string, doctorId: string, status: string) {
    const { data: cur } = await this.sb.admin.from('doctor_profiles').select('status').eq('user_id', doctorId).maybeSingle();
    if (!cur) throw new NotFoundException('Doctor not found');
    if (!TRANSITIONS[cur.status]?.includes(status))
      throw new BadRequestException(`Cannot change status from ${cur.status} to ${status}`);

    const { error } = await this.sb.admin.from('doctor_profiles')
      .update({ status, reviewed_by: adminId, reviewed_at: new Date().toISOString() }).eq('user_id', doctorId);
    if (error) throw new BadRequestException(error.message);

    await this.sb.admin.from('audit_logs').insert({
      actor_id: adminId, action: 'doctor.status_changed', entity: 'doctor_profiles', entity_id: doctorId,
      details: { from: cur.status, to: status },
    });
    return { user_id: doctorId, status };
  }

  async stats() {
    const statuses = ['pending', 'approved', 'rejected', 'suspended'];
    const counts = await Promise.all(
      statuses.map((st) => this.sb.admin.from('doctor_profiles').select('*', { count: 'exact', head: true }).eq('status', st)),
    );
    const doctors = Object.fromEntries(statuses.map((st, i) => [st, counts[i].count ?? 0]));
    const [{ data: recent }, { data: activity }] = await Promise.all([
      this.sb.admin.from('doctor_profiles')
        .select('user_id,status,clinic_name,created_at,profiles(full_name,email)')
        .order('created_at', { ascending: false }).limit(5),
      this.sb.admin.from('audit_logs').select('id,action,entity_id,details,created_at').order('id', { ascending: false }).limit(8),
    ]);
    return { doctors, recent: recent ?? [], activity: activity ?? [] };
  }
}
