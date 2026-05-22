const express = require("express");
const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Store conversation history per user (in-memory)
const conversations = {};

app.post("/webhook", async (req, res) => {
  const incomingMsg = req.body.Body?.trim();
  const from = req.body.From; // e.g. "whatsapp:+1234567890"

  if (!incomingMsg || !from) {
    return res.status(400).send("Bad request");
  }

  // Initialize conversation history for this user
  if (!conversations[from]) {
    conversations[from] = [];
  }

  // Add user message to history
  conversations[from].push({ role: "user", parts: [{ text: incomingMsg }] });

  // Keep only last 20 messages to avoid token limits
  if (conversations[from].length > 20) {
    conversations[from] = conversations[from].slice(-20);
  }

  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      systemInstruction: `You are a helpful personal AI assistant running on WhatsApp.
You are concise and friendly. Keep responses short and clear — this is a chat interface.
Use plain text only, no markdown (no **, no #, no bullet dashes — use numbers or plain text instead).
Today's date is ${new Date().toDateString()}.`,
    });

    const chat = model.startChat({ history: conversations[from].slice(0, -1) });
    const result = await chat.sendMessage(incomingMsg);
    const reply = result.response.text();

    // Add assistant reply to history
    conversations[from].push({ role: "model", parts: [{ text: reply }] });

    // Send reply via Twilio TwiML
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message><Body>${reply}</Body></Message>
</Response>`;

    res.type("text/xml").send(twiml);
  } catch (err) {
    console.error("Gemini API error:", err);
    const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message><Body>Sorry, something went wrong. Please try again.</Body></Message>
</Response>`;
    res.type("text/xml").send(errorTwiml);
  }
});

// Health check
app.get("/", (req, res) => res.send("WhatsApp Agent is running ✅"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
