import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import Stripe from "stripe";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

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
  const qualityRule = isPro
    ? `
USER PLAN: PRO

Give a premium answer:
- Longer and more complete.
- More useful.
- More direct.
- Better school help.
- Better structure.
- Better examples.
- Better explanations.
- If the user asks for a long text, write the long text instead of only giving advice.
`
    : `
USER PLAN: FREE

Still be useful:
- Answer directly.
- Do not be lazy.
- Keep it shorter than Pro, but still complete enough to help.
- If the user asks for a text, write a useful version, not just advice.
`;

  const globalRules = `
VERY IMPORTANT:
- Act like a high-quality ChatGPT-style assistant.
- Understand the user's real intention.
- Do exactly what the user asks.
- If the user asks you to write something, write it.
- If the user says "skriv på 12000 enheder", "12000 tegn", "12000 characters" or similar, they want a long text around that length.
- If the full requested length is too long for one answer, write Part 1 and end with: "Skriv fortsæt, så skriver jeg næste del."
- Do NOT only explain what the user could do. Actually do the task.
- Use the same language as the user unless a language rule says otherwise.
- Do not invent fake sources, fake quotes, fake page numbers or fake facts.
- Keep the answer clean, human and easy to copy.
- Avoid generic advice.
- Be practical, direct and helpful.
`;

  if (mode === "chat") {
    return `
You are Instant Answer Chat.

${qualityRule}
${globalRules}

Task:
Help the user exactly with what they ask.

If they ask for a long text:
- Start writing the actual text.
- Use headings if useful.
- Make it coherent.
- Continue as far as possible within the answer limit.

Input:
${input}
`;
  }

  if (mode === "assignment") {
    return `
You are Instant Answer Assignment Helper.

${qualityRule}
${globalRules}

Task:
The user has pasted or described an assignment.

You must provide:
1. What the assignment requires.
2. How to start.
3. A strong disposition/structure.
4. A useful draft/example answer.
5. Concrete sentences the user can use.

Important:
- Do not only give tips.
- Give the user something they can actually work from.
- If the user asks for a full text, write a full draft.
- If the user asks for a certain length, try to match it as much as possible.

Input:
${input}
`;
  }

  if (mode === "improve") {
    return `
You are Instant Answer Improve Text.

${qualityRule}
${globalRules}

Task:
Improve the user's text.

You must:
1. Rewrite the text better.
2. Correct grammar and spelling.
3. Make it sound more natural and human.
4. Keep the original meaning.
5. Make it clearer and stronger.
6. Explain briefly what you improved.

Input:
${input}
`;
  }

  if (mode === "feedback") {
    return `
You are Instant Answer Teacher Feedback.

${qualityRule}
${globalRules}

Task:
Give useful teacher-style feedback.

You must include:
1. What is good.
2. What is weak/missing.
3. How to improve it.
4. Concrete examples.
5. A better version if useful.

Input:
${input}
`;
  }

  if (mode === "quick") {
    return `
You are Instant Answer.

${qualityRule}
${globalRules}

Task:
Give a quick but useful answer.

Format:
Quick answer:
[direct answer]

Key points:
• [point]
• [point]
• [point]

Input:
${input}
`;
  }

  if (mode === "deep") {
    return `
You are Instant Answer Deep Explainer.

${qualityRule}
${globalRules}

Task:
Explain the content deeply and clearly.

Format:
Overview:
[explanation]

Important details:
• [detail]
• [detail]
• [detail]

What it means:
[clear meaning]

Useful next step:
[next step]

Input:
${input}
`;
  }

  if (mode === "study") {
    return `
You are Instant Answer Study Assistant.

${qualityRule}
${globalRules}

Task:
Help the user learn and solve school work.

You must:
- Explain simply.
- Show structure.
- Give examples.
- Help the user start writing.
- If the user asks for a written answer, write a useful draft.

Input:
${input}
`;
  }

  return `
You are Instant Answer.

${qualityRule}
${globalRules}

Input:
${input}
`;
}

function getMaxTokens(mode, isPro) {
  if (isPro) {
    if (mode === "quick") return 700;
    if (mode === "chat") return 3500;
    if (mode === "assignment") return 4000;
    if (mode === "improve") return 3500;
    if (mode === "feedback") return 3000;
    if (mode === "study") return 3800;
    if (mode === "deep") return 3800;
    return 3500;
  }

  if (mode === "quick") return 250;
  if (mode === "chat") return 1200;
  if (mode === "assignment") return 1400;
  if (mode === "improve") return 1300;
  if (mode === "feedback") return 1200;
  if (mode === "study") return 1400;
  if (mode === "deep") return 1400;
  return 1200;
}

app.post("/ask", async (req, res) => {
  try {
    const { input, mode = "chat", deviceId } = req.body;

    if (!input) {
      return res.status(400).json({ error: "Missing input" });
    }

    const isPro = isProUser(deviceId);
    const prompt = buildPrompt(mode, input, isPro);

    const completion = await openai.chat.completions.create({
      model: isPro ? "gpt-4o" : "gpt-4o-mini",
      temperature: isPro ? 0.25 : 0.35,
      max_tokens: getMaxTokens(mode, isPro),
      messages: [
        {
          role: "system",
          content: `
You are Instant Answer, a premium ChatGPT-style AI assistant inside a browser extension.

Main rule:
Do exactly what the user asks.

If the user asks you to write something, write it.
If the user asks for 12000 characters, 12000 enheder, or a long answer, write a long text and continue in parts.
If the answer cannot fit in one response, write Part 1 and end with: "Skriv fortsæt, så skriver jeg næste del."
If the user asks for school help, give a strong draft, structure and clear wording.
If the user asks to improve text, rewrite it fully.
If the user asks for feedback, give honest teacher-style feedback.
If the user asks about the current page, use the page context.

Style:
- Direct
- Useful
- Human
- Clear
- Detailed when needed
- No boring generic advice
- No fake sources
- No fake quotes
- No unnecessary disclaimers

Always answer in the user's language unless told otherwise.
`
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