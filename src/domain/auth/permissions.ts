export const PERMISSIONS = [
  "dashboard.read",
  "products.read",
  "products.write",
  "tags.read",
  "tags.write",
  "rates.read",
  "rates.write",
  "goldRate.read",
  "goldRate.write",
  "imports.run",
  "syncLogs.read",
  "users.manage",
  "settings.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export type Role = "Admin" | "Staff" | "Viewer";

export const ROLES: Record<Role, Role> = {
  Admin: "Admin",
  Staff: "Staff",
  Viewer: "Viewer",
} as const;

export type AdminUserProfile = {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: Role;
  permissions: Permission[];
  disabled?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export const ROLE_PERMISSION_PRESETS: Record<Role, Permission[]> = {
  Admin: [...PERMISSIONS],
  Staff: [
    "dashboard.read",
    "products.read",
    "products.write",
    "tags.read",
    "tags.write",
    "goldRate.read",
    "imports.run",
  ],
  Viewer: [
    "dashboard.read",
    "products.read",
    "tags.read",
    "goldRate.read",
  ],
};

export const PERMISSION_LABELS: Record<Permission, string> = {
  "dashboard.read": "View dashboard",
  "products.read": "View products",
  "products.write": "Edit products",
  "tags.read": "View tags",
  "tags.write": "Edit tags",
  "rates.read": "View rates",
  "rates.write": "Edit rates",
  "goldRate.read": "View gold rate",
  "goldRate.write": "Edit gold rate",
  "imports.run": "Run imports and sync",
  "syncLogs.read": "View sync logs",
  "users.manage": "Manage users",
  "settings.manage": "Manage settings",
};

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}

export function normalizePermissions(values: unknown): Permission[] {
  if (!Array.isArray(values)) return [];
  return Array.from(
    new Set(values.filter((value): value is Permission => typeof value === "string" && isPermission(value)))
  );
}

export function getEffectivePermissions(role: Role, permissions: Permission[] = []): Permission[] {
  if (role === "Admin") return ROLE_PERMISSION_PRESETS.Admin;
  return Array.from(new Set(permissions));
}

export function hasPermission(
  profile: Pick<AdminUserProfile, "role" | "permissions" | "disabled"> | null | undefined,
  permission: Permission
): boolean {
  if (!profile || profile.disabled) return false;
  return getEffectivePermissions(profile.role, profile.permissions).includes(permission);
}

export function canEditProducts(role: Role, permissions: Permission[] = []): boolean {
  return getEffectivePermissions(role, permissions).includes("products.write");
}

export function canEditTags(role: Role, permissions: Permission[] = []): boolean {
  return getEffectivePermissions(role, permissions).includes("tags.write");
}

export function canEditRates(role: Role, permissions: Permission[] = []): boolean {
  return getEffectivePermissions(role, permissions).includes("rates.write");
}

export function canRunImport(role: Role, permissions: Permission[] = []): boolean {
  return getEffectivePermissions(role, permissions).includes("imports.run");
}
