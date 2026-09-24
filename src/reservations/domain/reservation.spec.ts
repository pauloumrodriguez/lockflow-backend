import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  CreateReservationInput,
  InvalidReservationError,
  Reservation,
  ReservationErrorCode,
  ReservationStatus,
} from "./reservation";

type TestReservationInput = Omit<
  CreateReservationInput,
  "organizationId" | "createdByUserId"
>;

function createTestReservation(input: TestReservationInput): Reservation {
  return Reservation.create({
    ...input,
    organizationId: "organization-a",
    createdByUserId: "user-ana",
  });
}

/*
 * These examples describe accepted reservations and the rule behind each refusal.
 * They also check that parsing and external mutation cannot change the intended
 * interval after validation.
 */
test("creates a reservation with a valid time interval", () => {
  const reservation = createTestReservation({
    id: "reservation-1",
    roomId: "room-a",
    startAt: "2030-05-10T10:00:00Z",
    endAt: "2030-05-10T11:00:00Z",
  });

  assert.deepEqual(reservation.toJSON(), {
    id: "reservation-1",
    roomId: "room-a",
    organizationId: "organization-a",
    createdByUserId: "user-ana",
    status: ReservationStatus.Active,
    startAt: "2030-05-10T10:00:00.000Z",
    endAt: "2030-05-10T11:00:00.000Z",
  });
});

test("rejects a reservation when the start is after the end", () => {
  assert.throws(
    () =>
      createTestReservation({
        id: "reservation-2",
        roomId: "room-a",
        startAt: "2030-05-10T11:00:00Z",
        endAt: "2030-05-10T10:00:00Z",
      }),
    {
      constructor: InvalidReservationError,
      code: ReservationErrorCode.InvalidTimeOrder,
    },
  );
});

test("rejects dates that are not in UTC ISO 8601 format", () => {
  assert.throws(
    () =>
      createTestReservation({
        id: "reservation-3",
        roomId: "room-a",
        startAt: "2030-05-10T10:00:00Z",
        endAt: "2030-05-10T11:00:00",
      }),
    {
      constructor: InvalidReservationError,
      code: ReservationErrorCode.InvalidDateFormat,
    },
  );
});

test("rejects dates that do not exist", () => {
  assert.throws(
    () =>
      createTestReservation({
        id: "reservation-4",
        roomId: "room-a",
        startAt: "2030-13-10T10:00:00Z",
        endAt: "2031-01-10T11:00:00Z",
      }),
    {
      constructor: InvalidReservationError,
      code: ReservationErrorCode.InvalidCalendarDate,
    },
  );
});

test("rejects a reservation shorter than 15 minutes", () => {
  assert.throws(
    () =>
      createTestReservation({
        id: "reservation-5",
        roomId: "room-a",
        startAt: "2030-05-10T10:00:00Z",
        endAt: "2030-05-10T10:14:00Z",
      }),
    {
      constructor: InvalidReservationError,
      code: ReservationErrorCode.DurationTooShort,
    },
  );
});

test("rejects a reservation longer than 8 hours", () => {
  assert.throws(
    () =>
      createTestReservation({
        id: "reservation-6",
        roomId: "room-a",
        startAt: "2030-05-10T10:00:00Z",
        endAt: "2030-05-10T18:01:00Z",
      }),
    {
      constructor: InvalidReservationError,
      code: ReservationErrorCode.DurationTooLong,
    },
  );
});

test("accepts a reservation lasting exactly 8 hours", () => {
  assert.doesNotThrow(() =>
    createTestReservation({
      id: "reservation-7",
      roomId: "room-a",
      startAt: "2030-05-10T10:00:00Z",
      endAt: "2030-05-10T18:00:00Z",
    }),
  );
});

test("accepts a reservation lasting exactly 15 minutes", () => {
  assert.doesNotThrow(() =>
    createTestReservation({
      id: "reservation-8",
      roomId: "room-a",
      startAt: "2030-05-10T10:00:00Z",
      endAt: "2030-05-10T10:15:00Z",
    }),
  );
});

test("rejects a reservation when start and end are equal", () => {
  assert.throws(
    () =>
      createTestReservation({
        id: "reservation-9",
        roomId: "room-a",
        startAt: "2030-05-10T10:00:00Z",
        endAt: "2030-05-10T10:00:00Z",
      }),
    {
      constructor: InvalidReservationError,
      code: ReservationErrorCode.InvalidTimeOrder,
    },
  );
});

