import { randomUUID } from 'node:crypto';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { attachDoctors } from '../common/doctor-info';
import { AuthUser } from '../auth/decorators';
import { SupabaseService } from '../supabase/supabase.service';
import { CaseStatusDto, CaseUpdateDto, CreateCaseDto, NoteDto } from './dto';

const MSG: Record<string, string> = {
  doctor_not_approved: 'Your account is not approved yet', service_unavailable: 'This service is not available',
  invalid_transition: 'This status change is not allowed', invalid_quantity: 'Quantity must be between 1 and 100', case_closed: 'This case is closed', case_not_found: 'Case not found',
};
const FILE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'pdf', 'zip', 'stl', 'ply'];
const FILE_COLS = 'id,original_name,mime_type,size_bytes,uploader_role,created_at';
const MAX_FILES = 10;
const BUCKET = 'case-files';
const OPEN_FOR_DOCTOR = ['submitted', 'info_required'];

/** Checks the real file signature, not just the name. STL has no reliable signature, so it is accepted by extension + minimum size. */
function validFile(name: string, b: Buffer): string | null {
  const ext = (name.split('.').pop() ?? '').toLowerCase();
  if (!FILE_EXT.includes(ext)) return null;
  const head = b.subarray(0, 12);
  const ok =
    ext === 'jpg' || ext === 'jpeg' ? head[0] === 0xff && head[1] === 0xd8 :
    ext === 'png' ? head.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) :
    ext === 'webp' ? head.subarray(0, 4).toString() === 'RIFF' && head.subarray(8, 12).toString() === 'WEBP' :
    ext === 'pdf' ? head.subarray(0, 4).toString() === '%PDF' :
    ext === 'zip' ? head[0] === 0x50 && head[1] === 0x4b :
    ext === 'ply' ? head.subarray(0, 3).toString() === 'ply' :
    ext === 'stl' ? b.length > 84 || head.subarray(0, 5).toString() === 'solid' : false;
  return ok ? ext : null;
}

const DOCTOR_COLS = 'id,case_number,service_name_ar,service_name_en,patient_ref,tooth_numbers,material,shade,instructions,quantity,unit_price,total,status,estimated_completion,due_at,submitted_at,updated_at';

@Injectable()
export class LabCasesService {
  constructor(private readonly sb: SupabaseService) {}

  private rpcError(msg: string): never {
    const k = Object.keys(MSG).find((x) => msg.includes(x));
    throw new BadRequestException(k ? MSG[k] : msg);
  }
  private isManager(u: AuthUser) { return u.roles.includes('lab_manager') || u.roles.includes('super_admin'); }
  private audit(actor: string, action: string, id: string, details: object) {
    return this.sb.admin.from('audit_logs').insert({ actor_id: actor, action, entity: 'lab_cases', entity_id: id, details });
  }
  private clean(s?: string) { return (s ?? '').replace(/[^A-Za-z0-9\u0600-\u06FF-]/g, ''); }

  // ---------------- doctor ----------------
  async create(userId: string, dto: CreateCaseDto) {
    const { data, error } = await this.sb.admin.rpc('create_case', {
      p_user: userId, p_key: dto.idempotency_key, p_service: dto.service_id, p_patient: dto.patient_ref.trim(),
      p_teeth: dto.tooth_numbers ?? null, p_material: dto.material ?? null, p_shade: dto.shade ?? null, p_instr: dto.instructions ?? null, p_qty: dto.quantity ?? 1,
    });
    let id = data as string | null;
    if (error) {
      if (error.code !== '23505') this.rpcError(error.message);
      const { data: ex } = await this.sb.admin.from('lab_cases').select('id').eq('doctor_id', userId).eq('idempotency_key', dto.idempotency_key).maybeSingle();
      id = ex?.id ?? null;
    }
    if (!id) throw new BadRequestException('Could not submit the case');
    const { data: c } = await this.sb.admin.from('lab_cases').select('id,case_number').eq('id', id).single();
    return c;
  }

  async mine(userId: string, status?: string, search?: string) {
    let q = this.sb.admin.from('lab_cases').select(DOCTOR_COLS).eq('doctor_id', userId).order('submitted_at', { ascending: false }).limit(100);
    if (status) q = q.eq('status', status);
    const k = this.clean(search);
    if (k) q = q.or(`case_number.ilike.%${k}%,patient_ref.ilike.%${k}%`);
    const { data, error } = await q;
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async mineOne(userId: string, id: string) {
    const { data: c, error } = await this.sb.admin.from('lab_cases').select(DOCTOR_COLS).eq('id', id).eq('doctor_id', userId).maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!c) throw new NotFoundException();    // also hides other doctors' cases
    const [h, n] = await Promise.all([
      this.sb.admin.from('lab_case_status_history').select('id,from_status,to_status,note,created_at').eq('case_id', id).order('id'),
      this.sb.admin.from('lab_case_notes').select('id,author_role,body,created_at').eq('case_id', id).eq('visibility', 'doctor').order('created_at'),
    ]);
    const files = await this.sb.admin.from('lab_case_files').select(FILE_COLS).eq('case_id', id).order('created_at');
    return { ...c, history: h.data ?? [], messages: n.data ?? [], files: files.data ?? [] };
  }

