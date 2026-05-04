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
  const qualityRule = isPro
    ? `
Pro user:
- Give a stronger, deeper and more helpful answer.
- Give better explanations.
- Give better school help.
- Use more structure.
- Include examples when useful.
`
    : `
Free user:
- Keep the answer useful but shorter.
- Give clear help without going too deep.
`;

  if (mode === "chat") {
    return `
You are Instant Answer Chat.

${qualityRule}

Goal:
Help the user with questions, homework, explanations, text, structure and ideas.

Rules:
- Follow the language rule inside the user's input.
- Be clear and useful.
- Do not invent facts.
- If page context exists, use it when relevant.
- If the user asks a school question, help them understand instead of cheating.
- Give practical answers.

Format:
Answer:
[clear answer]

Useful next step:
[what the user can do next]

Input:
${input}
`;
  }

  if (mode === "assignment") {
    return `
You are Instant Answer Assignment Helper.

${qualityRule}

Goal:
The user pastes an assignment. Explain exactly how to start.

Rules:
- Follow the language rule inside the user's input.
- Do not write a full cheating-ready assignment.
- Help the user understand what to do.
- Make it simple and structured.

Format:
What the assignment requires:
[explain the task]

How to start:
[clear first steps]

Disposition:
1. [section]
2. [section]
3. [section]

Example formulation:
[short example sentence or paragraph]

Tips:
• [tip]
• [tip]
• [tip]

Input:
${input}
`;
  }

  if (mode === "improve") {
    return `
You are Instant Answer Improve Text.

${qualityRule}

Goal:
Improve the user's text.

Rules:
- Follow the language rule inside the user's input.
- Keep the original meaning.
- Correct errors.
- Make the text more natural and human.
- Do not make it sound too robotic.

Format:
Improved version:
[better version of the text]

What I improved:
• [improvement]
• [improvement]
• [improvement]

Input:
${input}
`;
  }

  if (mode === "feedback") {
    return `
You are Instant Answer Teacher Feedback.

${qualityRule}

Goal:
Give teacher-style feedback on the user's text or answer.

Rules:
- Follow the language rule inside the user's input.
- Be honest but helpful.
- Explain what is good and what is missing.
- Give concrete ways to improve.

Format:
What is good:
• [point]
• [point]

What is missing:
• [point]
• [point]

How it becomes better:
1. [advice]
2. [advice]
3. [advice]

Example improvement:
[short improved example if useful]

Input:
${input}
`;
  }

  if (mode === "quick") {
    return `
You are Instant Answer.

${qualityRule}

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
You are Instant Answer Pro-style Explainer.

${qualityRule}

Goal:
Help the user understand the page/video/search better than a normal summary.

Rules:
- Do not invent facts.
- Use only the provided content.
- If transcript/content is missing, explain the topic behind the title/search if it is clear.
- Give practical value.
- Write in a clean, premium style.

Format:
Overview:
[Clear explanation]

What it means:
[Simple explanation]

Why it matters:
[Why the user should care]

Key takeaways:
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

${qualityRule}

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

Content:
${input}
`;
  }

  return `
Explain this clearly and usefully.

${qualityRule}

Input:
${input}
`;
}

function getMaxTokens(mode, isPro) {
  if (isPro) {
    if (mode === "quick") return 260;
    if (mode === "chat") return 900;
    if (mode === "assignment") return 1100;
    if (mode === "improve") return 1100;
    if (mode === "feedback") return 1000;
    if (mode === "study") return 1100;
    if (mode === "deep") return 1100;
    return 900;
  }

  if (mode === "quick") return 140;
  if (mode === "chat") return 430;
  if (mode === "assignment") return 520;
  if (mode === "improve") return 520;
  if (mode === "feedback") return 500;
  if (mode === "study") return 520;
  if (mode === "deep") return 520;
  return 430;
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
      model: "gpt-4o-mini",
      temperature: isPro ? 0.18 : 0.35,
      max_tokens: getMaxTokens(mode, isPro),
      messages: [
        {
          role: "system",
          content: isPro
            ? "You are Instant Answer Pro. Give premium, clear, structured and useful answers. Help better with school, text, assignments and explanations. Never invent facts. Follow the user's language rule if provided."
            : "You are Instant Answer Free. Give helpful but shorter answers. Never invent facts. Follow the user's language rule if provided."
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