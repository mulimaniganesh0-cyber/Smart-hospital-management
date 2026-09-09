// Delivery is deliberately best-effort: an SOS must never fail because a provider is absent.
async function notifyEmergencyContact({ phone, patientName, createdAt, secureLocationUrl = null }) {
  // Never put raw coordinates in SMS or an unrestricted maps URL. A short,
  // expiring bearer link is issued only for the registered contact.
  const link = secureLocationUrl ? ` View secure emergency location: ${secureLocationUrl}` : '';
  const message = `Emergency SOS Alert: ${patientName} has triggered an emergency SOS.${link} Time: ${createdAt.toISOString()}`;

  if (!process.env.SMS_WEBHOOK_URL) {
    console.warn(`SOS notification queued for ${phone}; configure SMS_WEBHOOK_URL to deliver it.`);
    return { status: 'pending', message };
  }

  try {
    const response = await fetch(process.env.SMS_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: phone, message }),
    });
    if (!response.ok) throw new Error(`Provider returned ${response.status}`);
    return { status: 'sent', message };
  } catch (error) {
    return { status: 'failed', message, failureReason: error.message };
  }
}

module.exports = { notifyEmergencyContact };
