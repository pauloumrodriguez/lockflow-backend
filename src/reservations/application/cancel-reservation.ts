import {
  type AuthenticatedUser,
  type AuthenticationContext,
  UserRole,
} from "../../authentication/application/authentication-context";
import type { Reservation, ReservationSnapshot } from "../domain/reservation";
import type { ReservationRepository } from "./reservation-repository";

export interface CancelReservationRequest {
  readonly reservationId: string;
}

export interface CancelReservationDependencies {
  readonly repository: ReservationRepository;
  readonly authenticationContext: AuthenticationContext;
}

export const CancelReservationErrorCode = {
  NotFound: "RESERVATION_NOT_FOUND",
  NotAllowed: "RESERVATION_CANCELLATION_NOT_ALLOWED",
} as const;

export type CancelReservationErrorCode =
  (typeof CancelReservationErrorCode)[keyof typeof CancelReservationErrorCode];

export class CancelReservationError extends Error {
  constructor(
    readonly code: CancelReservationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CancelReservationError";
  }
}

/*
 * Here, cancellation coordinates retrieval and persistence around the entity.
 * Reservation owns the state transition and rejects a second cancellation, so
 * this use case does not inspect or modify status fields itself.
 */
export class CancelReservation {
  constructor(private readonly dependencies: CancelReservationDependencies) {}

  async execute(
    request: CancelReservationRequest,
  ): Promise<ReservationSnapshot> {
    const reservation = await this.dependencies.repository.findById(
      request.reservationId,
    );

    if (!reservation) {
      throw this.reservationNotFound();
    }

    const authenticatedUser =
      this.dependencies.authenticationContext.getAuthenticatedUser();
    this.ensureCanCancel(reservation, authenticatedUser);

    reservation.cancel();
    await this.dependencies.repository.save(reservation);

    return reservation.toJSON();
  }

  private ensureCanCancel(
    reservation: Reservation,
    authenticatedUser: AuthenticatedUser,
  ): void {
    if (authenticatedUser.role === UserRole.PlatformAdmin) {
      return;
    }

    if (authenticatedUser.organizationId !== reservation.organizationId) {
      throw this.reservationNotFound();
    }

    const isOrganizationAdministrator =
      authenticatedUser.role === UserRole.OrganizationAdmin;
    const ownsReservation =
      authenticatedUser.userId === reservation.createdByUserId;

    if (!isOrganizationAdministrator && !ownsReservation) {
      throw new CancelReservationError(
        CancelReservationErrorCode.NotAllowed,
        "You are not allowed to cancel this reservation.",
      );
    }
  }

  private reservationNotFound(): CancelReservationError {
    return new CancelReservationError(
      CancelReservationErrorCode.NotFound,
      "The requested reservation was not found.",
    );
  }
}
