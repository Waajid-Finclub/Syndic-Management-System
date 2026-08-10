import type { User } from "./types";

export function has(user: User | null | undefined, module: string, capability: string) {
  if (!user) return false;
  if (user.role === "super_admin") return true;
  return Boolean(user.permissions?.[module]?.includes(capability));
}

export function canView(user: User | null | undefined, module: string) {
  return has(user, module, "view");
}

export function canEdit(user: User | null | undefined, module: string) {
  return has(user, module, "edit");
}

export function canCreate(user: User | null | undefined, module: string) {
  return has(user, module, "create");
}

export function canDelete(user: User | null | undefined, module: string) {
  return has(user, module, "delete");
}

export function canExport(user: User | null | undefined, module: string) {
  return has(user, module, "export");
}
