import { Reservation, ReservationSnapshot } from "../domain/reservation";

const MAX_RESERVATION_ADVANCE_MS = 90 * 24 * 60 * 60 * 1000;

export interface CreateReservationRequest {
  readonly roomId: string;
  readonly startAt: string;
  readonly endAt: string;
}

export interface ReservationRepository {
  hasOverlap(reservation: Reservation): Promise<boolean>;
  save(reservation: Reservation): Promise<void>;
}

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  generate(): string;
}

export interface CreateReservationDependencies {
  readonly repository: ReservationRepository;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
}

export const CreateReservationErrorCode = {
  StartInPast: "START_IN_PAST",
  StartTooFarInAdvance: "START_TOO_FAR_IN_ADVANCE",
  Overlap: "RESERVATION_OVERLAP",
} as const;

export type CreateReservationErrorCode =
  (typeof CreateReservationErrorCode)[keyof typeof CreateReservationErrorCode];

export class CreateReservationError extends Error {
  constructor(
    readonly code: CreateReservationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CreateReservationError";
  }
}

export class CreateReservation {
  constructor(private readonly dependencies: CreateReservationDependencies) {}

  async execute(
    request: CreateReservationRequest,
  ): Promise<ReservationSnapshot> {
    const reservation = Reservation.create({
      id: this.dependencies.idGenerator.generate(),
      roomId: request.roomId,
      startAt: request.startAt,
      endAt: request.endAt,
    });

    const currentTimeMs = this.dependencies.clock.now().getTime();
    const reservationStartMs = reservation.startAt.getTime();

    if (reservationStartMs < currentTimeMs) {
      throw new CreateReservationError(
        CreateReservationErrorCode.StartInPast,
        "A reservation cannot start in the past.",
      );
    }

    const latestAllowedStartMs = currentTimeMs + MAX_RESERVATION_ADVANCE_MS;

    if (reservationStartMs > latestAllowedStartMs) {
      throw new CreateReservationError(
        CreateReservationErrorCode.StartTooFarInAdvance,
        "A reservation cannot start more than 90 days in advance.",
      );
    }

    const hasOverlap =
      await this.dependencies.repository.hasOverlap(reservation);

    if (hasOverlap) {
      throw new CreateReservationError(
        CreateReservationErrorCode.Overlap,
        "The requested reservation time is unavailable.",
      );
    }

    await this.dependencies.repository.save(reservation);

    return reservation.toJSON();
  }
}
