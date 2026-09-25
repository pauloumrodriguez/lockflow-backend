import { strict as assert } from "node:assert";
import { test } from "node:test";
import { UserRole } from "../../authentication/application/authentication-context";
import { ReservationErrorCode, ReservationStatus } from "../domain/reservation";
import { ReservationApplicationErrorCode } from "./reservation-application-error";
import { RescheduleReservation } from "./reschedule-reservation";
import {
  createDependencies,
  createStoredReservation,
  type TestContextOptions,
} from "./reservation.test-support";

const NEW_PERIOD = {
  reservationId: "reservation-1",
  startAt: "2030-05-10T10:30:00Z",
  endAt: "2030-05-10T11:30:00Z",
};

function createContext(options: TestContextOptions = {}) {
  const original = createStoredReservation();
  const dependencies = createDependencies({ reservations: [original], ...options });
  return { ...dependencies, original, useCase: new RescheduleReservation(dependencies) };
}

/*
 * Here, rescheduling is tested as a complete change of period, with the same
 * identity and owner. Every rejection checks persisted data as well as the error,
 * so an unsuccessful request cannot quietly damage the original reservation.
 */
test("reschedules an owned reservation without conflicting with its previous period", async () => {
  const { useCase, repository, original } = createContext();
  const before = original.toJSON();
  const result = await useCase.execute(NEW_PERIOD);

  assert.deepEqual(result, {
    ...before,
    startAt: "2030-05-10T10:30:00.000Z",
    endAt: "2030-05-10T11:30:00.000Z",
  });
  assert.equal(repository.reservations.length, 1);
  assert.equal(repository.saveCalls, 1);
  assert.deepEqual(repository.reservations[0]?.toJSON(), result);
  assert.deepEqual(original.toJSON(), before);
});

test("ignores runtime attempts to change the room or ownership while rescheduling", async () => {
  const { useCase } = createContext();
  const request = { ...NEW_PERIOD, roomId: "room-b", organizationId: "other", createdByUserId: "other" };
  const result = await useCase.execute(request);
  assert.equal(result.roomId, "room-a");
  assert.equal(result.organizationId, "organization-a");
  assert.equal(result.createdByUserId, "user-ana");
});

test("allows an organization administrator to reschedule another member's reservation", async () => {
  const { useCase } = createContext({
    authenticatedUser: { role: UserRole.OrganizationAdmin, userId: "olivia", organizationId: "organization-a" },
  });
  assert.equal((await useCase.execute(NEW_PERIOD)).createdByUserId, "user-ana");
});

for (const scenario of [
  { name: "another member", user: { role: UserRole.Member, userId: "bruno", organizationId: "organization-a" }, code: ReservationApplicationErrorCode.NotAllowed },
  { name: "a member of another organization", user: { role: UserRole.Member, userId: "user-ana", organizationId: "organization-b" }, code: ReservationApplicationErrorCode.NotFound },
  { name: "an administrator of another organization", user: { role: UserRole.OrganizationAdmin, userId: "olivia", organizationId: "organization-b" }, code: ReservationApplicationErrorCode.NotFound },
  { name: "a platform administrator", user: { role: UserRole.PlatformAdmin, userId: "patricia" }, code: ReservationApplicationErrorCode.OrganizationAccountRequired },
] as const) {
  test(`rejects rescheduling by ${scenario.name} without changing stored data`, async () => {
    const { useCase, repository, original } = createContext({ authenticatedUser: scenario.user });
    const before = original.toJSON();
    await assert.rejects(() => useCase.execute(NEW_PERIOD), { code: scenario.code });
    assert.deepEqual(repository.reservations.map((item) => item.toJSON()), [before]);
    assert.equal(repository.saveCalls, 0);
  });
}

test("uses the same not-found response for missing and hidden reservations", async () => {
  const missing = createContext({ reservations: [] });
  const hidden = createContext({
    authenticatedUser: { role: UserRole.Member, userId: "bruno", organizationId: "organization-b" },
  });
  for (const context of [missing, hidden]) {
    await assert.rejects(() => context.useCase.execute(NEW_PERIOD), {
      code: ReservationApplicationErrorCode.NotFound,
      message: "The requested reservation was not found.",
    });
  }
});

