const express = require("express");
require("dotenv").config();

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Store conversation history per user (in-memory)
const conversations = {};

app.post("/webhook", async (req, res) => {
  const incomingMsg = req.body.Body?.trim();
  const from = req.body.From;

  if (!incomingMsg || !from) {
    return res.status(400).send("Bad request");
  }

  if (!conversations[from]) {
    conversations[from] = [];
  }

  conversations[from].push({ role: "user", content: incomingMsg });

  if (conversations[from].length > 20) {
    conversations[from] = conversations[from].slice(-20);
  }

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content: `You are a helpful personal AI assistant running on WhatsApp. You are concise and friendly. Keep responses short and clear. Use plain text only, no markdown. Today's date is ${new Date().toDateString()}.`
          },
          ...conversations[from]
        ],
        max_tokens: 1024
      })
    });

    const data = await response.json();
    const reply = data.choices[0].message.content;

    conversations[from].push({ role: "assistant", content: reply });

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message><Body>${reply}</Body></Message>
</Response>`;

    res.type("text/xml").send(twiml);
  } catch (err) {
    console.error("Groq API error:", err);
    const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message><Body>Sorry, something went wrong. Please try again.</Body></Message>
</Response>`;
    res.type("text/xml").send(errorTwiml);
  }
});

app.get("/", (req, res) => res.send("WhatsApp Agent is running âœ…"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
