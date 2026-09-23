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

The project is currently in the specification stage.

Before implementing the API, the system's business rules and acceptance scenarios will be defined and documented.

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

## Note

The API has not been implemented yet. At this stage, the expected system behavior will be specified before technical implementation details are introduced.
