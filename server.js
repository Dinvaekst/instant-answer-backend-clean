import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import Stripe from "stripe";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json({ limit: "4mb" }));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const proDevices = new Set();

function isProUser(deviceId) {
  return Boolean(deviceId && proDevices.has(deviceId));
}

function cleanText(text = "") {
  return String(text)
    .replace(/\s+/g, " ")
    .trim();
}

function limitText(text = "", max = 12000) {
  const value = String(text || "");
  if (value.length <= max) return value;
  return value.slice(0, max) + "\n\n[Content shortened for stability]";
}

function extractLatestUserMessage(input = "") {
  const text = String(input || "");

  const latestMatch = text.match(/User's latest message:\s*([\s\S]*?)(?:\n\nRules:|\nRules:|$)/i);
  if (latestMatch?.[1]) return cleanText(latestMatch[1]).slice(0, 500);

  const searchMatch = text.match(/SEARCH QUERY:\s*([\s\S]*?)(?:\n\nVISIBLE RESULTS:|\nVISIBLE RESULTS:|$)/i);
  if (searchMatch?.[1]) return cleanText(searchMatch[1]).slice(0, 500);

  const googleMatch = text.match(/Google search query:\s*([\s\S]*?)(?:\n|$)/i);
  if (googleMatch?.[1]) return cleanText(googleMatch[1]).slice(0, 500);

  return cleanText(text).slice(0, 500);
}

function detectPageType(input = "") {
  const text = input.toLowerCase();

  if (text.includes("reddit.com") || text.includes("page type:\nreddit")) return "reddit";
  if (text.includes("google search results") || text.includes("search query:")) return "google";
  if (text.includes("youtube.com") || text.includes("page type:\nyoutube")) return "youtube";
  if (text.includes("current page") || text.includes("page content")) return "webpage";

  return "normal";
}

function shouldUseWebSearch(input = "", mode = "chat") {
  const text = input.toLowerCase();
  const pageType = detectPageType(input);

  if (pageType === "google") return true;

  const searchTriggers = [
    "søg",
    "search",
    "google",
    "find information",
    "find info",
    "nyeste",
    "latest",
    "aktuel",
    "current",
    "i dag",
    "today",
    "nyheder",
    "news",
    "pris",
    "price",
    "hvem er",
    "who is",
    "hvornår",
    "when",
    "opdateret",
    "updated",
    "2025",
    "2026"
  ];

  return searchTriggers.some((word) => text.includes(word));
}

async function searchWeb(query, isPro) {
  if (!process.env.TAVILY_API_KEY) return { text: "", sources: [] };
  if (!query || query.length < 3) return { text: "", sources: [] };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), isPro ? 12000 : 8000);

    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.TAVILY_API_KEY}`
      },
      body: JSON.stringify({
        query,
        topic: "general",
        search_depth: isPro ? "advanced" : "basic",
        max_results: isPro ? 6 : 4,
        include_answer: true,
        include_raw_content: false
      })
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.error("Tavily failed:", response.status, await response.text());
      return { text: "", sources: [] };
    }

    const data = await response.json();

    const sources = Array.isArray(data.results)
      ? data.results.slice(0, isPro ? 6 : 4).map((item, index) => ({
          number: index + 1,
          title: item.title || "Untitled source",
          url: item.url || "",
          content: item.content || ""
        }))
      : [];

    const sourceText = sources
      .map(
        (source) => `
Source ${source.number}
Title: ${source.title}
URL: ${source.url}
Content: ${limitText(source.content, 1000)}
`
      )
      .join("\n");

    const text = `
WEB SEARCH RESULTS

Query:
${query}

Direct answer:
${data.answer || "No direct answer"}

Sources:
${sourceText}

Rules:
- Use these sources when they answer the user.
- Mention source titles when useful.
- Do not invent sources.
`;

    return { text, sources };
  } catch (error) {
    console.error("Tavily error:", error.message);
    return { text: "", sources: [] };
  }
}

function buildPrompt(mode, input, isPro, pageType) {
  const plan = isPro ? "PRO" : "FREE";

  return `
You are Instant Answer.

User plan: ${plan}
Mode: ${mode}
Page type: ${pageType}

Main rules:
- Answer in the same language as the user.
- Do exactly what the user asks.
- Be direct, useful and human.
- If the user asks for text, write the text.
- If the user asks for a long answer, write a long answer.
- If it cannot fit, write Part 1 and end with: "Skriv fortsæt, så skriver jeg næste del."
- Do not invent facts, quotes, sources or page numbers.
- Use current page context if included.
- If web results are included, trust them more than old knowledge.
- For Google results: understand the search intent and summarize the best answer.
- For Reddit: summarize opinions, patterns, warnings and useful points.
- For webpages: focus on the visible content and user question.

Quality:
- Strong structure.
- Clear explanation.
- Concrete examples when useful.
- No generic filler.

User input:
${limitText(input, isPro ? 24000 : 14000)}
`;
}

function getMaxTokens(mode, isPro) {
  if (isPro) {
    if (mode === "quick") return 700;
    if (mode === "assignment") return 4000;
    if (mode === "study") return 3800;
    if (mode === "deep") return 3800;
    return 3500;
  }

  if (mode === "quick") return 300;
  if (mode === "assignment") return 1400;
  if (mode === "study") return 1400;
  if (mode === "deep") return 1400;
  return 1200;
}

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "Instant Answer backend is running"
  });
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
            <p>You can now go back to the extension.</p>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Stripe success error:", error);
    res.send("Could not verify payment.");
  }
});

app.post("/check-pro", (req, res) => {
  const { deviceId } = req.body || {};
  res.json({ pro: isProUser(deviceId) });
});

app.post("/ask", async (req, res) => {
  try {
    const { input, mode = "chat", deviceId } = req.body || {};

    if (!input || typeof input !== "string") {
      return res.status(400).json({
        error: "Missing input",
        answer: "Der mangler input."
      });
    }

    const isPro = isProUser(deviceId);
    const pageType = detectPageType(input);
    const latestMessage = extractLatestUserMessage(input);
    const useSearch = shouldUseWebSearch(input, mode);

    const web = useSearch ? await searchWeb(latestMessage, isPro) : { text: "", sources: [] };

    const finalInput = web.text
      ? `${input}\n\n${web.text}`
      : input;

    const prompt = buildPrompt(mode, finalInput, isPro, pageType);

    const completion = await openai.chat.completions.create({
      model: isPro ? "gpt-4o" : "gpt-4o-mini",
      temperature: isPro ? 0.2 : 0.3,
      max_tokens: getMaxTokens(mode, isPro),
      messages: [
        {
          role: "system",
          content:
            "You are Instant Answer, a fast premium AI assistant inside a Chrome extension. Be accurate, direct, helpful and stable."
        },
        {
          role: "user",
          content: prompt
        }
      ]
    });

    const answer =
      completion?.choices?.[0]?.message?.content?.trim() ||
      "Jeg kunne ikke lave et svar. Prøv igen.";

    res.json({
      answer,
      pro: isPro,
      usedSearch: Boolean(web.text),
      pageType,
      sources: web.sources.map((source) => ({
        title: source.title,
        url: source.url
      }))
    });
  } catch (error) {
    console.error("Ask error:", error);

    res.status(500).json({
      error: "Server error",
      answer:
        "Der skete en fejl i AI-serveren. Prøv igen om lidt, eller gør spørgsmålet kortere."
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Instant Answer backend running on http://localhost:${PORT}`);
});