interface AuditSource {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  details: Record<string, unknown>;
  occurredAt: string;
  actorUserId?: string | null;
  [key: string]: unknown;
}

const actionLabels: Record<string, string> = {
  "application.created": "Application created",
  "application.submitted": "Application submitted for review",
  "application.kyc_reviewed": "Customer verification reviewed",
  "application.approved": "Application approved",
  "application.rejected": "Application rejected",
  "application.correction": "Application correction requested",
  "contract.created": "Contract created",
  "contract.activated": "Contract activated",
  "contract.status_changed": "Contract status updated",
  "payment.recorded": "Payment recorded",
  "payment.settled": "Payment settled and allocated",
  "payment.reversed": "Payment reversed",
  "payment.reconciliation_completed": "Payment reconciliation completed",
  "fee.assessed": "Fee assessed",
  "fee.waived": "Fee waived",
  "device.enrolled": "Device enrolled",
  "device.enrollment_prepared": "Device enrollment prepared",
  "device.command_queued": "Device policy command queued",
  "device.agent.enrolled": "Device Owner enrollment completed",
  "device.agent.command_acknowledged": "Device policy command acknowledged",
  "device.command_requested": "Device command requested",
  "device.command_sent": "Device command sent",
  "device.command_failed": "Device command failed",
  "customer.created": "Customer registered",
  "customer.updated": "Customer profile updated",
  "branch.created": "Branch created",
  "branch.updated": "Branch updated",
  "inventory.product_created": "Catalog product created",
  "inventory.product_updated": "Catalog product updated",
  "inventory.product_image_upload_requested": "Catalog product image upload authorized",
  "inventory.product_image_updated": "Catalog product image updated",
  "inventory.unit_received": "Serialized stock unit received",
  "inventory.unit_status_changed": "Stock unit status updated",
  "inventory.unit_updated": "Stock unit details updated",
  "membership.invited": "Staff member invited",
  "membership.invitation.delivery_failed": "Staff invitation delivery failed",
  "membership.status_changed": "Staff access status updated",
  "membership.access_changed": "Staff branch access updated",
  "membership.role_assigned": "Staff role assigned",
  "membership.role_revoked": "Staff role revoked",
  "tenant.business_profile.updated": "Retailer business profile updated",
  "kyc.polling_fallback_synced": "Identity verification result synchronized",
  "tenant.kyb.started": "Retailer business verification started",
  "tenant.kyb.webhook_processed": "Retailer verification result received",
  "tenant.kyb.polling_fallback_synced": "Retailer verification result synchronized",
  "platform.tenant.created": "Retailer organization created",
  "platform.tenant.archived": "Retailer organization archived",
  "platform.invitation.created": "Platform staff invitation created",
  "platform.invitation.delivery_failed": "Platform invitation delivery failed",
  "platform.tenant.owner_invitation.delivery_failed":
    "Retailer owner invitation delivery failed",
  "platform.invitation.resend_requested": "Platform invitation resent",
  "platform.invitation.revoked": "Platform invitation revoked",
  "platform.kyb.approve": "Retailer verification approved",
  "platform.kyb.reject": "Retailer verification rejected",
  "platform.kyb.request_resubmission": "Retailer verification resubmission requested",
  "platform.kyb.polling_fallback_synced": "Retailer verification synchronized",
};

export function presentAuditEvent(
  event: AuditSource,
  actor?: { name: string | null; email: string | null },
) {
  const actionLabel = actionLabels[event.action] ?? humanize(event.action);
  const resourceLabel = humanize(event.resourceType);
  const actorLabel =
    actor?.name ??
    actor?.email ??
    (event.actorUserId === null ? "Automated service" : "Staff member");
  return {
    ...event,
    actionCode: event.action,
    action: undefined,
    actionLabel,
    message: `${actorLabel} — ${actionLabel}.`,
    actor: {
      id: event.actorUserId ?? null,
      name: actor?.name ?? null,
      email: actor?.email ?? null,
      label: actorLabel,
    },
    resource: {
      type: event.resourceType,
      label: resourceLabel,
      id: event.resourceId,
    },
  };
}

export function readableAuditSummary(event: AuditSource) {
  const actionLabel = actionLabels[event.action] ?? humanize(event.action);
  return {
    id: event.id,
    actionCode: event.action,
    actionLabel,
    message: actionLabel,
    resourceType: event.resourceType,
    resourceLabel: humanize(event.resourceType),
    resourceId: event.resourceId,
    occurredAt: event.occurredAt,
  };
}

function humanize(value: string) {
  const words = value.replaceAll(".", " ").replaceAll("_", " ").trim();
  return words.length === 0 ? "Activity" : words[0]!.toUpperCase() + words.slice(1);
}
