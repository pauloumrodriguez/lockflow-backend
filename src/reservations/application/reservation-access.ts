import {
  type AuthenticatedOrganizationUser,
  type AuthenticatedUser,
  UserRole,
} from "../../authentication/application/authentication-context";
import type { Reservation } from "../domain/reservation";
import {
  ReservationApplicationError,
  ReservationApplicationErrorCode,
} from "./reservation-application-error";

/*
 * Here, access rules translate a trusted identity into reservation permissions.
 * A hidden reservation produces the same response as a missing one, keeping
 * other organizations' records private before lifecycle rules are evaluated.
 */
export function requireOrganizationUser(
  user: AuthenticatedUser,
): AuthenticatedOrganizationUser {
  if (user.role === UserRole.PlatformAdmin) {
    throw new ReservationApplicationError(
      ReservationApplicationErrorCode.OrganizationAccountRequired,
      "This operation requires an organization account.",
    );
  }
  return user;
}

export function requirePlatformAdministrator(user: AuthenticatedUser): void {
  if (user.role !== UserRole.PlatformAdmin) {
    throw new ReservationApplicationError(
      ReservationApplicationErrorCode.PlatformAccountRequired,
      "This operation requires a platform administrator account.",
    );
  }
}

export function reservationNotFound(): ReservationApplicationError {
  return new ReservationApplicationError(
    ReservationApplicationErrorCode.NotFound,
    "The requested reservation was not found.",
  );
}

export function ensureCanManageReservation(
  reservation: Reservation,
  user: AuthenticatedOrganizationUser,
): void {
  if (reservation.organizationId !== user.organizationId) {
    throw reservationNotFound();
  }

  const isOrganizationAdministrator = user.role === UserRole.OrganizationAdmin;
  const ownsReservation = user.userId === reservation.createdByUserId;

  if (!isOrganizationAdministrator && !ownsReservation) {
    throw new ReservationApplicationError(
      ReservationApplicationErrorCode.NotAllowed,
      "You are not allowed to modify this reservation.",
    );
  }
}
