const express = require('express');
const router = express.Router();

/* Self-hosted AI via Ollama running on this machine — no API key, no
   internet dependency, nothing leaves the LAN. */
const OLLAMA_URL    = process.env.OLLAMA_URL || 'http://localhost:11434';
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'llama3.2:3b';

const SYSTEM_PROMPT = `You are Epsilon AI, a helpful assistant built into the Epsilon Enterprise ERP system.
You help the team draft professional business emails (including replies to emails they paste in), and answer
general questions. When asked to write or reply to an email, write only the email itself — a clear subject line
(if useful) and body — in a professional, concise tone, without extra commentary before or after it unless asked.`;

// GET /api/ai/models — which local models are available right now
router.get('/models', async (req, res) => {
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!r.ok) throw new Error('bad response');
    const data = await r.json();
    res.json({ models: (data.models || []).map(m => m.name), default: DEFAULT_MODEL });
  } catch (e) {
    res.status(502).json({ error: 'Could not reach the local AI (Ollama). Is it running?' });
  }
});

// POST /api/ai/chat — { messages:[{role,content}], model? } -> streamed NDJSON
router.post('/chat', async (req, res) => {
  const { messages, model } = req.body || {};
  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: 'messages is required' });
  }

  const fullMessages = messages[0]?.role === 'system'
    ? messages
    : [{ role: 'system', content: SYSTEM_PROMPT }, ...messages];

  try {
    const upstream = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: model || DEFAULT_MODEL, messages: fullMessages, stream: true }),
    });

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => '');
      return res.status(502).json({ error: text || 'Local AI did not respond. Is Ollama running?' });
    }

    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-cache');
    res.flushHeaders?.();

    const reader  = upstream.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value, { stream: true }));
    }
    res.end();
  } catch (e) {
    if (!res.headersSent) {
      res.status(500).json({ error: 'Could not reach the local AI: ' + e.message });
    } else {
      res.end();
    }
  }
});

module.exports = router;
