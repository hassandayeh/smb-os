import type { Messages } from '@/lib/i18n';

export const en: Messages = {
  // Generic actions
  'actions.save': 'Save',
  'actions.cancel': 'Cancel',
  'actions.close': 'Close',
  'actions.delete': 'Delete',
  'actions.edit': 'Edit',
  'actions.manage': 'Manage',
  'actions.preview': 'Preview as',
  'actions.clearPreview': 'Clear preview',

  // Status
  'status.active': 'Active',
  'status.inactive': 'Inactive',

  // SubmitButton (Phase 0 ready)
  'submit.saving': 'Saving…',

  // Audit quick filter labels (Phase 1 will wire these)
  'audit.filters.action': 'Action',
  'audit.actions.user.create': 'User created',
  'audit.actions.user.role.changed': 'User role changed',
  'audit.actions.user.status.changed': 'User status changed',
  'audit.actions.user.delete': 'User deleted',
  'audit.actions.user.supervisor.set': 'Supervisor set',
  'audit.actions.user.supervisor.unset': 'Supervisor unset',
  'audit.actions.entitlement.update': 'Entitlement updated',
  'audit.actions.user.entitlement.update': 'User entitlement updated',

  // Settings (Horizon polish, upcoming)
  'settings.saved': 'Settings saved',
  'settings.saveFailed': 'Could not save settings',
};