test("rejects an invalid room identifier", () => {
  assert.throws(
    () =>
      createTestReservation({
        id: "reservation-10",
        roomId: "Room A",
        startAt: "2030-05-10T10:00:00Z",
        endAt: "2030-05-10T11:00:00Z",
      }),
    {
      constructor: InvalidReservationError,
      code: ReservationErrorCode.InvalidRoomId,
    },
  );
});

for (const { description, roomId } of [
  { description: "an empty room identifier", roomId: "" },
  {
    description: "a room identifier containing an underscore",
    roomId: "room_a",
  },
  {
    description: "a room identifier longer than 40 characters",
    roomId: "a".repeat(41),
  },
]) {
  test(`rejects ${description}`, () => {
    assert.throws(
      () =>
        createTestReservation({
          id: "reservation-invalid-room-id",
          roomId,
          startAt: "2030-05-10T10:00:00Z",
          endAt: "2030-05-10T11:00:00Z",
        }),
      {
        constructor: InvalidReservationError,
        code: ReservationErrorCode.InvalidRoomId,
      },
    );
  });
}

test("accepts a room identifier with exactly 40 valid characters", () => {
  const roomId = "a".repeat(40);

  const reservation = createTestReservation({
    id: "reservation-40-character-room-id",
    roomId,
    startAt: "2030-05-10T10:00:00Z",
    endAt: "2030-05-10T11:00:00Z",
  });

  assert.equal(reservation.roomId, roomId);
});

for (const field of ["startAt", "endAt"] as const) {
  test(`rejects calendar rollover in ${field}`, () => {
    const input = {
      id: "reservation-calendar",
      roomId: "room-a",
      startAt: "2030-03-02T10:00:00Z",
      endAt: "2030-03-02T11:00:00Z",
      [field]: "2030-02-30T10:00:00Z",
    };

    assert.throws(() => createTestReservation(input), {
      constructor: InvalidReservationError,
      code: ReservationErrorCode.InvalidCalendarDate,
    });
  });
}

test("accepts February 29 in a leap year", () => {
  const reservation = createTestReservation({
    id: "reservation-leap-year",
    roomId: "room-a",
    startAt: "2032-02-29T10:00:00Z",
    endAt: "2032-02-29T11:00:00Z",
  });

  assert.equal(reservation.toJSON().startAt, "2032-02-29T10:00:00.000Z");
});

for (const fraction of ["", ".1", ".12", ".123"]) {
  test(`normalizes UTC timestamps with fraction "${fraction}"`, () => {
    const reservation = createTestReservation({
      id: "reservation-fraction",
      roomId: "room-a",
      startAt: `2030-05-10T10:00:00${fraction}Z`,
      endAt: `2030-05-10T11:00:00${fraction}Z`,
    });
    const milliseconds = fraction.slice(1).padEnd(3, "0");

    assert.equal(
      reservation.toJSON().startAt,
      `2030-05-10T10:00:00.${milliseconds}Z`,
    );
  });
}

test("protects its interval when a caller modifies returned dates", () => {
  const reservation = createTestReservation({
    id: "reservation-protected",
    roomId: "room-a",
    startAt: "2030-05-10T10:00:00Z",
    endAt: "2030-05-10T11:00:00Z",
  });

  reservation.startAt.setUTCFullYear(2000);
  reservation.endAt.setTime(0);

  assert.deepEqual(reservation.toJSON(), {
    id: "reservation-protected",
    roomId: "room-a",
    organizationId: "organization-a",
    createdByUserId: "user-ana",
    status: ReservationStatus.Active,
    startAt: "2030-05-10T10:00:00.000Z",
    endAt: "2030-05-10T11:00:00.000Z",
  });
});

test("detects overlapping intervals in the same room", () => {
  const first = createTestReservation({
    id: "reservation-overlap-first",
    roomId: "room-a",
    startAt: "2030-05-10T10:00:00Z",
    endAt: "2030-05-10T11:00:00Z",
  });
  const second = createTestReservation({
    id: "reservation-overlap-second",
    roomId: "room-a",
    startAt: "2030-05-10T10:30:00Z",
    endAt: "2030-05-10T11:30:00Z",
  });

  assert.equal(first.overlaps(second), true);
  assert.equal(second.overlaps(first), true);
});

