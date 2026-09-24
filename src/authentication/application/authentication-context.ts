export const UserRole = {
  Member: "member",
  OrganizationAdmin: "organization_admin",
  PlatformAdmin: "platform_admin",
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export type OrganizationUserRole =
  | typeof UserRole.Member
  | typeof UserRole.OrganizationAdmin;

export interface AuthenticatedOrganizationUser {
  readonly userId: string;
  readonly organizationId: string;
  readonly role: OrganizationUserRole;
}

export interface AuthenticatedPlatformAdministrator {
  readonly userId: string;
  readonly role: typeof UserRole.PlatformAdmin;
}

export type AuthenticatedUser =
  | AuthenticatedOrganizationUser
  | AuthenticatedPlatformAdministrator;

/*
 * Here, protected use cases receive a trusted identity through one contract.
 * The role discriminates organization users from platform administrators, so
 * TypeScript exposes organizationId only after the role has been checked.
 */
export interface AuthenticationContext {
  getAuthenticatedUser(): AuthenticatedUser;
}
