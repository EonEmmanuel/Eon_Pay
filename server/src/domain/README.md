# Financing Domain Model

This directory defines the storage-neutral source model for the phone-financing
platform. It does not depend on an ORM, HTTP framework, payment provider, or
database.

## Sources of truth

| Concept            | Authoritative responsibility                                                     | Never authoritative for            |
| ------------------ | -------------------------------------------------------------------------------- | ---------------------------------- |
| Application        | Applicant intent, KYC/credit workflow, approval decision, approved term snapshot | Balances or collections            |
| Contract           | Signed legal terms and lifecycle                                                 | Paid or outstanding totals         |
| Installment        | Immutable scheduled principal and finance-charge rows                            | Payment state or fee balances      |
| Payment            | Provider/cashier transaction lifecycle and idempotency                           | Contract balance before settlement |
| Payment allocation | Exact destination of every unit of a settled payment                             | Accounting by itself               |
| Fee assessment     | Explicit charge and the versioned policy that produced it                        | Hidden principal or finance charge |
| Journal entry      | Immutable double-entry financial event                                           | Mutable workflow state             |

The ledger is the financial source of truth. Dashboard values such as paid
amount, outstanding principal, fee balance, revenue, cash collected, and
portfolio at risk must be projections derived from posted journal entries,
payment allocations, and the immutable schedule.

## Relationship

```text
Application --approval--> Contract --schedule--> Installments
      |                       |
      |                       +--> Fee assessments
      |                       |
      +-----------------------+--> Payments --> Allocations
                                            |
                                            v
                                  Double-entry journal
```

## Core rules

1. All amounts use non-negative integer XAF minor units. Floating-point money is
   prohibited.
2. Device cash price equals down payment plus financed principal.
3. Contract terms and device snapshots cannot be rewritten after activation.
4. The installment schedule must exactly reconcile to contract principal and
   finance charge.
5. Fees are separate assessments. They are never silently folded into principal
   or finance charge.
6. Every payment has a unique idempotency key. Only settled payments are
   allocated or posted.
7. Allocations consume the entire payment amount. Any remainder is an explicit
   `unapplied_credit` allocation.
8. Posted journal entries are immutable, contain at least two positive lines,
   and have equal debit and credit totals.
9. Corrections use new reversal entries; historical journal rows are never
   edited or deleted.
10. Every aggregate and financial record carries a tenant identifier. Cross-
    tenant relationships are rejected by the invariants.
11. Approval requires verified KYC, and activation requires a canonical
    15-digit IMEI.
12. Waiving or reversing a fee requires a separate linked journal entry.

## Deliberately derived values

The following should not be persisted as independent writable fields:

- contract outstanding balance;
- installment paid status;
- total collected;
- fee outstanding balance;
- portfolio at risk;
- revenue and cash balances.

They should be calculated in read models from the schedule, allocations, fee
assessments, and journal entries.

## Persistence constraints

The eventual database schema must enforce these model-level constraints:

- unique `(tenant_id, payment_idempotency_key)`;
- unique provider reference where a provider reference is present;
- unique `(contract_id, installment_sequence)`;
- unique `(payment_id, allocation_id)`;
- append-only journal entries and journal lines;
- optimistic concurrency using each aggregate's `version`;
- foreign keys that include `tenant_id` wherever the database supports them.
