import type { AuthenticationContext } from "../../authentication/application/authentication-context";
import type { ReservationSnapshot } from "../domain/reservation";
import {
  ensureCanManageReservation,
  requireOrganizationUser,
  reservationNotFound,
} from "./reservation-access";
import {
  ReservationBookingPolicy,
  type ReservationBookingDependencies,
} from "./reservation-booking-policy";

export interface RescheduleReservationRequest {
  readonly reservationId: string;
  readonly startAt: string;
  readonly endAt: string;
}

export interface RescheduleReservationDependencies extends ReservationBookingDependencies {
  readonly authenticationContext: AuthenticationContext;
}

/*
 * Here, an authorized user proposes a new period for an existing reservation.
 * The entity creates a validated replacement, preserving the original until all
 * checks succeed. Conflicts exclude only this reservation, across organizations.
 */
export class RescheduleReservation {
  private readonly bookingPolicy: ReservationBookingPolicy;

  constructor(
    private readonly dependencies: RescheduleReservationDependencies,
  ) {
    this.bookingPolicy = new ReservationBookingPolicy(dependencies);
  }

  async execute(
    request: RescheduleReservationRequest,
  ): Promise<ReservationSnapshot> {
    const user = requireOrganizationUser(
      this.dependencies.authenticationContext.getAuthenticatedUser(),
    );
    const original = await this.dependencies.repository.findById(
      request.reservationId,
    );
    if (!original) {
      throw reservationNotFound();
    }

    ensureCanManageReservation(original, user);
    const replacement = original.reschedule({
      startAt: request.startAt,
      endAt: request.endAt,
    });
    await this.bookingPolicy.ensureCanBook(replacement, {
      excludeReservationId: original.id,
    });

    // The future database adapter must make conflict checking and updating atomic.
    await this.dependencies.repository.save(replacement);
    return replacement.toJSON();
  }
}
