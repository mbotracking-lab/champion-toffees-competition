export default async function handler(req, res) {
  if (req.method === 'GET') {
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send('Wrong token');
  }

  if (req.method === 'POST') {
    console.log("WHATSAPP MESSAGE RECEIVED:", JSON.stringify(req.body));
    return res.status(200).send('EVENT_RECEIVED');
  }

  res.status(405).send('Method Not Allowed');
}
