import { Reservation, type ReservationSnapshot } from "../domain/reservation";
import type { AuthenticationContext } from "../../authentication/application/authentication-context";
import { requireOrganizationUser } from "./reservation-access";
import {
  ReservationBookingPolicy,
  type ReservationBookingDependencies,
} from "./reservation-booking-policy";
import type { IdGenerator } from "./reservation-services";

export interface CreateReservationRequest {
  readonly roomId: string;
  readonly startAt: string;
  readonly endAt: string;
}

export interface CreateReservationDependencies extends ReservationBookingDependencies {
  readonly authenticationContext: AuthenticationContext;
  readonly idGenerator: IdGenerator;
}

/*
 * Here, a request becomes a reservation owned by the authenticated user.
 * The entity validates its data, and the shared booking policy checks the room,
 * booking window, and conflicts before the repository saves the result.
 */
export class CreateReservation {
  private readonly bookingPolicy: ReservationBookingPolicy;

  constructor(private readonly dependencies: CreateReservationDependencies) {
    this.bookingPolicy = new ReservationBookingPolicy(dependencies);
  }

  async execute(
    request: CreateReservationRequest,
  ): Promise<ReservationSnapshot> {
    const user = requireOrganizationUser(
      this.dependencies.authenticationContext.getAuthenticatedUser(),
    );
    const reservation = Reservation.create({
      id: this.dependencies.idGenerator.generate(),
      roomId: request.roomId,
      organizationId: user.organizationId,
      createdByUserId: user.userId,
      startAt: request.startAt,
      endAt: request.endAt,
    });

    await this.bookingPolicy.ensureCanBook(reservation);

    // Persistence must also enforce conflicts atomically under concurrency.
    await this.dependencies.repository.save(reservation);
    return reservation.toJSON();
  }
}
