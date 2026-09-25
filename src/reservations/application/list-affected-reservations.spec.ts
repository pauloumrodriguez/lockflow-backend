import { strict as assert } from "node:assert";
import { test } from "node:test";
import { UserRole } from "../../authentication/application/authentication-context";
import { ListAffectedReservations } from "./list-affected-reservations";
import { ReservationApplicationErrorCode } from "./reservation-application-error";
import { AdministrativeReservationScope } from "./reservation-repository";
import {
  createDependencies,
  createStoredReservation,
} from "./reservation.test-support";

/*
 * Here, an administrative query is limited to the selected room or organization.
 * The scenarios distinguish this permission from ordinary organization listing
 * and keep past or cancelled records outside the set of future affected bookings.
 */
function createContext() {
  const roomA = createStoredReservation();
  const foreign = createStoredReservation({
    id: "foreign",
    organizationId: "organization-b",
  });
  const roomB = createStoredReservation({
    id: "room-b-booking",
    roomId: "room-b",
  });
  const cancelled = createStoredReservation({ id: "cancelled" });
  cancelled.cancel();
  const past = createStoredReservation({
    id: "past",
    startAt: "2030-04-30T10:00:00Z",
    endAt: "2030-04-30T11:00:00Z",
  });
  const atNow = createStoredReservation({
    id: "at-now",
    startAt: "2030-05-01T10:00:00Z",
    endAt: "2030-05-01T11:00:00Z",
  });
  const dependencies = createDependencies({
    authenticatedUser: { role: UserRole.PlatformAdmin, userId: "patricia" },
    reservations: [roomA, foreign, roomB, cancelled, past, atNow],
  });
  return new ListAffectedReservations({
    ...dependencies,
    reservations: dependencies.repository,
  });
}

test("lists future active reservations across organizations for an affected room", async () => {
  const result = await createContext().execute({
    scope: AdministrativeReservationScope.Room,
    roomId: "room-a",
  });
  assert.deepEqual(result.map((item) => item.id).sort(), [
    "at-now",
    "foreign",
    "reservation-1",
  ]);
});

test("lists future active reservations across rooms for an affected organization", async () => {
  const result = await createContext().execute({
    scope: AdministrativeReservationScope.Organization,
    organizationId: "organization-a",
  });
  assert.deepEqual(result.map((item) => item.id).sort(), [
    "at-now",
    "reservation-1",
    "room-b-booking",
  ]);
});

test("returns an empty affected list when the selected resource has no future bookings", async () => {
  assert.deepEqual(
    await createContext().execute({
      scope: AdministrativeReservationScope.Room,
      roomId: "unused-room",
    }),
    [],
  );
});

for (const role of [UserRole.Member, UserRole.OrganizationAdmin]) {
  test(`rejects an administrative reservation query by ${role} before accessing data`, async () => {
    const dependencies = createDependencies({
      authenticatedUser: {
        role,
        userId: "ana",
        organizationId: "organization-a",
      },
    });
    let queries = 0;
    const useCase = new ListAffectedReservations({
      ...dependencies,
      reservations: {
        async findFutureActive() {
          queries += 1;
          return [];
        },
      },
    });
    await assert.rejects(
      () =>
        useCase.execute({
          scope: AdministrativeReservationScope.Room,
          roomId: "room-a",
        }),
      { code: ReservationApplicationErrorCode.PlatformAccountRequired },
    );
    assert.equal(queries, 0);
  });
}
