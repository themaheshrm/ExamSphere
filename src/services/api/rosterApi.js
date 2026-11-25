import { rpc, select } from './core.js';

const toStudent = (r) => ({
  id: r.id,
  usn: r.usn,
  name: r.full_name,
  email: r.email,
  isActive: r.is_active,
  department: r.department || '',
  departmentId: r.department_id,
  semester: r.semester,
  section: r.section || '',
  phone: r.phone || '',
  pinned: r.pinned,
});

/** Student records (profiles + student_details) visible to the signed-in admin. */
export const rosterApi = {
  async list() {
    const rows = await select('admin_candidates', '*', (q) => q.order('usn'));
    return rows.map(toStudent);
  },

  async departments() {
    return select('departments', 'id,code,name', (q) => q.order('name'));
  },

  update: (studentId, { name, semester, section, isActive }) => rpc('admin_update_student', {
    p_student_id: studentId,
    p_full_name: name ?? null,
    p_semester: semester === undefined || semester === '' ? null : Number(semester),
    p_section: section || null,
    p_is_active: isActive ?? null,
  }),
};
