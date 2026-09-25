import { strict as assert } from "node:assert";
import { test } from "node:test";
import { ReservationErrorCode } from "./reservation";
import {
  RoomAvailabilityWindow,
  type RoomAvailabilityRequest,
  type TimeIntervalSnapshot,
} from "./room-availability";

const REQUEST: RoomAvailabilityRequest = {
  roomId: "room-a",
  startAt: "2030-05-10T09:00:00Z",
  endAt: "2030-05-10T17:00:00Z",
  durationMinutes: 30,
};

function interval(start: string, end: string): TimeIntervalSnapshot {
  return {
    startAt: `2030-05-10T${start}:00.000Z`,
    endAt: `2030-05-10T${end}:00.000Z`,
  };
}

/*
 * Here, a schedule becomes free time by subtracting busy intervals.
 * Boundary scenarios protect against gaps caused by sorting, containment, or
 * touching intervals. Results always describe whole gaps, not individual slots.
 */
test("returns the entire search window when no time is occupied", () => {
  assert.deepEqual(
    RoomAvailabilityWindow.create(REQUEST).findFreeIntervals([]),
    [interval("09:00", "17:00")],
  );
});

test("returns whole qualifying gaps in chronological order", () => {
  const busy = [interval("14:00", "15:00"), interval("10:00", "11:00")];
  const before = structuredClone(busy);
  assert.deepEqual(
    RoomAvailabilityWindow.create(REQUEST).findFreeIntervals(busy),
    [
      interval("09:00", "10:00"),
      interval("11:00", "14:00"),
      interval("15:00", "17:00"),
    ],
  );
  assert.deepEqual(busy, before);
});

test("clips bookings that extend outside the window", () => {
  assert.deepEqual(
    RoomAvailabilityWindow.create(REQUEST).findFreeIntervals([
      interval("08:00", "10:00"),
      interval("16:00", "18:00"),
    ]),
    [interval("10:00", "16:00")],
  );
});

test("merges overlapping, contained, and touching busy intervals", () => {
  assert.deepEqual(
    RoomAvailabilityWindow.create(REQUEST).findFreeIntervals([
      interval("11:00", "12:00"),
      interval("09:00", "11:00"),
      interval("10:00", "11:30"),
      interval("09:30", "10:00"),
      interval("14:00", "15:00"),
      interval("15:00", "16:00"),
    ]),
    [interval("12:00", "14:00"), interval("16:00", "17:00")],
  );
});

test("ignores busy intervals outside or merely touching the search window", () => {
  assert.deepEqual(
    RoomAvailabilityWindow.create(REQUEST).findFreeIntervals([
      interval("08:00", "09:00"),
      interval("17:00", "18:00"),
    ]),
    [interval("09:00", "17:00")],
  );
});

test("returns no free interval when a booking covers the entire window", () => {
  assert.deepEqual(
    RoomAvailabilityWindow.create(REQUEST).findFreeIntervals([
      interval("08:00", "18:00"),
    ]),
    [],
  );
});

test("keeps a gap exactly as long as requested and rejects one millisecond less", () => {
  const window = RoomAvailabilityWindow.create({
    ...REQUEST,
    endAt: "2030-05-10T11:00:00Z",
  });
  assert.deepEqual(window.findFreeIntervals([interval("09:30", "10:30")]), [
    interval("09:00", "09:30"),
    interval("10:30", "11:00"),
  ]);
  assert.deepEqual(
    window.findFreeIntervals([
      {
        startAt: "2030-05-10T09:29:59.999Z",
        endAt: "2030-05-10T10:30:00.001Z",
      },
    ]),
    [],
  );
});

test("accepts a multi-day search window without applying the booking duration limit to it", () => {
  const window = RoomAvailabilityWindow.create({
    ...REQUEST,
    endAt: "2030-05-12T09:00:00Z",
    durationMinutes: 480,
  });
  assert.deepEqual(window.findFreeIntervals([]), [
    {
      startAt: "2030-05-10T09:00:00.000Z",
      endAt: "2030-05-12T09:00:00.000Z",
    },
  ]);
});

test("returns no interval when the search window is shorter than the requested duration", () => {
  const window = RoomAvailabilityWindow.create({
    ...REQUEST,
    endAt: "2030-05-10T09:15:00Z",
    durationMinutes: 30,
  });
  assert.deepEqual(window.findFreeIntervals([]), []);
});

for (const durationMinutes of [15, 480]) {
  test(`accepts the desired-duration boundary of ${durationMinutes} minutes`, () => {
    assert.equal(
      RoomAvailabilityWindow.create({
        ...REQUEST,
        durationMinutes,
      }).findFreeIntervals([]).length,
      1,
    );
  });
}

for (const scenario of [
  {
    name: "an invalid room ID",
    input: { roomId: "Room A" },
    code: ReservationErrorCode.InvalidRoomId,
  },
  {
    name: "a non-UTC start",
    input: { startAt: "2030-05-10T09:00:00" },
    code: ReservationErrorCode.InvalidDateFormat,
  },
  {
    name: "a non-UTC end",
    input: { endAt: "2030-05-10T17:00:00+00:00" },
    code: ReservationErrorCode.InvalidDateFormat,
  },
  {
    name: "a calendar rollover",
    input: { startAt: "2030-02-30T09:00:00Z" },
    code: ReservationErrorCode.InvalidCalendarDate,
  },
  {
    name: "equal boundaries",
    input: { endAt: REQUEST.startAt },
    code: ReservationErrorCode.InvalidTimeOrder,
  },
  {
    name: "reversed boundaries",
    input: { endAt: "2030-05-10T08:00:00Z" },
    code: ReservationErrorCode.InvalidTimeOrder,
  },
  {
    name: "a duration below 15 minutes",
    input: { durationMinutes: 14 },
    code: ReservationErrorCode.DurationTooShort,
  },
  {
    name: "a duration above 8 hours",
    input: { durationMinutes: 481 },
    code: ReservationErrorCode.DurationTooLong,
  },
  {
    name: "a negative duration",
    input: { durationMinutes: -30 },
    code: ReservationErrorCode.DurationTooShort,
  },
  {
    name: "a NaN duration",
    input: { durationMinutes: Number.NaN },
    code: ReservationErrorCode.InvalidDuration,
  },
  {
    name: "an infinite duration",
    input: { durationMinutes: Infinity },
    code: ReservationErrorCode.InvalidDuration,
  },
]) {
  test(`rejects an availability search with ${scenario.name}`, () => {
    assert.throws(
      () => RoomAvailabilityWindow.create({ ...REQUEST, ...scenario.input }),
      { code: scenario.code },
    );
  });
}

test("rejects malformed busy intervals instead of reporting unreliable free time", () => {
  const window = RoomAvailabilityWindow.create(REQUEST);
  assert.throws(() => window.findFreeIntervals([interval("11:00", "10:00")]), {
    code: ReservationErrorCode.InvalidTimeOrder,
  });
});
