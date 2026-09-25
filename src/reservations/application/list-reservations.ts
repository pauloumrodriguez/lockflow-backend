import type { AuthenticationContext } from "../../authentication/application/authentication-context";
import type { ReservationSnapshot } from "../domain/reservation";
import { requireOrganizationUser } from "./reservation-access";
import type { OrganizationReservationReader } from "./reservation-repository";

export interface ListReservationsDependencies {
  readonly reservations: OrganizationReservationReader;
  readonly authenticationContext: AuthenticationContext;
}

/*
 * Here, members and organization administrators see their organization's active
 * reservations, including those created by colleagues. The organization filter
 * comes only from the trusted identity, never from caller-supplied query data.
 */
export class ListReservations {
  constructor(private readonly dependencies: ListReservationsDependencies) {}

  async execute(): Promise<readonly ReservationSnapshot[]> {
    const user = requireOrganizationUser(
      this.dependencies.authenticationContext.getAuthenticatedUser(),
    );
    const reservations =
      await this.dependencies.reservations.findActiveByOrganization(
        user.organizationId,
      );
    return reservations.map((reservation) => reservation.toJSON());
  }
}
