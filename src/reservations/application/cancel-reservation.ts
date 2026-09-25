import {
  type AuthenticationContext,
  UserRole,
} from "../../authentication/application/authentication-context";
import type { ReservationSnapshot } from "../domain/reservation";
import {
  ensureCanManageReservation,
  reservationNotFound,
} from "./reservation-access";
import type { ReservationRepository } from "./reservation-repository";

export interface CancelReservationRequest {
  readonly reservationId: string;
}

export interface CancelReservationDependencies {
  readonly repository: ReservationRepository;
  readonly authenticationContext: AuthenticationContext;
}

/*
 * Here, cancellation checks access before asking the entity to change state.
 * Organization users follow ownership rules; platform administrators can perform
 * explicit administrative cancellations. The record remains stored as history,
 * and a failed save leaves the original entity unchanged.
 */
export class CancelReservation {
  constructor(private readonly dependencies: CancelReservationDependencies) {}

  async execute(
    request: CancelReservationRequest,
  ): Promise<ReservationSnapshot> {
    const user = this.dependencies.authenticationContext.getAuthenticatedUser();
    const reservation = await this.dependencies.repository.findById(
      request.reservationId,
    );
    if (!reservation) {
      throw reservationNotFound();
    }

    if (user.role !== UserRole.PlatformAdmin) {
      ensureCanManageReservation(reservation, user);
    }
    const cancelled = reservation.cancel();
    await this.dependencies.repository.save(cancelled);
    return cancelled.toJSON();
  }
}
