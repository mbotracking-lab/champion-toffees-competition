// Meta WhatsApp Business API Webhook Handler
// Pages Router format — required by Meta for webhook verification
// URL: https://champion-toffees-competition-f8tl.vercel.app/api/webhook

export default async function handler(req, res) {
  // 1. VERIFICATION - GET
  if (req.method === 'GET') {
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send('Wrong token');
  }

  // 2. REAL MESSAGES - POST
  if (req.method === 'POST') {
    console.log("WHATSAPP MESSAGE RECEIVED:", JSON.stringify(req.body));
    return res.status(200).send('EVENT_RECEIVED');
  }

  res.status(405).send('Method Not Allowed');
}
