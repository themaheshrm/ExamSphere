import { invokeFunction } from './studentAccountService';

/**
 * Browser side of super-admin account management. Every call goes to the
 * `manage-admins` Edge Function with the signed-in user's session; the
 * function checks that the caller is the super admin and does the privileged
 * work with the service role. Temporary passwords come back once and must
 * never be stored.
 */
export const adminManagementService = {
  list: () => invokeFunction('manage-admins', { action: 'list' }),
  create: (form) => invokeFunction('manage-admins', {
    action: 'create', name: form.name, adminId: form.adminId, email: form.email,
    adminType: form.adminType, subjectCode: form.adminType === 'subject' ? form.subjectCode : null, status: form.status,
  }),
  assignSubject: (userId, adminType, subjectCode) => invokeFunction('manage-admins', { action: 'assign-subject', userId, adminType, subjectCode }),
  resetPassword: (userId) => invokeFunction('manage-admins', { action: 'reset-password', userId }),
  setStatus: (userId, status) => invokeFunction('manage-admins', { action: 'set-status', userId, status }),
};
