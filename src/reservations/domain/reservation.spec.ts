import { strict as assert } from "node:assert";
import { test } from "node:test";
import { InvalidReservationError, Reservation } from "./reservation";

/*
 * These tests tell the reservation story from a caller's perspective: valid
 * intervals are created, while malformed, impossible, reversed, or too-short
 * intervals are rejected.
 */
test("creates a reservation with a valid time interval", () => {
  const reservation = Reservation.create(
    "reservation-1",
    "room-a",
    "2030-05-10T10:00:00Z",
    "2030-05-10T11:00:00Z",
  );

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
      Reservation.create(
        "reservation-2",
        "room-a",
        "2030-05-10T11:00:00Z",
        "2030-05-10T10:00:00Z",
      ),
    InvalidReservationError,
  );
});

test("rejects dates that are not in UTC ISO 8601 format", () => {
  assert.throws(
    () =>
      Reservation.create(
        "reservation-3",
        "room-a",
        "2030-05-10T10:00:00Z",
        "2030-05-10T11:00:00",
      ),
    InvalidReservationError,
  );
});

test("rejects dates that do not exist", () => {
  assert.throws(
    () =>
      Reservation.create(
        "reservation-4",
        "room-a",
        "2030-13-10T10:00:00Z",
        "2031-01-10T11:00:00Z",
      ),
    InvalidReservationError,
  );
});

test("rejects a reservation shorter than 15 minutes", () => {
  assert.throws(
    () =>
      Reservation.create(
        "reservation-5",
        "room-a",
        "2030-05-10T10:00:00Z",
        "2030-05-10T10:14:00Z",
      ),
    InvalidReservationError,
  );
});

test("rejects a reservation longer than 8 hours", () => {
  assert.throws(
    () =>
      Reservation.create(
        "reservation-6",
        "room-a",
        "2030-05-10T10:00:00Z",
        "2030-05-10T18:01:00Z",
      ),
    InvalidReservationError,
  );
});

test("accepts a reservation lasting exactly 8 hours", () => {
  assert.doesNotThrow(() =>
    Reservation.create(
      "reservation-7",
      "room-a",
      "2030-05-10T10:00:00Z",
      "2030-05-10T18:00:00Z",
    ),
  );
});
