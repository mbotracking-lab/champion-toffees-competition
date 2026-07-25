export default function handler(req, res) {
  console.log("WEBHOOK HIT!", req.method, req.body);
  
  // VERIFICATION - GET
  if (req.method === 'GET') {
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
  }

  // MESSAGES - POST
  if (req.method === 'POST') {
    console.log("GOT MESSAGE:", JSON.stringify(req.body));
    return res.status(200).json({status: "ok"});
  }
  
  res.status(405).end();
}
