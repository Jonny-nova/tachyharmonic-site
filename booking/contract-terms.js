'use strict';

// Candidate legal text, derived from terms.html (27 September 2026), awaiting
// Jonathan's final review. A version is evidence of the text, not its approval.
// Persist the returned snapshot with each booking; never rebuild an old
// booking's confirmation from current configuration or mutable website text.
const VERSION = 'booking-terms-v1-2026-09-28';
const { WORDING } = require('./consent');
const CONTACT = 'jonathan@tachyharmonic.ai';

function createContractTerms({ traderAddress } = {}) {
  if (typeof traderAddress !== 'string' || traderAddress.trim().length < 10 || traderAddress.length > 600 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(traderAddress)) {
    throw Object.assign(new Error('trader_address_required'), { code: 'trader_address_required' });
  }
  const address = traderAddress.trim();
  const text = [
    `Booking and cancellation information — ${VERSION}`,
    'Keep this email: it contains the terms snapshot for your booking. Your selected appointment, total price, contract date and early-performance choice are recorded above.',
    '',
    'Trader and contact',
    'Jonathan Bonello, trading as Tachyharmonic.',
    `Geographic contact address: ${address}`,
    `Booking enquiries, complaints, cancellation and rescheduling: ${CONTACT}. You may also send a written cancellation to the geographic address above.`,
    '',
    'Your appointment and payment',
    'One-to-one online sessions for thinking and exploring the use of AI together, delivered through Google Meet. One hour costs £30 supported, £50 standard or £70 solidarity. Two hours costs £100 standard or £140 solidarity. The whole price is shown before you pay. A two-hour session is one appointment. Any further work is separately agreed case by case.',
    'Payment is handled by Stripe. Payment alone does not confirm an appointment. The contract is made when the booking service confirms that the paid appointment has been secured. The contract time and appointment time are recorded in this email. An uncertain provider response remains pending while it is checked. If payment succeeds but an appointment cannot be secured, a full refund is arranged.',
    'Keep your private booking-management link. It allows you to check status and request cancellation. Do not share it. You can also email Jonathan about any booking or payment problem.',
    '',
    'Cancellation and rescheduling',
    'At least 24 hours before your appointment, the controlled cancellation route provides a full refund under Jonathan’s policy, subject to your statutory rights. Both hours of a two-hour appointment are cancelled together. If cancellation or refund processing is delayed, the status remains pending until the provider confirms the action.',
    'Under 24 hours, your request goes to Jonathan for personal review. Submitting a request does not itself confirm cancellation or a refund under this appointment policy. There is no automatic blanket forfeiture. Your statutory rights take precedence; a valid statutory cancellation does not depend on Jonathan approving it.',
    'For rescheduling, email Jonathan. A new time must be checked before a move is confirmed.',
    '',
    'Your statutory cancellation rights',
    'For an eligible online service contract, you normally have 14 days after the day the contract is made to cancel without giving a reason. This period runs from the contract date, not backwards from the appointment date. The normal cancellation deadline for this booking is recorded above.',
    'To exercise the right, send Jonathan a clear statement that you wish to cancel, by email or post using the contact details above. You may use the model form below, but you do not have to. Sending your cancellation before the period ends is sufficient to meet the deadline. The private online cancellation route is optional. If you use it under 24 hours ahead, Jonathan will review your statutory rights as well as the appointment policy.',
    'If you request preparation or the session to begin during the cancellation period and then cancel after work has begun, a proportionate amount for services actually supplied may be payable where the law permits. Jonathan assesses this; it is not an automatic fee. Your statutory change-of-mind cancellation right ends after the service is fully performed only where you expressly requested early performance and acknowledged that consequence.',
    `The separate, initially unticked early-performance choice is: “${WORDING}” Your actual choice and when it was recorded appear above.`,
    'Where a statutory refund is due for this service contract, it will be made without undue delay and no later than 14 days after Jonathan is informed of your cancellation, using the original payment method unless you expressly agree otherwise, without a reimbursement fee. Any legally permitted proportionate amount for services supplied is assessed as described above.',
    '“Refund initiated” means the payment provider has accepted the refund; it does not mean the money has already appeared at your bank.',
    '',
    'Model cancellation form',
    '(Complete and return this form only if you wish to withdraw from the contract.)',
    `To Jonathan Bonello, Tachyharmonic, ${address}, ${CONTACT}:`,
    'I/We [*] hereby give notice that I/We [*] cancel my/our [*] contract for the supply of the following service:',
    'Service and booking reference: ____________________',
    'Ordered on: ____________________',
    'Name of consumer(s): ____________________',
    'Address of consumer(s): ____________________',
    'Signature of consumer(s) (only if this form is notified on paper): ____________________',
    'Date: ____________________',
    '[*] Delete as appropriate.',
  ].join('\n');
  return Object.freeze({ version: VERSION, text });
}

function assertContractTerms(snapshot) {
  if (!snapshot || typeof snapshot.version !== 'string' || !/^[A-Za-z0-9._-]{1,100}$/.test(snapshot.version) || typeof snapshot.text !== 'string' || snapshot.text.length < 100 || snapshot.text.length > 16000) throw new Error('Durable contract terms required');
  return snapshot;
}

module.exports = { VERSION, createContractTerms, assertContractTerms };