test("allows adjacent intervals in the same room", () => {
  const first = createTestReservation({
    id: "reservation-adjacent-first",
    roomId: "room-a",
    startAt: "2030-05-10T10:00:00Z",
    endAt: "2030-05-10T11:00:00Z",
  });
  const second = createTestReservation({
    id: "reservation-adjacent-second",
    roomId: "room-a",
    startAt: "2030-05-10T11:00:00Z",
    endAt: "2030-05-10T12:00:00Z",
  });

  assert.equal(first.overlaps(second), false);
  assert.equal(second.overlaps(first), false);
});

test("does not overlap equal intervals in different rooms", () => {
  const first = createTestReservation({
    id: "reservation-room-a",
    roomId: "room-a",
    startAt: "2030-05-10T10:00:00Z",
    endAt: "2030-05-10T11:00:00Z",
  });
  const second = createTestReservation({
    id: "reservation-room-b",
    roomId: "room-b",
    startAt: "2030-05-10T10:00:00Z",
    endAt: "2030-05-10T11:00:00Z",
  });

  assert.equal(first.overlaps(second), false);
  assert.equal(second.overlaps(first), false);
});

test("detects a reservation contained within another reservation", () => {
  const outer = createTestReservation({
    id: "reservation-outer",
    roomId: "room-a",
    startAt: "2030-05-10T10:00:00Z",
    endAt: "2030-05-10T12:00:00Z",
  });
  const inner = createTestReservation({
    id: "reservation-inner",
    roomId: "room-a",
    startAt: "2030-05-10T10:30:00Z",
    endAt: "2030-05-10T11:00:00Z",
  });

  assert.equal(outer.overlaps(inner), true);
  assert.equal(inner.overlaps(outer), true);
});

for (const { description, startAt, endAt, expected } of [
  {
    description: "detects equal intervals in the same room",
    startAt: "2030-05-10T10:00:00Z",
    endAt: "2030-05-10T11:00:00Z",
    expected: true,
  },
  {
    description: "allows intervals separated by a gap in the same room",
    startAt: "2030-05-10T12:00:00Z",
    endAt: "2030-05-10T13:00:00Z",
    expected: false,
  },
  {
    description: "detects an overlap of one millisecond",
    startAt: "2030-05-10T10:59:59.999Z",
    endAt: "2030-05-10T12:00:00Z",
    expected: true,
  },
]) {
  test(description, () => {
    const first = createTestReservation({
      id: "reservation-boundary-first",
      roomId: "room-a",
      startAt: "2030-05-10T10:00:00Z",
      endAt: "2030-05-10T11:00:00Z",
    });
    const second = createTestReservation({
      id: "reservation-boundary-second",
      roomId: "room-a",
      startAt,
      endAt,
    });

    assert.equal(first.overlaps(second), expected);
    assert.equal(second.overlaps(first), expected);
  });
}

test("cancels an active reservation and preserves its history", () => {
  const reservation = createTestReservation({
    id: "reservation-to-cancel",
    roomId: "room-a",
    startAt: "2030-05-10T10:00:00Z",
    endAt: "2030-05-10T11:00:00Z",
  });

  reservation.cancel();

  assert.deepEqual(reservation.toJSON(), {
    id: "reservation-to-cancel",
    roomId: "room-a",
    organizationId: "organization-a",
    createdByUserId: "user-ana",
    status: ReservationStatus.Cancelled,
    startAt: "2030-05-10T10:00:00.000Z",
    endAt: "2030-05-10T11:00:00.000Z",
  });
});

test("rejects cancelling an already cancelled reservation", () => {
  const reservation = createTestReservation({
    id: "cancelled-reservation",
    roomId: "room-a",
    startAt: "2030-05-10T10:00:00Z",
    endAt: "2030-05-10T11:00:00Z",
  });

  reservation.cancel();

  assert.throws(() => reservation.cancel(), {
    constructor: InvalidReservationError,
    code: ReservationErrorCode.AlreadyCancelled,
  });
});

test("a cancelled reservation no longer blocks its time interval", () => {
  const cancelledReservation = createTestReservation({
    id: "cancelled-reservation",
    roomId: "room-a",
    startAt: "2030-05-10T10:00:00Z",
    endAt: "2030-05-10T11:00:00Z",
  });
  const activeReservation = createTestReservation({
    id: "active-reservation",
    roomId: "room-a",
    startAt: "2030-05-10T10:30:00Z",
    endAt: "2030-05-10T11:30:00Z",
  });

  assert.equal(cancelledReservation.overlaps(activeReservation), true);

  cancelledReservation.cancel();

  assert.equal(cancelledReservation.overlaps(activeReservation), false);
  assert.equal(activeReservation.overlaps(cancelledReservation), false);
});
