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

Stage 2 is complete: the NestJS application starts, and the reservation domain model is implemented and tested.

Stage 3 is in progress. `CreateReservation` coordinates the domain through typed contracts for reservations, room availability, authenticated identity, time, and ID generation. It associates each reservation with the supplied identity and rejects unavailable rooms, starts in the past or more than 90 days ahead, and conflicts with active reservations.

The domain validates room identifiers, UTC calendar dates, time ordering, and durations from 15 minutes to 8 hours. Reservations start active and can be cancelled through the entity, preserving their data. A second cancellation is rejected. Only active reservations block overlapping periods in the same room; adjacent reservations are allowed.

Real authentication, authorization, the cancellation application use case, rescheduling, database persistence, and HTTP endpoints are still pending. Current tests provide the authenticated identity and room availability through in-memory implementations. The separate conflict check and save do not yet prevent concurrent bookings; that guarantee will require atomic persistence.

## Documentation

The project documentation is located in the `docs` directory:

- [`business-rules.md`](docs/business-rules.md);
- [`acceptance-scenarios.md`](docs/acceptance-scenarios.md).

## Planned Features

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

The tests exercise the reservation's public behavior and the creation use case, including ownership, availability, booking boundaries, cancellation, and conflicts. The business rules and acceptance scenarios also describe future features; they are not all implemented by this stage.
