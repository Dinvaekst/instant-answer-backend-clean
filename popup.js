let currentPageText = "";
let currentPageType = "";
let currentPageLabel = "";
let pageLoaded = false;

let activeChatTool = "normal";

const BACKEND_URL = "https://instant-answer-backend-clean.onrender.com";
const ASK_URL = `${BACKEND_URL}/ask`;
const CHECK_PRO_URL = `${BACKEND_URL}/check-pro`;

const userLanguage = navigator.language || "en";
const DAILY_LIMIT = 5;
const PRO_LINK = "https://buy.stripe.com/4gMbJ38OycALbkD3ZD3ks02";

const CHAT_CONVERSATIONS_KEY = "instant_answer_chat_conversations";
const ACTIVE_CHAT_ID_KEY = "instant_answer_active_chat_id";

let chatConversations = JSON.parse(localStorage.getItem(CHAT_CONVERSATIONS_KEY) || "[]");
let activeChatId = localStorage.getItem(ACTIVE_CHAT_ID_KEY);

function createConversation(title = "New chat") {
  return {
    id: crypto.randomUUID(),
    title,
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function saveConversations() {
  localStorage.setItem(CHAT_CONVERSATIONS_KEY, JSON.stringify(chatConversations.slice(0, 30)));
  localStorage.setItem(ACTIVE_CHAT_ID_KEY, activeChatId);
}

function getActiveConversation() {
  let conversation = chatConversations.find(chat => chat.id === activeChatId);

  if (!conversation) {
    conversation = createConversation();
    chatConversations.unshift(conversation);
    activeChatId = conversation.id;
    saveConversations();
  }

  return conversation;
}

function generateChatTitle(message = "") {
  const clean = message.replace(/\s+/g, " ").trim();
  if (!clean) return "New chat";
  return clean.length > 34 ? `${clean.slice(0, 34)}...` : clean;
}

if (chatConversations.length === 0) {
  const oldMessages = JSON.parse(localStorage.getItem("instant_answer_chat_messages") || "[]");
  const firstConversation = createConversation(
    oldMessages.length > 0 ? generateChatTitle(oldMessages[0]?.content || "Old chat") : "New chat"
  );

  firstConversation.messages = oldMessages;
  chatConversations.unshift(firstConversation);
  activeChatId = firstConversation.id;
  saveConversations();
}

let chatMessages = getActiveConversation().messages || [];

function saveChatMessages() {
  const conversation = getActiveConversation();

  conversation.messages = chatMessages
    .filter(msg => msg.role !== "loading")
    .slice(-40);

  conversation.updatedAt = new Date().toISOString();

  const firstUserMessage = conversation.messages.find(msg => msg.role === "user");

  if (firstUserMessage) {
    conversation.title = generateChatTitle(firstUserMessage.content);
  }

  chatConversations = chatConversations
    .map(chat => chat.id === conversation.id ? conversation : chat)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  saveConversations();
}

function startNewChat() {
  const conversation = createConversation();
  chatConversations.unshift(conversation);
  activeChatId = conversation.id;
  chatMessages = [];
  saveConversations();
}

function openOldChat(id) {
  activeChatId = id;
  chatMessages = getActiveConversation().messages || [];
  saveConversations();
}

function deleteChat(id) {
  chatConversations = chatConversations.filter(chat => chat.id !== id);

  if (chatConversations.length === 0) {
    const conversation = createConversation();
    chatConversations.unshift(conversation);
    activeChatId = conversation.id;
  } else if (activeChatId === id) {
    activeChatId = chatConversations[0].id;
  }

  chatMessages = getActiveConversation().messages || [];
  saveConversations();
}

function clearChatMessages() {
  const conversation = getActiveConversation();
  conversation.messages = [];
  conversation.title = "New chat";
  conversation.updatedAt = new Date().toISOString();

  chatMessages = [];

  chatConversations = chatConversations.map(chat =>
    chat.id === conversation.id ? conversation : chat
  );

  saveConversations();
}

function escapeHTML(text = "") {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatAnswer(text = "") {
  return escapeHTML(text).replace(/\n/g, "<br>");
}

function cleanText(text = "", limit = 12000) {
  return text.replace(/\s+/g, " ").trim().slice(0, limit);
}

function getLastAssistantAnswer() {
  return [...chatMessages].reverse().find(msg => msg.role === "assistant");
}

function getLastUserMessage() {
  return [...chatMessages].reverse().find(msg => msg.role === "user");
}

function getDownloadPDFLabel() {
  if (userLanguage.startsWith("da")) return "Download PDF";
  if (userLanguage.startsWith("tr")) return "PDF indir";
  if (userLanguage.startsWith("de")) return "PDF herunterladen";
  if (userLanguage.startsWith("fr")) return "Télécharger PDF";
  if (userLanguage.startsWith("es")) return "Descargar PDF";
  return "Download PDF";
}

function copyLastAnswer() {
  const lastAnswer = getLastAssistantAnswer();

  if (!lastAnswer) {
    alert("No AI answer found yet.");
    return;
  }

  navigator.clipboard.writeText(lastAnswer.content);
}

function downloadLastAnswerAsPDF() {
  const lastAnswer = getLastAssistantAnswer();

  if (!lastAnswer) {
    alert("No AI answer found yet.");
    return;
  }

  const conversation = getActiveConversation();
  const date = new Date().toLocaleString();
  const cleanTextForPdf = escapeHTML(lastAnswer.content).replace(/\n/g, "<br>");

  const printWindow = window.open("", "_blank");

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Instant Answer PDF</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            padding: 44px;
            line-height: 1.65;
            color: #111;
            background: white;
          }

          .top {
            border-bottom: 1px solid #ddd;
            padding-bottom: 18px;
            margin-bottom: 24px;
          }

          h1 {
            font-size: 26px;
            margin: 0 0 8px 0;
          }

          .meta {
            font-size: 12px;
            color: #666;
            line-height: 1.6;
          }

          .content {
            font-size: 14px;
            white-space: normal;
          }

          .footer {
            border-top: 1px solid #ddd;
            margin-top: 40px;
            padding-top: 16px;
            font-size: 11px;
            color: #777;
          }

          @media print {
            button {
              display: none;
            }
          }
        </style>
      </head>
      <body>
        <div class="top">
          <h1>Instant Answer</h1>
          <div class="meta">
            Chat: ${escapeHTML(conversation.title || "New chat")}<br>
            Tool: ${escapeHTML(activeChatTool)}<br>
            Date: ${escapeHTML(date)}
          </div>
        </div>

        <div class="content">${cleanTextForPdf}</div>

        <div class="footer">
          Generated with Instant Answer
        </div>

        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
    </html>
  `);

  printWindow.document.close();
}

function getChatPlaceholder() {
  if (activeChatTool === "assignment") {
    if (userLanguage.startsWith("da")) return "Indsæt din opgave her...";
    return "Paste your assignment here...";
  }

  if (activeChatTool === "improve") {
    if (userLanguage.startsWith("da")) return "Indsæt din tekst her...";
    return "Paste your text here...";
  }

  if (activeChatTool === "feedback") {
    if (userLanguage.startsWith("da")) return "Indsæt din tekst og få feedback...";
    return "Paste your text and get feedback...";
  }

  if (activeChatTool === "math") {
    if (userLanguage.startsWith("da")) return "Indsæt din matematikopgave her...";
    return "Paste your math problem here...";
  }

  if (activeChatTool === "analyze") {
    if (userLanguage.startsWith("da")) return "Spørg om siden, teksten, videoen eller artiklen...";
    return "Ask about the page, text, video or article...";
  }

  if (userLanguage.startsWith("da")) return "Skriv dit spørgsmål...";
  if (userLanguage.startsWith("tr")) return "Sorunu yaz...";
  if (userLanguage.startsWith("de")) return "Stelle deine Frage...";
  if (userLanguage.startsWith("fr")) return "Écris ta question...";
  if (userLanguage.startsWith("es")) return "Escribe tu pregunta...";
  return "Ask anything...";
}

function getSendLabel() {
  if (userLanguage.startsWith("da")) return "Send";
  if (userLanguage.startsWith("tr")) return "Gönder";
  if (userLanguage.startsWith("de")) return "Senden";
  if (userLanguage.startsWith("fr")) return "Envoyer";
  if (userLanguage.startsWith("es")) return "Enviar";
  return "Send";
}

function getThinkingLabel() {
  if (userLanguage.startsWith("da")) return "Tænker";
  if (userLanguage.startsWith("tr")) return "Düşünüyor";
  if (userLanguage.startsWith("de")) return "Denke nach";
  if (userLanguage.startsWith("fr")) return "Réflexion";
  if (userLanguage.startsWith("es")) return "Pensando";
  return "Thinking";
}

function getClearChatLabel() {
  if (userLanguage.startsWith("da")) return "Ryd chat";
  if (userLanguage.startsWith("tr")) return "Sohbeti temizle";
  if (userLanguage.startsWith("de")) return "Chat löschen";
  if (userLanguage.startsWith("fr")) return "Effacer le chat";
  if (userLanguage.startsWith("es")) return "Borrar chat";
  return "Clear Chat";
}

function getDeviceId() {
  let deviceId = localStorage.getItem("instant_answer_device_id");

  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem("instant_answer_device_id", deviceId);
  }

  return deviceId;
}

function isProUser() {
  return localStorage.getItem("instant_answer_pro") === "true";
}

function setProUser(value) {
  localStorage.setItem("instant_answer_pro", value ? "true" : "false");
}

function getTodayKey() {
  const today = new Date().toISOString().split("T")[0];
  return `instant_answer_usage_${today}`;
}

function getUsage() {
  return parseInt(localStorage.getItem(getTodayKey())) || 0;
}

function increaseUsage() {
  if (!isProUser()) {
    localStorage.setItem(getTodayKey(), getUsage() + 1);
  }
}

function getRemainingUsage() {
  if (isProUser()) return "∞";
  return Math.max(DAILY_LIMIT - getUsage(), 0);
}

function hasReachedLimit() {
  if (isProUser()) return false;
  return getUsage() >= DAILY_LIMIT;
}

function saveHistory(mode, question, answer) {
  const history = JSON.parse(localStorage.getItem("instant_answer_history") || "[]");

  history.unshift({
    mode,
    question: question.slice(0, 300),
    answer: answer.slice(0, 1200),
    date: new Date().toISOString()
  });

  localStorage.setItem("instant_answer_history", JSON.stringify(history.slice(0, 20)));
}

function getLanguageInstruction() {
  if (userLanguage.startsWith("da")) return "Answer in Danish.";
  if (userLanguage.startsWith("tr")) return "Answer in Turkish.";
  if (userLanguage.startsWith("de")) return "Answer in German.";
  if (userLanguage.startsWith("fr")) return "Answer in French.";
  if (userLanguage.startsWith("es")) return "Answer in Spanish.";
  return "Answer in English.";
}

document.addEventListener("DOMContentLoaded", async () => {
  const videoTitleElement = document.getElementById("videoTitle");
  const quickBtn = document.getElementById("quickBtn");
  const deepBtn = document.getElementById("deepBtn");
  const studyBtn = document.getElementById("studyBtn");
  const chatBtn = document.getElementById("chatBtn");
  const result = document.getElementById("result");
  const proStatus = document.getElementById("proStatus");

  const historyBtn = document.getElementById("historyBtn");
  const clearHistoryBtn = document.getElementById("clearHistoryBtn");

  const deviceId = getDeviceId();
  const languageInstruction = getLanguageInstruction();

  function setButtonsDisabled(value) {
    quickBtn.disabled = value;
    deepBtn.disabled = value;
    studyBtn.disabled = value;
    chatBtn.disabled = value;
  }

  async function checkProStatus() {
    try {
      const response = await fetch(CHECK_PRO_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId })
      });

      const data = await response.json();

      if (data.pro) {
        setProUser(true);
      }
    } catch (error) {
      console.error("Pro check failed", error);
    }
  }

  function updateProStatus() {
    proStatus.textContent = isProUser()
      ? "Pro plan active"
      : `Free plan · ${getRemainingUsage()}/${DAILY_LIMIT}`;
  }

  function updatePageLabel() {
    videoTitleElement.textContent = isProUser()
      ? `${currentPageLabel} · Pro`
      : `${currentPageLabel} · Free ${getRemainingUsage()}`;
  }

  function showProBox() {
    result.innerHTML = `
      <div class="pro-box">
        <div class="pro-label">LIMIT REACHED</div>
        <div class="pro-title">Upgrade to Pro</div>
        <div class="pro-text">
          You have used your 5 free answers today.
        </div>
        <div class="pro-features">
          Unlimited answers<br>
          Better summaries<br>
          Faster responses<br>
          Study mode access<br>
          AI chat access<br>
          Advanced math help
        </div>
        <button class="upgrade-btn" id="upgradeBtn">Upgrade to Pro</button>
      </div>
    `;

    document.getElementById("upgradeBtn").onclick = () => {
      const checkoutUrl = `${PRO_LINK}?client_reference_id=${deviceId}`;
      window.open(checkoutUrl, "_blank");
    };
  }

  function getToolButtonStyle(tool) {
    const active = activeChatTool === tool;

    return `
      flex: 1;
      padding: 8px 6px;
      border: ${active ? "1px solid #111" : "1px solid #ddd"};
      border-radius: 10px;
      background: ${active ? "#111" : "#f7f7f7"};
      color: ${active ? "white" : "#333"};
      font-weight: bold;
      cursor: pointer;
      font-size: 11px;
    `;
  }

  function renderConversationList() {
    if (chatConversations.length === 0) {
      return `<div style="font-size:12px;color:#777;">No chats yet.</div>`;
    }

    return chatConversations.slice(0, 8).map(chat => {
      const active = chat.id === activeChatId;

      return `
        <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">
          <button class="oldChatBtn" data-id="${chat.id}" style="
            flex:1;
            text-align:left;
            padding:8px 10px;
            border-radius:10px;
            border:${active ? "1px solid #111" : "1px solid #ddd"};
            background:${active ? "#111" : "#f7f7f7"};
            color:${active ? "white" : "#222"};
            font-size:12px;
            font-weight:700;
            cursor:pointer;
            overflow:hidden;
            white-space:nowrap;
            text-overflow:ellipsis;
          ">
            ${escapeHTML(chat.title || "New chat")}
          </button>

          <button class="deleteChatBtn" data-id="${chat.id}" style="
            width:34px;
            height:34px;
            border-radius:10px;
            border:1px solid #ddd;
            background:#fff;
            color:#555;
            cursor:pointer;
            font-weight:900;
          ">×</button>
        </div>
      `;
    }).join("");
  }

  function renderChatMessages() {
    if (chatMessages.length === 0) {
      return `
        <div style="color:#777;">
          ${escapeHTML(getChatPlaceholder())}
        </div>
      `;
    }

    return chatMessages.map((message, index) => {
      if (message.role === "loading") {
        return `
          <div style="text-align:left;margin-bottom:8px;">
            <div style="
              display:inline-block;
              max-width:85%;
              background:#f1f1f1;
              color:#111;
              padding:8px 10px;
              border-radius:12px;
              text-align:left;
            ">
              ${escapeHTML(getThinkingLabel())}<span class="typingDots">...</span>
            </div>
          </div>
        `;
      }

      const align = message.role === "user" ? "right" : "left";
      const bg = message.role === "user" ? "#111" : "#f1f1f1";
      const color = message.role === "user" ? "white" : "#111";

      return `
        <div style="text-align:${align}; margin-bottom:8px;">
          <div style="
            display:inline-block;
            max-width:85%;
            background:${bg};
            color:${color};
            padding:8px 10px;
            border-radius:12px;
            text-align:left;
          ">
            ${formatAnswer(message.content)}
          </div>

          ${message.role === "assistant" ? `
            <div style="margin-top:4px;text-align:left;">
              <button class="copySingleBtn" data-index="${index}" style="
                border:none;
                background:#f7f7f7;
                color:#555;
                font-size:11px;
                cursor:pointer;
                border-radius:8px;
                padding:4px 8px;
              ">Copy</button>
            </div>
          ` : ""}
        </div>
      `;
    }).join("");
  }

  function openChat() {
    const activeConversation = getActiveConversation();

    result.innerHTML = `
      <div class="answer-box">
        <div class="answer-label">CHAT</div>
        <div class="answer-title">Instant Answer Chat</div>

        <div style="display:flex; gap:8px; margin-bottom:10px;">
          <button id="newChatBtn" style="flex:1;padding:10px;border:none;border-radius:12px;background:#111;color:white;font-weight:900;cursor:pointer;">+ New Chat</button>
          <button id="toggleOldChatsBtn" style="flex:1;padding:10px;border:1px solid #ddd;border-radius:12px;background:#f7f7f7;color:#111;font-weight:900;cursor:pointer;">Old Chats</button>
        </div>

        <div id="oldChatsBox" style="display:none;margin-bottom:12px;padding:10px;border:1px solid #eee;border-radius:14px;background:#fafafa;max-height:180px;overflow-y:auto;">
          ${renderConversationList()}
        </div>

        <div style="font-size:12px;color:#777;margin-bottom:8px;background:#f7f7f7;border:1px solid #eee;border-radius:12px;padding:8px 10px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">
          Current chat: ${escapeHTML(activeConversation.title || "New chat")}
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-bottom:10px;">
          <button id="assignmentBtn" style="${getToolButtonStyle("assignment")}">Assignment</button>
          <button id="improveBtn" style="${getToolButtonStyle("improve")}">Improve</button>
          <button id="feedbackBtn" style="${getToolButtonStyle("feedback")}">Feedback</button>
          <button id="mathBtn" style="${getToolButtonStyle("math")}">Math</button>
          <button id="analyzeBtn" style="${getToolButtonStyle("analyze")}">Analyze page</button>
          <button id="normalBtn" style="${getToolButtonStyle("normal")}">Normal</button>
        </div>

        <div id="chatMessages" style="max-height:260px;overflow-y:auto;margin-bottom:10px;font-size:13px;line-height:1.45;">
          ${renderChatMessages()}
        </div>

        <textarea id="chatInput" placeholder="${getChatPlaceholder()}" style="width:100%;height:90px;resize:none;box-sizing:border-box;border:1px solid #ddd;border-radius:12px;padding:10px;font-family:Arial,sans-serif;font-size:13px;outline:none;"></textarea>

        <button id="sendChatBtn" style="width:100%;margin-top:8px;padding:11px;border:none;border-radius:12px;background:linear-gradient(135deg,#000,#333);color:white;font-weight:bold;cursor:pointer;">${getSendLabel()}</button>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;">
          <button id="copyLastBtn" style="padding:10px;border:1px solid #ddd;border-radius:12px;background:#f7f7f7;color:#111;font-weight:bold;cursor:pointer;">Copy</button>
          <button id="regenerateBtn" style="padding:10px;border:1px solid #ddd;border-radius:12px;background:#f7f7f7;color:#111;font-weight:bold;cursor:pointer;">Regenerate</button>
        </div>

        <button id="downloadPdfBtn" style="width:100%;margin-top:8px;padding:10px;border:none;border-radius:12px;background:#111;color:white;font-weight:bold;cursor:pointer;">${getDownloadPDFLabel()}</button>

        <button id="clearChatBtn" style="width:100%;margin-top:8px;padding:10px;border:1px solid #ddd;border-radius:12px;background:#f7f7f7;color:#333;font-weight:bold;cursor:pointer;">${getClearChatLabel()}</button>
      </div>
    `;

    document.getElementById("newChatBtn").onclick = () => {
      startNewChat();
      openChat();
    };

    document.getElementById("toggleOldChatsBtn").onclick = () => {
      const box = document.getElementById("oldChatsBox");
      box.style.display = box.style.display === "none" ? "block" : "none";
    };

    document.querySelectorAll(".oldChatBtn").forEach(btn => {
      btn.onclick = () => {
        openOldChat(btn.dataset.id);
        openChat();
      };
    });

    document.querySelectorAll(".deleteChatBtn").forEach(btn => {
      btn.onclick = () => {
        deleteChat(btn.dataset.id);
        openChat();
      };
    });

    document.querySelectorAll(".copySingleBtn").forEach(btn => {
      btn.onclick = () => {
        const msg = chatMessages[Number(btn.dataset.index)];
        if (msg?.content) navigator.clipboard.writeText(msg.content);
      };
    });

    document.getElementById("assignmentBtn").onclick = () => {
      activeChatTool = "assignment";
      openChat();
    };

    document.getElementById("improveBtn").onclick = () => {
      activeChatTool = "improve";
      openChat();
    };

    document.getElementById("feedbackBtn").onclick = () => {
      activeChatTool = "feedback";
      openChat();
    };

    document.getElementById("mathBtn").onclick = () => {
      activeChatTool = "math";
      openChat();
    };

    document.getElementById("analyzeBtn").onclick = () => {
      activeChatTool = "analyze";
      openChat();
    };

    document.getElementById("normalBtn").onclick = () => {
      activeChatTool = "normal";
      openChat();
    };

    document.getElementById("sendChatBtn").onclick = () => sendChatMessage();
    document.getElementById("copyLastBtn").onclick = copyLastAnswer;
    document.getElementById("regenerateBtn").onclick = regenerateLastAnswer;
    document.getElementById("downloadPdfBtn").onclick = downloadLastAnswerAsPDF;

    document.getElementById("clearChatBtn").onclick = () => {
      clearChatMessages();
      openChat();
    };

    const chatInput = document.getElementById("chatInput");
    chatInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendChatMessage();
      }
    });

    const chatMessagesBox = document.getElementById("chatMessages");
    chatMessagesBox.scrollTop = chatMessagesBox.scrollHeight;
  }

  function getToolPrompt(tool) {
    if (tool === "assignment") {
      return `
Special mode: Assignment helper.

You must:
1. Explain what the assignment requires.
2. Show how to start.
3. Make a clear disposition/structure.
4. Give example formulations.
5. If the user asks for a full text, write a strong draft.
6. If the assignment involves math, solve it step-by-step.
`;
    }

    if (tool === "improve") {
      return `
Special mode: Improve text.

You must:
1. Correct mistakes.
2. Improve the text.
3. Make it sound more natural and human.
4. Keep the original meaning.
5. Explain briefly what was improved.
`;
    }

    if (tool === "feedback") {
      return `
Special mode: Teacher feedback.

You must:
1. Explain what is good.
2. Explain what is missing.
3. Explain how it becomes better.
4. Give concrete suggestions.
5. Give a better version if useful.
`;
    }

    if (tool === "math") {
      return `
Special mode: Expert math tutor.

You must:
1. Solve math problems step-by-step.
2. Show formulas clearly.
3. Explain why each step is done.
4. Check the final answer.
5. Use simple language.
6. If the user gives an equation, solve it fully.
7. If the user gives a word problem, identify known values, unknown value, formula, calculation and answer.
8. Do not skip steps.
`;
    }

    if (tool === "analyze") {
      return `
Special mode: Analyze page.

Analyze the current page context:
- YouTube: summarize, explain, make notes, identify key points.
- Google: answer search query using visible results.
- Reddit: summarize post and comments.
- Article/essay/novel: summarize, analyze theme, message, structure, language and arguments.
`;
    }

    return `
Special mode: Normal chat.

Answer clearly and helpfully.
If it is math, solve step-by-step.
If it is school work, give structure and useful wording.
`;
  }

  async function buildChatInput(userMessage) {
    const chatContext = chatMessages
      .filter(msg => msg.role !== "loading")
      .slice(-10)
      .map(msg => `${msg.role.toUpperCase()}: ${msg.content}`)
      .join("\n");

    return `
You are Instant Answer Chat.

Language rule:
${languageInstruction}

You help with:
- questions
- homework
- explanations
- text improvement
- structure
- ideas
- assignment help
- teacher-style feedback
- mathematics at expert tutor level
- YouTube analysis
- Google search analysis
- Reddit analysis
- article, essay, short story and novel analysis

Current browser page context:
Page type: ${currentPageType || "unknown"}
Page label: ${currentPageLabel || "unknown"}

Page content:
${currentPageText || "No page context available."}

Selected tool:
${activeChatTool}

Tool instructions:
${getToolPrompt(activeChatTool)}

Chat so far:
${chatContext}

User's latest message:
${userMessage}

Rules:
- Answer exactly what the user asks.
- Do the task, not just explain what to do.
- If it is math, solve step-by-step with formulas and final answer.
- If it is a school assignment, give structure, explanation and useful draft.
- If the user asks about the current page, use the page context.
- If the user asks to analyze an article, essay, novel or short story, include theme, message, structure, language and examples.
- If the user asks to analyze YouTube, Google or Reddit, use the available page data.
- Keep it clear, useful and human.
`;
  }

  async function askBackend(userMessage, addUserMessage = true) {
    await checkProStatus();
    updateProStatus();

    if (hasReachedLimit()) {
      showProBox();
      return;
    }

    if (addUserMessage) {
      chatMessages.push({
        role: "user",
        content: userMessage
      });
    }

    chatMessages.push({
      role: "loading",
      content: getThinkingLabel()
    });

    saveChatMessages();
    openChat();

    try {
      const input = await buildChatInput(userMessage);

      const response = await fetch(ASK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input,
          mode: activeChatTool === "normal" ? "chat" : activeChatTool,
          deviceId
        })
      });

      const data = await response.json();

      chatMessages = chatMessages.filter(msg => msg.role !== "loading");

      if (!response.ok || !data.answer) {
        chatMessages.push({
          role: "assistant",
          content: "Could not get an AI answer right now."
        });

        saveChatMessages();
        openChat();
        return;
      }

      if (data.pro) {
        setProUser(true);
      }

      chatMessages.push({
        role: "assistant",
        content: data.answer
      });

      saveChatMessages();
      saveHistory(activeChatTool, userMessage, data.answer);
      increaseUsage();
      updateProStatus();
      updatePageLabel();
      openChat();

    } catch (error) {
      console.error(error);

      chatMessages = chatMessages.filter(msg => msg.role !== "loading");

      chatMessages.push({
        role: "assistant",
        content: "Could not connect to backend."
      });

      saveChatMessages();
      openChat();
    }
  }

  async function sendChatMessage() {
    const chatInput = document.getElementById("chatInput");
    const userMessage = chatInput.value.trim();

    if (!userMessage) return;

    chatInput.value = "";
    await askBackend(userMessage, true);
  }

  async function regenerateLastAnswer() {
    const lastUser = getLastUserMessage();

    if (!lastUser) {
      alert("No user message found.");
      return;
    }

    const lastAssistantIndex = [...chatMessages]
      .map((msg, index) => ({ msg, index }))
      .reverse()
      .find(item => item.msg.role === "assistant")?.index;

    if (lastAssistantIndex !== undefined) {
      chatMessages.splice(lastAssistantIndex, 1);
    }

    saveChatMessages();
    await askBackend(lastUser.content, false);
  }

  await checkProStatus();
  updateProStatus();

  chatBtn.onclick = openChat;

  historyBtn.addEventListener("click", () => {
    const history = JSON.parse(localStorage.getItem("instant_answer_history") || "[]");

    if (history.length === 0) {
      result.innerHTML = "No history yet.";
      return;
    }

    result.innerHTML = `
      <div class="answer-box">
        <div class="answer-label">HISTORY</div>
        <div class="answer-title">Recent answers</div>
        <div class="answer-content">
          ${history.map(item => `
            <div style="margin-bottom:12px;">
              <strong>${escapeHTML(item.mode.toUpperCase())}</strong><br>
              ${escapeHTML(item.question.slice(0, 80))}...<br><br>
              ${formatAnswer(item.answer.slice(0, 180))}...
            </div>
          `).join("")}
        </div>
      </div>
    `;
  });

  clearHistoryBtn.addEventListener("click", () => {
    localStorage.removeItem("instant_answer_history");
    result.innerHTML = "History cleared.";
  });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab.url || tab.url.startsWith("chrome://")) {
    videoTitleElement.textContent = "This page is not supported.";
    result.innerHTML = "Open YouTube, Google Search, Reddit or a normal webpage and try again.";
    return;
  }

  chrome.scripting.executeScript(
    { target: { tabId: tab.id }, function: getPageInfo },
    (results) => {
      const pageInfo = results?.[0]?.result;

      if (!pageInfo) {
        currentPageText = "";
        currentPageType = "unknown";
        currentPageLabel = "No page found";
        videoTitleElement.textContent = "No page found";
        pageLoaded = true;
        return;
      }

      currentPageText = pageInfo.text || "";
      currentPageType = pageInfo.type || "webpage";
      currentPageLabel = pageInfo.label || "Current page";
      pageLoaded = true;

      updatePageLabel();
    }
  );

  quickBtn.onclick = () => generateAnswer("quick");
  deepBtn.onclick = () => generateAnswer("deep");
  studyBtn.onclick = () => generateAnswer("study");

  async function generateAnswer(mode) {
    result.innerHTML = `<div class="loading">AI is working...</div>`;
    setButtonsDisabled(true);

    try {
      await checkProStatus();
      updateProStatus();

      if (!pageLoaded) {
        result.innerHTML = "Page is still loading. Try again in a second.";
        return;
      }

      if (hasReachedLimit()) {
        showProBox();
        return;
      }

      if (!currentPageText || currentPageText.includes("No visible text found")) {
        result.innerHTML = "Open YouTube, Google Search, Reddit or a normal webpage and try again.";
        return;
      }

      const improvedInput = `
You are reading content from a browser page.

Language rule:
${languageInstruction}

Page type:
${currentPageType}

Mode:
${mode}

Important:
- Do not say "I can't interpret".
- If the page content is short, explain the topic behind it.
- If it is a search query, answer the search question directly.
- If it is a school topic, explain it clearly.
- If it is math, solve step-by-step.
- If it is Reddit, summarize the post and visible comments.
- If it is YouTube, analyze title, description and comments.
- If it is an article, essay, novel or short story, analyze it deeply.
- Always give useful value.
- Keep the answer clear and easy to understand.

Content:
${currentPageText}
`;

      const response = await fetch(ASK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: improvedInput,
          mode,
          deviceId
        })
      });

      const data = await response.json();

      if (!response.ok || !data.answer) {
        result.innerHTML = "Could not get an AI answer right now.";
        return;
      }

      if (data.pro) {
        setProUser(true);
      }

      saveHistory(mode, currentPageText, data.answer);
      increaseUsage();
      updateProStatus();
      updatePageLabel();

      const title =
        mode === "quick"
          ? "Quick Answer"
          : mode === "deep"
          ? "AI Overview"
          : "Study Help";

      result.innerHTML = `
        <div class="answer-box">
          <div class="answer-label">${escapeHTML(mode.toUpperCase())}</div>
          <div class="answer-title">${title}</div>
          <div class="answer-content">
            ${formatAnswer(data.answer)}
          </div>
        </div>
      `;
    } catch (error) {
      console.error(error);
      result.innerHTML = "Could not connect to backend. Make sure your server is running.";
    } finally {
      setButtonsDisabled(false);
    }
  }
});

async function getPageInfo() {
  const url = window.location.href;

  function clean(text = "", limit = 12000) {
    return text
      .replace(/\s+/g, " ")
      .replace(/Cookie|Accept all|Sign in|Log in/gi, "")
      .trim()
      .slice(0, limit);
  }

  if (url.includes("youtube.com/watch")) {
    const title =
      document.querySelector("h1 yt-formatted-string")?.innerText ||
      document.querySelector("h1")?.innerText ||
      document.title;

    const channel =
      document.querySelector("#owner-name a")?.innerText ||
      document.querySelector("ytd-channel-name a")?.innerText ||
      "";

    const description =
      document.querySelector("#description-inline-expander")?.innerText ||
      document.querySelector("#description")?.innerText ||
      "";

    const comments = Array.from(document.querySelectorAll("#content-text"))
      .slice(0, 12)
      .map(comment => comment.innerText)
      .join("\n\n");

    return {
      type: "youtube",
      label: title.slice(0, 60),
      text: `
PAGE TYPE:
YouTube video

TASK HELP:
The AI should summarize, explain, analyze, make notes, make study points and answer questions about this video based on available page context.

VIDEO TITLE:
${clean(title)}

CHANNEL:
${clean(channel)}

DESCRIPTION:
${clean(description || "No visible description found.")}

VISIBLE COMMENTS:
${clean(comments || "No visible comments found.")}
`
    };
  }

  if (url.includes("google.") && url.includes("/search")) {
    const query =
      document.querySelector("textarea[name='q'], input[name='q']")?.value ||
      document.title.replace(" - Google Search", "");

    const results = Array.from(document.querySelectorAll("div.g, [data-sokoban-container]"))
      .slice(0, 10)
      .map((item, index) => {
        const title = item.querySelector("h3")?.innerText || "";
        const text = item.innerText || "";
        return `Result ${index + 1}:\n${title}\n${text}`;
      })
      .filter(Boolean)
      .join("\n\n");

    return {
      type: "google_search",
      label: `Google: ${query}`.slice(0, 60),
      text: `
PAGE TYPE:
Google search results

TASK HELP:
The AI should answer the search query directly using visible results. It should compare results, explain the topic and give a clear useful answer.

SEARCH QUERY:
${clean(query)}

VISIBLE RESULTS:
${clean(results || "No visible results found.")}
`
    };
  }

  if (url.includes("reddit.com")) {
    const title =
      document.querySelector("h1")?.innerText ||
      document.querySelector('[data-testid="post-title"]')?.innerText ||
      document.title;

    const postText =
      document.querySelector('[data-testid="post-content"]')?.innerText ||
      document.querySelector("shreddit-post")?.innerText ||
      "";

    const comments = Array.from(document.querySelectorAll('[data-testid="comment"], shreddit-comment'))
      .slice(0, 12)
      .map(comment => comment.innerText)
      .join("\n\n");

    return {
      type: "reddit",
      label: `Reddit: ${title.slice(0, 50)}`,
      text: `
PAGE TYPE:
Reddit discussion

TASK HELP:
The AI should summarize the post, explain the discussion, identify opinions, arguments, advice and key points from visible comments.

POST TITLE:
${clean(title)}

POST CONTENT:
${clean(postText || "No post text found.")}

VISIBLE COMMENTS:
${clean(comments || "No comments found.")}
`
    };
  }

  const pageTitle = document.title || "Current page";

  const headings = Array.from(document.querySelectorAll("h1, h2, h3"))
    .map(h => h.innerText)
    .filter(Boolean)
    .slice(0, 25)
    .join("\n");

  const articleText = Array.from(document.querySelectorAll("article p, main p, p"))
    .map(p => p.innerText)
    .filter(text => text && text.length > 30)
    .join("\n\n");

  const bodyText = document.body?.innerText || "";
  const bestText = articleText.length > 500 ? articleText : bodyText;

  return {
    type: "article_or_webpage",
    label: pageTitle.slice(0, 60),
    text: `
PAGE TYPE:
Article / webpage / school text

TASK HELP:
The AI should summarize, analyze, explain, make notes, answer questions, help with essays, analyze articles, novels, short stories, arguments, themes, language, structure and message. If it contains math, the AI should solve it step-by-step like an expert math tutor.

PAGE TITLE:
${clean(pageTitle)}

HEADINGS:
${clean(headings || "No headings found.")}

VISIBLE CONTENT:
${clean(bestText || "No visible text found.")}
`
  };
}