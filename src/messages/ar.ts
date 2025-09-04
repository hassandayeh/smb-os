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

  // Settings (Horizon polish, upcoming)
  "settings.saved": "تم حفظ الإعدادات",
  "settings.saveFailed": "تعذر حفظ الإعدادات",

    // Header (impersonation)
  "header.previewAs": "المعاينة كـ",
  "header.clearPreview": "إلغاء",
  "header.signedInAs": "تسجيل الدخول باسم",
  "banner.returnToAdmin": "العودة إلى المشرف",
  "banner.viewingAs": "تسجيل العرض باسم",

    "errors.params.required": "معلمات مفقودة أو غير صالحة.",
  "errors.auth": "ممنوع (المصادقة).",
  "errors.self_delete": "لا يمكنك حذف حسابك الخاص.",
  "errors.user.not_found_in_tenant": "المستخدم غير موجود في المستأجر.",
  "errors.membership.not_found_or_deleted": "العضوية غير موجودة أو محذوفة بالفعل.",
  "errors.user.delete_failed": "فشل حذف المستخدم.",
  "errors.membership.lastL3.forbidden": "لا يمكنك إزالة آخر مشرف مستأجر نشط.",
  "errors.membership.demote_lastL3.forbidden": "لا يمكنك خفض رتبة آخر مشرف مستأجر نشط.",

  "users.manager.label": "المدير",
  "users.manager.none": "لا يوجد مدير",
  "users.manager.assign.success": "تم تحديث المدير.",
  "users.manager.assign.error": "تعذر تحديث المدير.",



};
