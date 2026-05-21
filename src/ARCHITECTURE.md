# Ivory Admin Architecture

This project keeps Next.js routing in `src/app` and organizes supporting code by clean architecture boundaries.

## Layers

- `app`: Next.js App Router pages, layouts, and route handlers. This is the delivery layer and should stay thin.
- `application`: use cases and server-side query orchestration. This layer coordinates domain work and infrastructure calls.
- `domain`: shared business types and business rules that do not depend on frameworks or external services.
- `infrastructure`: Firebase, Google Drive, repositories, service adapters, encryption, and import pipelines.
- `presentation`: reusable UI components, client hooks, feature hooks, and global styles.
- `shared`: framework-light utilities, constants, and request helpers used across layers.
- `config`: environment parsing and app-level configuration.

## Dependency Direction

Prefer dependencies flowing inward:

- `app` can call `application` and `presentation`.
- `presentation` can use `domain`, `shared`, and API endpoints.
- `application` can use `domain`, `shared`, `config`, and `infrastructure`.
- `infrastructure` can use `domain`, `shared`, and `config`.
- `domain` should not import from `app`, `presentation`, `application`, or `infrastructure`.

Use `@/...` imports for cross-layer references so file moves do not create fragile relative paths.
