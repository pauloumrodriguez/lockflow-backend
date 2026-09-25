import type { AuthenticationContext } from "../../authentication/application/authentication-context";
import type { ReservationSnapshot } from "../domain/reservation";
import { requirePlatformAdministrator } from "./reservation-access";
import type {
  AffectedReservationFilter,
  AffectedReservationReader,
} from "./reservation-repository";
import type { Clock } from "./reservation-services";

export interface ListAffectedReservationsDependencies {
  readonly reservations: AffectedReservationReader;
  readonly authenticationContext: AuthenticationContext;
  readonly clock: Clock;
}

/*
 * Here, platform administrators inspect future active bookings affected by one
 * room or organization. This focused query supports explicit administrative
 * decisions and does not grant ordinary users access to another organization.
 */
export class ListAffectedReservations {
  constructor(
    private readonly dependencies: ListAffectedReservationsDependencies,
  ) {}

  async execute(
    request: AffectedReservationFilter,
  ): Promise<readonly ReservationSnapshot[]> {
    requirePlatformAdministrator(
      this.dependencies.authenticationContext.getAuthenticatedUser(),
    );
    const reservations = await this.dependencies.reservations.findFutureActive(
      request,
      this.dependencies.clock.now(),
    );
    return reservations.map((reservation) => reservation.toJSON());
  }
}
