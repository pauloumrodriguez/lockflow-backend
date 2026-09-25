# LockFlow Backend

A backend API for managing shared room reservations across multiple organizations.

## Project Overview

LockFlow is a backend system that allows users from different organizations to reserve shared rooms.

Each organization can access only its own users and reservations. However, because the rooms are shared, a reservation created by one organization blocks the selected time slot for every other organization.

### Example

Ana, from Company A, reserves Room A from 10:00 AM to 11:00 AM.

Bernardo, from Company B, cannot reserve the same room during an overlapping time period. However, Bernardo cannot see who reserved the room or which organization owns the reservation.

## Project Goals

This project is being built from scratch to explore and apply important backend development concepts, including:

- business rules;
- REST APIs;
- authentication and authorization;
- code organization;
- relational databases;
- database transactions;
- data isolation between organizations;
- automated testing;
- Docker;
- continuous integration.

## Planned Technologies

The following technologies will be introduced gradually throughout the development process:

- Node.js;
- TypeScript;
- NestJS;
- PostgreSQL;
- Docker;
- GitHub Actions.

## Current Status

**Stage 3 is complete: reservation domain and application use cases.** The project is at version `0.2.0`.

| Use case | Implemented behavior |
| --- | --- |
| `CreateReservation` | Trusted ownership, active room, booking window, duration, and global conflict checks. |
| `CancelReservation` | Ownership and role permissions, preserved history, and rejection of repeat cancellation. |
| `RescheduleReservation` | Same identity, room, and owner; validated replacement period; self excluded from conflict checks. |
| `ListReservations` | Active reservations from the authenticated organization, including colleagues' bookings. |
| `GetRoomAvailability` | Whole free intervals for an active room, across organizations, with no ownership data. |
| `ListAffectedReservations` | Platform-only query of future active bookings for a selected room or organization. |

The domain validates room identifiers, UTC calendar dates, time ordering, and durations from 15 minutes to 8 hours. Creation and rescheduling accept starts from the current instant through exactly 90 days ahead. Active reservations block overlapping periods globally; adjacent periods and cancelled bookings do not conflict.

Cancellation and rescheduling return replacement entities. The application saves the replacement only after the applicable checks pass, so a rejected operation or failed save leaves the original entity unchanged.

Tests provide trusted identities, room status, time, IDs, and storage through in-memory collaborators. **This milestone does not provide reservation HTTP endpoints or PostgreSQL persistence.** Credential authentication, inactive-account checks, user/organization/room administration, Docker deployment, and continuous integration remain future work.

The separate conflict check and save are not atomic. Concurrent requests, conflicting updates, and durable history still require database constraints and transactions. The future authentication adapter must validate credentials and active user/organization status before providing an `AuthenticationContext`.

## Development Milestones

- Stage 1: project setup and NestJS bootstrap — complete.
- Stage 2: reservation domain and its tests — complete.
- Stage 3: reservation application use cases and their tests — complete.
- Next: PostgreSQL persistence, migrations, repository/query adapters, and integration tests for transactions and simultaneous booking attempts.

## Code Organization and Design Decisions

The domain owns reservation behavior and time calculations. Application use cases coordinate access and external information through typed interfaces. NestJS and the future database adapter stay outside those business rules.

- `Reservation` is an entity composed with `ReservationPeriod`, a value object kept in the same file.
- `cancel()` and `reschedule()` perform domain behavior; callers do not assign status or rebuild lifecycle rules. Both return a replacement that must be saved.
- `ReservationBookingPolicy` shares room, clock, and conflict checks between creation and rescheduling.
- Access helpers centralize organization and ownership permissions. Hidden and missing reservations have the same response.
- Repository methods return entities for behavior. Narrow query ports supply only what each read operation needs; availability receives occupied intervals without ownership.
- Requests and dependencies use named fields in typed interfaces. Roles, statuses, scopes, and error codes use `as const` maps with inferred union types. The `typeof` used in these type declarations does not perform a runtime check.
- Tests reuse collaborators in `reservation.test-support.ts`; that file is excluded from the production build.
- Short English comments explain the flow and reasons behind important decisions.

TypeScript checks contracts during compilation. Future HTTP handlers must still validate incoming data at runtime; a TypeScript interface alone cannot validate JSON.

The relevant Refactoring.Guru main articles, TypeScript usage notes, and examples were reviewed with the following decisions:

| Pattern | Decision for this stage | References |
| --- | --- | --- |
| Factory Method | Keep the static `Reservation.create()` factory. There is no creator subclass hierarchy, so this is not the GoF Factory Method pattern. | [Article](https://refactoring.guru/design-patterns/factory-method), [TypeScript](https://refactoring.guru/design-patterns/factory-method/typescript/example) |
| Adapter | Keep ports for external dependencies. PostgreSQL will implement these contracts in the next stage. | [Article](https://refactoring.guru/design-patterns/adapter), [TypeScript](https://refactoring.guru/design-patterns/adapter/typescript/example) |
| Command | Use focused application use cases with `execute(request)`. Queuing, undo history, and a generic command hierarchy are not required. | [Article](https://refactoring.guru/design-patterns/command), [TypeScript](https://refactoring.guru/design-patterns/command/typescript/example) |
| Strategy | Keep one booking policy: the product has no interchangeable booking algorithms yet. | [Article](https://refactoring.guru/design-patterns/strategy), [TypeScript](https://refactoring.guru/design-patterns/strategy/typescript/example) |
| State | Keep the two-state lifecycle inside the entity; separate state classes would add indirection without solving a current problem. | [Article](https://refactoring.guru/design-patterns/state), [TypeScript](https://refactoring.guru/design-patterns/state/typescript/example) |

## Documentation

The project documentation is located in the `docs` directory:

- [`business-rules.md`](docs/business-rules.md);
- [`acceptance-scenarios.md`](docs/acceptance-scenarios.md).

## Product Features

- user authentication;
- room listing;
- room availability searches;
- reservation creation;
- reservation listing;
- reservation rescheduling;
- reservation cancellation;
- user management;
- organization management;
- room management.

## Local Development

Use Node.js 24 and npm. Install the versions recorded in the lockfile:

```sh
npm ci
```

Start the NestJS application:

```sh
npm run start:dev
```

The server listens on port 3000 by default, or on the port supplied through `PORT`. The root URL returns 404 because no HTTP controllers have been added yet.

## Verification

```sh
npm run typecheck
npm test
npm run build
```

The 116 automated tests exercise domain and application behavior, including ownership, role authorization, organization isolation, availability, booking boundaries, cancellation, rescheduling, conflict handling, and failed-save preservation. They do not exercise a real database, HTTP requests, or login. See the coverage notes in the acceptance scenarios for remaining product work.
