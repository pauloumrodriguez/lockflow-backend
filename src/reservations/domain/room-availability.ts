import {
  InvalidReservationError,
  ReservationErrorCode,
  parseUtcDate,
  validateDuration,
  validateRoomId,
  validateTimeOrder,
} from "./reservation";

export interface TimeIntervalSnapshot {
  readonly startAt: string;
  readonly endAt: string;
}

export interface RoomAvailabilityRequest extends TimeIntervalSnapshot {
  readonly roomId: string;
  readonly durationMinutes: number;
}

export interface RoomScheduleQuery extends TimeIntervalSnapshot {
  readonly roomId: string;
}

interface TimeIntervalMilliseconds {
  readonly start: number;
  readonly end: number;
}

/*
 * Here, a search window subtracts occupied time from a room's schedule.
 * It returns whole free intervals that fit the requested duration, without
 * carrying reservation IDs or ownership. The search itself may span many days.
 */
export class RoomAvailabilityWindow {
  private constructor(
    private readonly roomId: string,
    private readonly startMs: number,
    private readonly endMs: number,
    private readonly durationMs: number,
  ) {}

  static create(request: RoomAvailabilityRequest): RoomAvailabilityWindow {
    validateRoomId(request.roomId);
    const startMs = parseUtcDate(request.startAt);
    const endMs = parseUtcDate(request.endAt);
    validateTimeOrder(startMs, endMs);

    if (!Number.isFinite(request.durationMinutes)) {
      throw new InvalidReservationError(
        ReservationErrorCode.InvalidDuration,
        "The requested duration must be a finite number of minutes.",
      );
    }
    const durationMs = request.durationMinutes * 60 * 1000;
    validateDuration(0, durationMs);

    return new RoomAvailabilityWindow(
      request.roomId,
      startMs,
      endMs,
      durationMs,
    );
  }

  toQuery(): RoomScheduleQuery {
    return {
      roomId: this.roomId,
      startAt: new Date(this.startMs).toISOString(),
      endAt: new Date(this.endMs).toISOString(),
    };
  }

  findFreeIntervals(
    busyIntervals: readonly TimeIntervalSnapshot[],
  ): readonly TimeIntervalSnapshot[] {
    const occupied = this.clipAndSort(busyIntervals);
    const available: TimeIntervalSnapshot[] = [];
    let freeStartMs = this.startMs;

    // Advancing one boundary also merges overlapping or touching busy intervals.
    for (const interval of occupied) {
      this.appendIfLongEnough(available, freeStartMs, interval.start);
      freeStartMs = Math.max(freeStartMs, interval.end);
    }
    this.appendIfLongEnough(available, freeStartMs, this.endMs);
    return available;
  }

  private clipAndSort(
    intervals: readonly TimeIntervalSnapshot[],
  ): TimeIntervalMilliseconds[] {
    return intervals
      .map((interval) => {
        const start = parseUtcDate(interval.startAt);
        const end = parseUtcDate(interval.endAt);
        validateTimeOrder(start, end);
        return {
          start: Math.max(this.startMs, start),
          end: Math.min(this.endMs, end),
        };
      })
      .filter((interval) => interval.start < interval.end)
      .sort((left, right) => left.start - right.start);
  }

  private appendIfLongEnough(
    available: TimeIntervalSnapshot[],
    startMs: number,
    endMs: number,
  ): void {
    if (endMs - startMs >= this.durationMs) {
      available.push({
        startAt: new Date(startMs).toISOString(),
        endAt: new Date(endMs).toISOString(),
      });
    }
  }
}
