import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import Stripe from "stripe";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const proDevices = new Set();

function isProUser(deviceId) {
  return proDevices.has(deviceId);
}

app.get("/", (req, res) => {
  res.send("Instant Answer backend is running.");
});

app.get("/success", async (req, res) => {
  const sessionId = req.query.session_id;

  if (!sessionId) return res.send("Missing session id.");

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const deviceId = session.client_reference_id;

    if (!deviceId) return res.send("Missing device id.");

    proDevices.add(deviceId);

    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Instant Answer Pro</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              background: #f7f7f7;
              display: flex;
              align-items: center;
              justify-content: center;
              height: 100vh;
            }
            .box {
              background: white;
              padding: 28px;
              border-radius: 16px;
              box-shadow: 0 4px 18px rgba(0,0,0,0.1);
              max-width: 420px;
              text-align: center;
            }
            p { color: #555; line-height: 1.5; }
          </style>
        </head>
        <body>
          <div class="box">
            <h1>Pro activated</h1>
            <p>Thanks for upgrading to Instant Answer Pro.</p>
            <p>You can now go back to the extension. Pro is active on this device.</p>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    console.error(error);
    res.send("Could not verify payment.");
  }
});

app.post("/check-pro", (req, res) => {
  const { deviceId } = req.body;
  res.json({ pro: isProUser(deviceId) });
});

function buildPrompt(mode, input, isPro) {
  if (mode === "quick") {
    return `
You are Instant Answer.

Goal:
Give the user a fast, useful answer.

Rules:
- Be clear.
- Do not invent facts.
- If information is limited, say that shortly.
- No long intro.
- Make it useful immediately.

Format:
Quick answer:
[1-3 short sentences]

Key points:
• [point]
• [point]
• [point]

Content:
${input}
`;
  }

  if (mode === "deep") {
    return `
You are Instant Answer Pro.

Goal:
Help the user understand the page/video/search better than a normal summary.

Rules:
- Do not invent facts.
- Use only the provided content.
- If transcript/content is missing, explain the topic behind the title/search if it is clear.
- Give practical value, not generic text.
- Write in a clean, premium style.

Format:
Overview:
[Clear explanation]

What it means:
[Simple explanation of the topic]

Why it matters:
[Why the user should care]

Key takeaways:
• [useful point]
• [useful point]
• [useful point]
• [useful point]

Best next step:
[What the user should do/understand next]

Content:
${input}
`;
  }

  if (mode === "study") {
    return `
You are a premium Study Assistant.

Goal:
Help the user learn and use the information for school, homework or studying.

Rules:
- Explain simply.
- Do not invent facts.
- If it is math/science, explain step-by-step.
- If it is language/history/social studies, give structure and useful wording.
- Do not help with cheating. Give learning support and inspiration.
- Make it easy to remember.

Format:
Simple explanation:
[Explain like the user is new to the topic]

Step-by-step understanding:
1. [step]
2. [step]
3. [step]

Example answer:
[A short example the user can use as inspiration]

Notes to remember:
• [note]
• [note]
• [note]
• [note]

Content:
${input}
`;
  }

  return `Explain this clearly and usefully:\n${input}`;
}

app.post("/ask", async (req, res) => {
  try {
    const { input, mode, deviceId } = req.body;

    const isPro = isProUser(deviceId);
    const prompt = buildPrompt(mode, input, isPro);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: isPro ? 0.18 : 0.35,
      max_tokens: isPro
        ? mode === "quick"
          ? 220
          : 900
        : mode === "quick"
          ? 130
          : 430,
      messages: [
        {
          role: "system",
          content: isPro
            ? "You are a premium AI assistant. Give high-quality, clear, useful answers. Never invent facts. Follow the user's language rule if provided."
            : "You are a helpful AI assistant. Keep answers shorter for free users. Never invent facts. Follow the user's language rule if provided."
        },
        {
          role: "user",
          content: prompt
        }
      ]
    });

    const answer = completion.choices[0].message.content;

    res.json({
      answer,
      pro: isPro
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

app.listen(3000, () => {
  console.log("Instant Answer backend running on http://localhost:3000");
});