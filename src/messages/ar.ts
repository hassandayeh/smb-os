// src/messages/ar.ts
import type { Messages } from "@/lib/i18n";

export const ar: Messages = {
  // Generic actions
  "actions.save": "حفظ",
  "savedBanner.saved": "تم الحفظ.",
  "actions.cancel": "إلغاء",
  "actions.close": "إغلاق",
  "actions.delete": "حذف",
  "actions.edit": "تعديل",
  "actions.manage": "إدارة",
  "actions.preview": "المعاينة باسم",
  "actions.clearPreview": "مسح المعاينة",

  "language.label": "اللغة",
  "language.english": "الإنجليزية",
  "language.arabic": "العربية",

  // Status
  "status.active": "نشط",
  "status.inactive": "غير نشط",
  "status.suspended": "موقوف",

  // SubmitButton
  "submit.saving": "جارٍ الحفظ…",

  // Audit actions
  "audit.filters.action": "الإجراء",
  "audit.actions.user.create": "تم إنشاء مستخدم",
  "audit.actions.user.role.changed": "تم تغيير دور المستخدم",
  "audit.actions.user.status.changed": "تم تغيير حالة المستخدم",
  "audit.actions.user.delete": "تم حذف المستخدم (حذف منطقي)",
  "audit.actions.user.supervisor.set": "تم تعيين مشرف",
  "audit.actions.user.supervisor.unset": "تم إلغاء تعيين مشرف",
  "audit.actions.entitlement.update": "تم تحديث الصلاحية",
  "audit.actions.user.entitlement.update": "تم تحديث صلاحية المستخدم",

  // Settings
  "settings.saved": "تم حفظ الإعدادات",
  "settings.saveFailed": "تعذر حفظ الإعدادات",

  // Header (impersonation)
  "header.previewAs": "المعاينة كـ",
  "header.clearPreview": "إلغاء",
  "header.signedInAs": "تسجيل الدخول باسم",
  "banner.returnToAdmin": "العودة إلى المشرف",
  "banner.viewingAs": "تسجيل العرض باسم",

  // Errors
  "errors.params.required": "معلمات مفقودة أو غير صالحة.",
  "errors.auth": "ممنوع (المصادقة).",
  "errors.self_delete": "لا يمكنك حذف حسابك الخاص.",
  "errors.user.not_found_in_tenant": "المستخدم غير موجود في المستأجر.",
  "errors.membership.not_found_or_deleted": "العضوية غير موجودة أو محذوفة بالفعل.",
  "errors.user.delete_failed": "فشل حذف المستخدم.",
  "errors.membership.lastL3.forbidden": "لا يمكنك إزالة آخر مشرف مستأجر نشط.",
  "errors.membership.demote_lastL3.forbidden": "لا يمكنك خفض رتبة آخر مشرف مستأجر نشط.",

  // Users / Supervisor
  "users.manager.label": "المدير",
  "users.manager.none": "لا يوجد مدير",
  "users.manager.assign.success": "تم تحديث المدير.",
  "users.manager.assign.error": "تعذر تحديث المدير.",

  // === صفحة المستأجرين (لوحة الإدارة) ===
  "date.fallback": "—",

  "admin.tenants.title": "المستأجرون",
  "admin.console": "لوحة التحكم",
'tenants.word': 'المستأجرين',

  "actions.exportCsv": "تصدير CSV",

  "actions.entitlements": "الصلاحيات",
  "actions.clearSearch": "مسح البحث",

  'tenants.summary.noQuery': '{count} المستأجرين',
  'tenants.summary.query': '{count} من المستأجرين لِـ “{q}”',
  "tenants.empty.query": "لا يوجد مستأجرون لـ “{q}”.",
  "tenants.empty.noQuery": "لا يوجد مستأجرون.",

  "tenants.sort.newestFirst": "الأحدث أولًا",
  "tenants.sort.oldestFirst": "الأقدم أولًا",
  "tenants.sort.activationLatest": "أحدث تفعيل",
  "tenants.sort.activationEarliest": "أقدم تفعيل",
  "tenants.sort.nameAsc": "الاسم (أ → ي)",
  "tenants.sort.nameDesc": "الاسم (ي → أ)",

  "table.name": "الاسم",
  "table.id": "المعرّف",
  "table.status": "الحالة",
  "table.activatedUntil": "تاريخ التفعيل",
  "table.created": "تاريخ الإنشاء",
  "table.actions": "الإجراءات",

  "pagination.pageOf": "الصفحة {page} من {totalPages}",
  "pagination.first": "الأولى",
  "pagination.prev": "السابق",
  "pagination.next": "التالي",
  "pagination.last": "الأخيرة",

  "search.placeholder.tenants": "ابحث عن مستأجرين...",

  'actions.createTenant': 'إنشاء جهة',
  'search.aria.searchTenants': 'بحث في الجهات',
  'search.aria.sortBy': 'ترتيب حسب',

};
