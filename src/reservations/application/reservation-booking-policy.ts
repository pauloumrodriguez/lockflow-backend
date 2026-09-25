import type { Reservation } from "../domain/reservation";
import {
  ReservationApplicationError,
  ReservationApplicationErrorCode,
} from "./reservation-application-error";
import type { ReservationRepository } from "./reservation-repository";
import type { Clock, RoomAvailability } from "./reservation-services";

const MAX_RESERVATION_ADVANCE_MS = 90 * 24 * 60 * 60 * 1000;

export interface ReservationBookingDependencies {
  readonly repository: ReservationRepository;
  readonly roomAvailability: RoomAvailability;
  readonly clock: Clock;
}

/*
 * Here, creation and rescheduling share one set of booking checks.
 * The entity has already validated its period; this policy checks information
 * outside the entity, including the clock, active rooms, and competing bookings.
 */
export class ReservationBookingPolicy {
  constructor(private readonly dependencies: ReservationBookingDependencies) {}

  async ensureCanBook(
    reservation: Reservation,
    options: { readonly excludeReservationId?: string } = {},
  ): Promise<void> {
    // Capture time before asynchronous checks so both boundaries use one instant.
    const now = this.dependencies.clock.now();
    await ensureRoomIsReservable(this.dependencies.roomAvailability, reservation.roomId);
    this.ensureStartIsWithinBookingWindow(reservation.startAt, now);

    const hasOverlap = await this.dependencies.repository.hasOverlap(reservation, options);
    if (hasOverlap) {
      throw new ReservationApplicationError(
        ReservationApplicationErrorCode.Overlap,
        "The requested reservation time is unavailable.",
      );
    }
  }

  private ensureStartIsWithinBookingWindow(startAt: Date, now: Date): void {
    if (startAt.getTime() < now.getTime()) {
      throw new ReservationApplicationError(
        ReservationApplicationErrorCode.StartInPast,
        "A reservation cannot start in the past.",
      );
    }

    const latestAllowedStartMs = now.getTime() + MAX_RESERVATION_ADVANCE_MS;
    if (startAt.getTime() > latestAllowedStartMs) {
      throw new ReservationApplicationError(
        ReservationApplicationErrorCode.StartTooFarInAdvance,
        "A reservation cannot start more than 90 days in advance.",
      );
    }
  }
}

export async function ensureRoomIsReservable(
  rooms: RoomAvailability,
  roomId: string,
): Promise<void> {
  if (!(await rooms.isReservable(roomId))) {
    throw new ReservationApplicationError(
      ReservationApplicationErrorCode.RoomUnavailable,
      "The requested room is unavailable.",
    );
  }
}