  async message(userId: string, id: string, body: string) {
    const c = await this.mineOne(userId, id);
    if (['delivered', 'rejected', 'cancelled'].includes(c.status)) throw new BadRequestException('This case is closed');
    const { error } = await this.sb.admin.from('lab_case_notes').insert({ case_id: id, author_id: userId, author_role: 'doctor', visibility: 'doctor', body: body.trim() });
    if (error) throw new BadRequestException(error.message);
    if (c.status === 'info_required') {   // answering a request for information re-submits the case for review
      const r = await this.sb.admin.rpc('set_case_status', { p_case: id, p_status: 'submitted', p_note: 'Doctor replied', p_user: userId, p_staff: false });
      if (r.error) this.rpcError(r.error.message);
    }
    return this.mineOne(userId, id);
  }

  async cancelMine(userId: string, id: string) {
    await this.mineOne(userId, id);
    const { error } = await this.sb.admin.rpc('set_case_status', { p_case: id, p_status: 'cancelled', p_note: 'Cancelled by doctor', p_user: userId, p_staff: false });
    if (error) this.rpcError(error.message);
    return this.mineOne(userId, id);
  }

  // ---------------- staff ----------------
  private async staffCase(u: AuthUser, id: string) {
    const { data: c, error } = await this.sb.admin.from('lab_cases').select('*').eq('id', id).maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!c) throw new NotFoundException();
    if (!this.isManager(u) && c.assigned_to !== u.id) throw new ForbiddenException('This case is not assigned to you'); // technicians: assigned cases only
    return c;
  }

  async adminList(u: AuthUser, status?: string, search?: string, page = 1) {
    const limit = 20;
    let q = this.sb.admin.from('lab_cases').select('id,case_number,service_name_ar,service_name_en,patient_ref,quantity,status,assigned_to,estimated_completion,due_at,submitted_at,doctor_id', { count: 'exact' })
      .order('submitted_at', { ascending: false }).range((page - 1) * limit, page * limit - 1);
    if (!this.isManager(u)) q = q.eq('assigned_to', u.id);
    if (status) q = q.eq('status', status);
    const k = this.clean(search);
    if (k) q = q.or(`case_number.ilike.%${k}%,patient_ref.ilike.%${k}%`);
    const { data, count, error } = await q;
    if (error) throw new BadRequestException(error.message);
    return { items: await attachDoctors(this.sb, data ?? []), total: count ?? 0, page, limit };
  }

  async adminGet(u: AuthUser, id: string) {
    const c = await this.staffCase(u, id);
    const [h, n, d, doc, tech, files] = await Promise.all([
      this.sb.admin.from('lab_case_status_history').select('*').eq('case_id', id).order('id'),
      this.sb.admin.from('lab_case_notes').select('*').eq('case_id', id).order('created_at'),
      this.sb.admin.from('profiles').select('full_name,email,phone').eq('id', c.doctor_id).maybeSingle(),
      this.sb.admin.from('doctor_profiles').select('clinic_name,clinic_address').eq('user_id', c.doctor_id).maybeSingle(),
      c.assigned_to ? this.sb.admin.from('profiles').select('full_name,email').eq('id', c.assigned_to).maybeSingle() : Promise.resolve({ data: null }),
      this.sb.admin.from('lab_case_files').select(FILE_COLS).eq('case_id', id).order('created_at'),
    ]);
    return { ...c, history: h.data ?? [], notes: n.data ?? [], doctor: { ...(d.data ?? {}), ...(doc.data ?? {}) }, technician: tech.data, files: files.data ?? [] };
  }

  async technicians() {
    const { data: roles } = await this.sb.admin.from('user_roles').select('user_id').in('role', ['technician', 'lab_manager', 'super_admin']);
    const ids = [...new Set((roles ?? []).map((r) => r.user_id))];
    if (!ids.length) return [];
    const { data } = await this.sb.admin.from('profiles').select('id,full_name,email').in('id', ids);
    return data ?? [];
  }

  async setStatus(u: AuthUser, id: string, dto: CaseStatusDto) {
    await this.staffCase(u, id);
    const { error } = await this.sb.admin.rpc('set_case_status', { p_case: id, p_status: dto.status, p_note: dto.note ?? null, p_user: u.id, p_staff: true });
    if (error) this.rpcError(error.message);
    await this.audit(u.id, 'case.status_changed', id, { to: dto.status });
    return this.adminGet(u, id);
  }

  async update(u: AuthUser, id: string, dto: CaseUpdateDto) {
    if (!this.isManager(u)) throw new ForbiddenException('Only managers can assign cases or set dates');
    await this.staffCase(u, id);
    const { due_in_hours, ...rest } = dto;
    const patch: Record<string, unknown> = { ...rest };
    if (due_in_hours !== undefined) {   // deadline counted from now; null clears it
      patch.due_at = due_in_hours === null ? null : new Date(Date.now() + due_in_hours * 3_600_000).toISOString();
      patch.estimated_completion = patch.due_at ? (patch.due_at as string).slice(0, 10) : null;
    }
    const { error } = await this.sb.admin.from('lab_cases').update(patch).eq('id', id);
    if (error) throw new BadRequestException(error.message);
    await this.audit(u.id, 'case.updated', id, dto);
    return this.adminGet(u, id);
  }

  async addNote(u: AuthUser, id: string, dto: NoteDto) {
    await this.staffCase(u, id);
    const { error } = await this.sb.admin.from('lab_case_notes').insert({ case_id: id, author_id: u.id, author_role: 'staff', visibility: dto.visibility, body: dto.body.trim() });
    if (error) throw new BadRequestException(error.message);
    return this.adminGet(u, id);
  }

  // ---------------- files (private bucket) ----------------
  private async storeFile(caseId: string, userId: string, role: 'doctor' | 'staff', file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('file is required');
    const name = Buffer.from(file.originalname, 'latin1').toString('utf8').slice(0, 150);   // multer decodes names as latin1
    const ext = validFile(name, file.buffer);
    if (!ext) throw new BadRequestException('Allowed files: JPG, PNG, WebP, PDF, ZIP, STL, PLY');
    const { count } = await this.sb.admin.from('lab_case_files').select('*', { count: 'exact', head: true }).eq('case_id', caseId);
    if ((count ?? 0) >= MAX_FILES) throw new BadRequestException(`Maximum ${MAX_FILES} files per case`);
    const path = `cases/${caseId}/${randomUUID()}.${ext}`;
    const up = await this.sb.admin.storage.from(BUCKET).upload(path, file.buffer, { contentType: file.mimetype || 'application/octet-stream', upsert: false });
    if (up.error) throw new BadRequestException(up.error.message);
    const { error } = await this.sb.admin.from('lab_case_files').insert({ case_id: caseId, uploaded_by: userId, uploader_role: role, storage_path: path, original_name: name, mime_type: file.mimetype, size_bytes: file.size });
    if (error) { await this.sb.admin.storage.from(BUCKET).remove([path]); throw new BadRequestException(error.message); }
  }

  private async signed(caseId: string, fileId: string) {
    const { data: f } = await this.sb.admin.from('lab_case_files').select('storage_path,original_name').eq('id', fileId).eq('case_id', caseId).maybeSingle();
    if (!f) throw new NotFoundException();
    const r = await this.sb.admin.storage.from(BUCKET).createSignedUrl(f.storage_path, 300, { download: f.original_name });  // link valid for 5 minutes
    if (r.error) throw new BadRequestException(r.error.message);
    return { url: r.data.signedUrl };
  }

  private async dropFile(caseId: string, fileId: string, onlyUploader?: string) {
    let q = this.sb.admin.from('lab_case_files').select('storage_path,uploaded_by').eq('id', fileId).eq('case_id', caseId);
    const { data: f } = await q.maybeSingle();
    if (!f) throw new NotFoundException();
    if (onlyUploader && f.uploaded_by !== onlyUploader) throw new ForbiddenException('You can only delete your own files');
    await this.sb.admin.storage.from(BUCKET).remove([f.storage_path]);
    await this.sb.admin.from('lab_case_files').delete().eq('id', fileId);
  }

  async doctorUpload(userId: string, id: string, file?: Express.Multer.File) {
    const c = await this.mineOne(userId, id);
    if (['delivered', 'rejected', 'cancelled'].includes(c.status)) throw new BadRequestException('This case is closed');
    await this.storeFile(id, userId, 'doctor', file);
    return this.mineOne(userId, id);
  }
  async doctorFileUrl(userId: string, id: string, fileId: string) { await this.mineOne(userId, id); return this.signed(id, fileId); }
  async doctorDeleteFile(userId: string, id: string, fileId: string) {
    const c = await this.mineOne(userId, id);
    if (!OPEN_FOR_DOCTOR.includes(c.status)) throw new BadRequestException('Files can no longer be removed at this stage');
    await this.dropFile(id, fileId, userId);
    return this.mineOne(userId, id);
  }
  async staffUpload(u: AuthUser, id: string, file?: Express.Multer.File) {
    const c = await this.staffCase(u, id);
    if (['delivered', 'rejected', 'cancelled'].includes(c.status)) throw new BadRequestException('This case is closed');
    await this.storeFile(id, u.id, 'staff', file);
    return this.adminGet(u, id);
  }
  async staffFileUrl(u: AuthUser, id: string, fileId: string) { await this.staffCase(u, id); return this.signed(id, fileId); }
  async staffDeleteFile(u: AuthUser, id: string, fileId: string) { await this.staffCase(u, id); await this.dropFile(id, fileId); return this.adminGet(u, id); }
}