for (const scenario of [
  { name: "reversed times", startAt: "2030-05-10T12:00:00Z", endAt: "2030-05-10T11:00:00Z", code: ReservationErrorCode.InvalidTimeOrder },
  { name: "an impossible date", startAt: "2030-02-30T10:00:00Z", endAt: "2030-03-01T11:00:00Z", code: ReservationErrorCode.InvalidCalendarDate },
  { name: "less than 15 minutes", startAt: "2030-05-10T12:00:00Z", endAt: "2030-05-10T12:14:59Z", code: ReservationErrorCode.DurationTooShort },
  { name: "more than 8 hours", startAt: "2030-05-10T10:00:00Z", endAt: "2030-05-10T18:00:01Z", code: ReservationErrorCode.DurationTooLong },
  { name: "a start in the past", startAt: "2030-05-01T09:59:59Z", endAt: "2030-05-01T11:00:00Z", code: ReservationApplicationErrorCode.StartInPast },
  { name: "a start more than 90 days ahead", startAt: "2030-07-30T10:00:01Z", endAt: "2030-07-30T11:00:01Z", code: ReservationApplicationErrorCode.StartTooFarInAdvance },
]) {
  test(`preserves the original when rescheduling requests ${scenario.name}`, async () => {
    const { useCase, repository, original } = createContext();
    const before = original.toJSON();
    await assert.rejects(() => useCase.execute({
      reservationId: original.id, startAt: scenario.startAt, endAt: scenario.endAt,
    }), { code: scenario.code });
    assert.deepEqual(repository.reservations[0]?.toJSON(), before);
    assert.equal(repository.saveCalls, 0);
  });
}

for (const startAt of ["2030-05-01T10:00:00Z", "2030-07-30T10:00:00Z"]) {
  test(`accepts the rescheduling booking boundary ${startAt}`, async () => {
    const { useCase } = createContext();
    const endAt = new Date(new Date(startAt).getTime() + 15 * 60 * 1000).toISOString();
    const result = await useCase.execute({ reservationId: NEW_PERIOD.reservationId, startAt, endAt });
    assert.equal(result.startAt, new Date(startAt).toISOString());
  });
}

test("rejects rescheduling a cancelled reservation", async () => {
  const { original, useCase, repository } = createContext();
  original.cancel();
  await assert.rejects(() => useCase.execute(NEW_PERIOD), { code: ReservationErrorCode.AlreadyCancelled });
  assert.equal(repository.saveCalls, 0);
  assert.equal(original.status, ReservationStatus.Cancelled);
});

test("rejects rescheduling into an unavailable room", async () => {
  const { useCase, original, repository } = createContext({ reservableRoomIds: [] });
  const before = original.toJSON();
  await assert.rejects(() => useCase.execute(NEW_PERIOD), { code: ReservationApplicationErrorCode.RoomUnavailable });
  assert.deepEqual(original.toJSON(), before);
  assert.equal(repository.saveCalls, 0);
});

test("preserves the original when another organization's reservation conflicts", async () => {
  const original = createStoredReservation();
  const conflict = createStoredReservation({
    id: "other-reservation", organizationId: "organization-b", createdByUserId: "bruno",
    startAt: "2030-05-10T11:00:00Z", endAt: "2030-05-10T12:00:00Z",
  });
  const { useCase, repository } = createContext({ reservations: [original, conflict] });
  const before = repository.reservations.map((item) => item.toJSON());
  await assert.rejects(() => useCase.execute(NEW_PERIOD), {
    code: ReservationApplicationErrorCode.Overlap,
    message: "The requested reservation time is unavailable.",
  });
  assert.deepEqual(repository.reservations.map((item) => item.toJSON()), before);
  assert.equal(repository.saveCalls, 0);
});

test("allows a rescheduled period adjacent to another active booking", async () => {
  const original = createStoredReservation();
  const other = createStoredReservation({
    id: "other", startAt: "2030-05-10T11:30:00Z", endAt: "2030-05-10T12:30:00Z",
  });
  const { useCase } = createContext({ reservations: [original, other] });
  assert.equal((await useCase.execute(NEW_PERIOD)).endAt, "2030-05-10T11:30:00.000Z");
});

test("ignores cancelled bookings and bookings in another room during rescheduling", async () => {
  const original = createStoredReservation();
  const cancelled = createStoredReservation({ id: "cancelled", ...{startAt: NEW_PERIOD.startAt, endAt: NEW_PERIOD.endAt} });
  cancelled.cancel();
  const otherRoom = createStoredReservation({ id: "other-room", roomId: "room-b" });
  const { useCase } = createContext({ reservations: [original, cancelled, otherRoom] });
  assert.equal((await useCase.execute(NEW_PERIOD)).status, ReservationStatus.Active);
});

test("preserves the original if saving the proposed period fails", async () => {
  const { useCase, repository, original } = createContext();
  const before = original.toJSON();
  const failure = new Error("Persistence failed.");
  repository.saveError = failure;
  await assert.rejects(() => useCase.execute(NEW_PERIOD), failure);
  assert.deepEqual(repository.reservations[0]?.toJSON(), before);
});
