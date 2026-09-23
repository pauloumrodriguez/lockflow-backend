import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  InvalidReservationError,
  Reservation,
  ReservationErrorCode,
} from "./reservation";

/*
 * These examples describe accepted reservations and the rule behind each refusal.
 * They also check that parsing and external mutation cannot change the intended
 * interval after validation.
 */
test("creates a reservation with a valid time interval", () => {
  const reservation = Reservation.create({
    id: "reservation-1",
    roomId: "room-a",
    startAt: "2030-05-10T10:00:00Z",
    endAt: "2030-05-10T11:00:00Z",
  });

  assert.deepEqual(reservation.toJSON(), {
    id: "reservation-1",
    roomId: "room-a",
    startAt: "2030-05-10T10:00:00.000Z",
    endAt: "2030-05-10T11:00:00.000Z",
  });
});

test("rejects a reservation when the start is after the end", () => {
  assert.throws(
    () =>
      Reservation.create({
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
      Reservation.create({
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
      Reservation.create({
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
      Reservation.create({
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
      Reservation.create({
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
    Reservation.create({
      id: "reservation-7",
      roomId: "room-a",
      startAt: "2030-05-10T10:00:00Z",
      endAt: "2030-05-10T18:00:00Z",
    }),
  );
});

test("accepts a reservation lasting exactly 15 minutes", () => {
  assert.doesNotThrow(() =>
    Reservation.create({
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
      Reservation.create({
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
      Reservation.create({
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

for (const field of ["startAt", "endAt"] as const) {
  test(`rejects calendar rollover in ${field}`, () => {
    const input = {
      id: "reservation-calendar",
      roomId: "room-a",
      startAt: "2030-03-02T10:00:00Z",
      endAt: "2030-03-02T11:00:00Z",
      [field]: "2030-02-30T10:00:00Z",
    };

    assert.throws(
      () => Reservation.create(input),
      {
        constructor: InvalidReservationError,
        code: ReservationErrorCode.InvalidCalendarDate,
      },
    );
  });
}

test("accepts February 29 in a leap year", () => {
  const reservation = Reservation.create({
    id: "reservation-leap-year",
    roomId: "room-a",
    startAt: "2032-02-29T10:00:00Z",
    endAt: "2032-02-29T11:00:00Z",
  });

  assert.equal(reservation.toJSON().startAt, "2032-02-29T10:00:00.000Z");
});

for (const fraction of ["", ".1", ".12", ".123"]) {
  test(`normalizes UTC timestamps with fraction "${fraction}"`, () => {
    const reservation = Reservation.create({
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
  const reservation = Reservation.create({
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
    startAt: "2030-05-10T10:00:00.000Z",
    endAt: "2030-05-10T11:00:00.000Z",
  });
});
