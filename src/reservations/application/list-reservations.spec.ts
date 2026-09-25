import { strict as assert } from "node:assert";
import { test } from "node:test";
import { UserRole } from "../../authentication/application/authentication-context";
import { ListReservations } from "./list-reservations";
import { ReservationApplicationErrorCode } from "./reservation-application-error";
import {
  createDependencies,
  createStoredReservation,
} from "./reservation.test-support";

/*
 * Here, listing follows the authenticated organization rather than a user ID.
 * Colleagues' active reservations are visible, while cancelled bookings and
 * records from another organization stay outside the result.
 */
for (const role of [UserRole.Member, UserRole.OrganizationAdmin]) {
  test(`lists only active organization reservations for ${role}`, async () => {
    const own = createStoredReservation();
    const colleague = createStoredReservation({
      id: "colleague",
      createdByUserId: "bruno",
    });
    const foreign = createStoredReservation({
      id: "foreign",
      organizationId: "organization-b",
    });
    const cancelled = createStoredReservation({ id: "cancelled" });
    cancelled.cancel();
    const dependencies = createDependencies({
      reservations: [own, colleague, foreign, cancelled],
      authenticatedUser: {
        role,
        organizationId: "organization-a",
        userId: "user-ana",
      },
    });
    const useCase = new ListReservations({
      ...dependencies,
      reservations: dependencies.repository,
    });
    const result = await useCase.execute();

    assert.deepEqual(result.map((item) => item.id).sort(), [
      "colleague",
      "reservation-1",
    ]);
    assert.equal(dependencies.repository.saveCalls, 0);
    assert.equal(dependencies.repository.reservations.length, 4);
  });
}

test("passes the trusted organization to the reader and returns an empty list", async () => {
  const dependencies = createDependencies({
    authenticatedUser: {
      role: UserRole.Member,
      organizationId: "organization-b",
      userId: "bruno",
    },
  });
  const queries: string[] = [];
  const useCase = new ListReservations({
    ...dependencies,
    reservations: {
      async findActiveByOrganization(organizationId) {
        queries.push(organizationId);
        return [];
      },
    },
  });
  assert.deepEqual(await useCase.execute(), []);
  assert.deepEqual(queries, ["organization-b"]);
});

test("rejects platform administrators before querying ordinary reservation lists", async () => {
  const dependencies = createDependencies({
    authenticatedUser: { role: UserRole.PlatformAdmin, userId: "patricia" },
  });
  let queries = 0;
  const useCase = new ListReservations({
    ...dependencies,
    reservations: {
      async findActiveByOrganization() {
        queries += 1;
        return [];
      },
    },
  });
  await assert.rejects(() => useCase.execute(), {
    code: ReservationApplicationErrorCode.OrganizationAccountRequired,
  });
  assert.equal(queries, 0);
});

test("returns snapshots that cannot change the stored reservation", async () => {
  const reservation = createStoredReservation();
  const dependencies = createDependencies({ reservations: [reservation] });
  const useCase = new ListReservations({
    ...dependencies,
    reservations: dependencies.repository,
  });
  const result = await useCase.execute();
  const copy = { ...result[0], startAt: "changed outside the domain" };
  assert.notEqual(copy.startAt, reservation.toJSON().startAt);
  assert.notEqual(result[0], reservation);
});
