import type { ReservationSnapshot } from "../domain/reservation";
import type { ReservationRepository } from "./reservation-repository";

export interface CancelReservationRequest {
  readonly reservationId: string;
}

export const CancelReservationErrorCode = {
  NotFound: "RESERVATION_NOT_FOUND",
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
  constructor(private readonly repository: ReservationRepository) {}

  async execute(
    request: CancelReservationRequest,
  ): Promise<ReservationSnapshot> {
    const reservation = await this.repository.findById(request.reservationId);

    if (!reservation) {
      throw new CancelReservationError(
        CancelReservationErrorCode.NotFound,
        "The requested reservation was not found.",
      );
    }

    reservation.cancel();
    await this.repository.save(reservation);

    return reservation.toJSON();
  }
}
