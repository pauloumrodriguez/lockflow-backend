export class InvalidReservationError extends Error {}

const MIN_RESERVATION_DURATION_MS = 15 * 60 * 1000;
const MAX_RESERVATION_DURATION_MS = 8 * 60 * 60 * 1000;

// Requiring an explicit UTC suffix prevents timestamps from being
// interpreted in the server's local timezone.
const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

/*
 * This domain model turns raw reservation data into a valid time interval.
 * Creation stops whenever format, calendar, ordering, or duration rules fail.
 */
export class Reservation {
  private constructor(
    readonly id: string,
    readonly roomId: string,
    readonly startAt: Date,
    readonly endAt: Date,
  ) {}

  static create(
    id: string,
    roomId: string,
    startAt: string,
    endAt: string,
  ): Reservation {
    if (!ISO_UTC_PATTERN.test(startAt) || !ISO_UTC_PATTERN.test(endAt)) {
      throw new InvalidReservationError(
        "Reservation dates must use the UTC ISO 8601 format and end with Z.",
      );
    }

    const start = new Date(startAt);
    const end = new Date(endAt);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new InvalidReservationError(
        "Reservation dates must represent valid calendar dates.",
      );
    }

    if (start >= end) {
      throw new InvalidReservationError(
        "The reservation start time must be earlier than the end time.",
      );
    }

    const durationMs = end.getTime() - start.getTime();

    if (durationMs < MIN_RESERVATION_DURATION_MS) {
      throw new InvalidReservationError(
        "A reservation must last at least 15 minutes.",
      );
    }

    if (durationMs > MAX_RESERVATION_DURATION_MS) {
      throw new InvalidReservationError(
        "A reservation cannot last longer than 8 hours.",
      );
    }

    return new Reservation(id, roomId, start, end);
  }

  toJSON(): {
    id: string;
    roomId: string;
    startAt: string;
    endAt: string;
  } {
    return {
      id: this.id,
      roomId: this.roomId,
      startAt: this.startAt.toISOString(),
      endAt: this.endAt.toISOString(),
    };
  }
}
