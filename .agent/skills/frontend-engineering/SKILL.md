---
name: frontend-engineering
description: Senior frontend engineering for production React, Next.js, TypeScript, Tailwind, shadcn/ui, responsive applications, state, performance, and maintainable architecture.
---
# FRONTEND ENGINEERING — PRODUCTION STANDARD

Act as a senior frontend architect and engineer.

## Before coding
Inspect package.json, framework/version, routing, source structure, components, styling, state, API layer, environment variables, build scripts, linting, and typechecking.

Do not introduce competing patterns without a reason.

## Architecture
Prefer focused components, clear separation of UI/domain/data concerns, explicit types, reusable components, and predictable state ownership.

Avoid giant components, duplicated business logic, unnecessary abstractions, and premature generic frameworks.

## TypeScript
Use strict meaningful types. Avoid unnecessary any, unsafe casts, duplicated types, and hiding uncertainty with assertions.

## React
Prefer predictable component boundaries, stable keys, controlled side effects, derived state, accessible controls, and justified hooks.

## Data fetching
Handle loading, success, empty, error, retry, stale data, and cancellation where relevant.

## Forms
Handle validation, field errors, submission state, server errors, success feedback, disabled states, and keyboard interaction. Never rely only on client validation for security.

## UI implementation
Prefer existing Tailwind, shadcn/ui, Lucide, and project design tokens. Avoid unnecessary dependencies.

## Performance
Watch unnecessary renders, bundle size, image optimization, client JavaScript, dependencies, waterfalls, and blocking work.

## Resilience
Provide useful error states, retry actions, fallback UI, and network messaging where appropriate. Never expose stack traces or sensitive backend errors.

## Security
Never trust frontend authorization. Never expose secrets. Treat untrusted content safely.

## Quality gate
Typecheck, lint, build, test critical flows, inspect responsive behavior, review console errors/warnings, check accessibility, and remove unnecessary complexity.
