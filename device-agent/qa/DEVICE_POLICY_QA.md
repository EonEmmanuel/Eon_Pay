# Device policy QA gate

Do not release until each item has evidence (device model, OS/build, timestamp, tester, and result).

## Provisioning and baseline controls

- [ ] QR provisioning completes from a factory reset and makes this package Device Owner.
- [ ] Before Device Owner enrollment, absent policy state is `Unenrolled` and applies no restrictions.
- [ ] Missing/malformed provisioning extras record enrollment and fail closed to `soft_lock`.
- [ ] `DISALLOW_FACTORY_RESET` is effective from Settings and recovery-adjacent UI paths.
- [ ] Safe-mode entry is blocked by `DISALLOW_SAFE_BOOT`.
- [ ] Package uninstall and app-info disable controls cannot remove/disable the DPC.
- [ ] `READ_PHONE_STATE` and notification permission grants are applied without a customer prompt.
- [ ] Reboot before first unlock reasserts the cached policy.
- [ ] Enterprise FRP accepts every configured corporate Google numeric `userId` after an untrusted reset.
- [ ] FRP recovery documentation confirms that the device must be provisioned again after reset.

## Signed state and offline behavior

- [ ] A valid token for this `deviceId` applies each of the four tiers.
- [ ] Invalid signature, malformed payload, wrong `deviceId`, and already-expired tokens are rejected.
- [ ] A signed token with a lower/equal `policyVersion` cannot replace a newer cached token.
- [ ] Once a versioned policy is cached, a signed legacy token without `policyVersion` is rejected.
- [ ] Re-delivery of the exact same signed token is accepted as an idempotent no-op.
- [ ] At `expiresAt`, a disconnected `active`, `warning`, or `hard_lock` device enters `soft_lock`.
- [ ] SIM removal and SIM replacement are included in the next successful check-in.
- [ ] Primary certificate pin works; the backup pin works after a controlled certificate rotation.
- [ ] A host with a valid public certificate but no configured pin is rejected.
- [ ] Offline timeout preserves the original signed payload and records a distinct local reason.
- [ ] Offline timeout never exceeds `soft_lock` and is cancelled/replaced after a successful check-in.
- [ ] The network-independent offline guard still runs after process death, reboot, and Doze delay.
- [ ] A backend outage does not remove internet, support, payment, SMS, or emergency recovery actions.

## Emergency calling — release blocker

- [ ] Emergency button is visible in `soft_lock` and `hard_lock`.
- [ ] Emergency dialer launches without leaving access to other non-allowed applications.
- [ ] A real locally supported emergency number can be dialed with no SIM.
- [ ] Emergency calling works with a locked SIM and with the Android keyguard present.
- [ ] Returning from the emergency dialer restores the correct policy UI.
- [ ] Network/operator emergency behavior is verified by a safe, coordinated test procedure.

## Payment and unlock

- [ ] Amount and days overdue exactly match the signed token; the app does not recompute them.
- [ ] Offline UI shows the token's `issuedAt` as the last-updated time.
- [ ] Tenant name, logo, color, support number, language, currency, and payment link render correctly.
- [ ] Pay Now opens only the explicitly configured/allowed payment package.
- [ ] An FCM refresh hint triggers authenticated check-in; the resulting signed `active` policy exits lock task in under 5 seconds.
- [ ] WorkManager check-in unlocks after an intentionally dropped FCM message.
- [ ] Internet settings are reachable from both soft and hard lock, then returning restores policy UI.
- [ ] A backend `release` command unlocks a contract-derived hard lock and remains effective on later check-ins.
- [ ] A later restrict/lock command clears the release override and reapplies signed backend policy.
- [ ] Back, Home, Recents, notification shade, task kill, and reboot do not bypass `hard_lock`.

## OEM matrix — release blocker

Run every policy and emergency case on at least:

- [ ] Samsung One UI (a low/mid-range model used by retailers).
- [ ] Xiaomi HyperOS/MIUI.
- [ ] Transsion family hardware used in target markets (Tecno, Infinix, or itel).
- [ ] Stock/Pixel-class Android.

Also test the exact OS builds and dialer/SMS/payment package names shipped by each financed SKU.
OEM updates must trigger a focused regression pass because launcher, keyguard, dialer, and
background-execution behavior can change independently of AOSP.
