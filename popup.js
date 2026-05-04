let currentPageText = "";
let currentPageType = "";
let currentPageLabel = "";
let pageLoaded = false;

let chatMessages = JSON.parse(localStorage.getItem("instant_answer_chat_messages") || "[]");
let activeChatTool = "normal";

const BACKEND_URL = "https://instant-answer-backend-clean.onrender.com";
const ASK_URL = `${BACKEND_URL}/ask`;
const CHECK_PRO_URL = `${BACKEND_URL}/check-pro`;

const userLanguage = navigator.language || "en";

const DAILY_LIMIT = 5;
const PRO_LINK = "https://buy.stripe.com/4gMbJ38OycALbkD3ZD3ks02";

function saveChatMessages() {
  localStorage.setItem(
    "instant_answer_chat_messages",
    JSON.stringify(chatMessages.slice(-30))
  );
}

function clearChatMessages() {
  chatMessages = [];
  localStorage.removeItem("instant_answer_chat_messages");
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
  if (userLanguage.startsWith("da")) return "Tænker...";
  if (userLanguage.startsWith("tr")) return "Düşünüyor...";
  if (userLanguage.startsWith("de")) return "Denke nach...";
  if (userLanguage.startsWith("fr")) return "Réflexion...";
  if (userLanguage.startsWith("es")) return "Pensando...";
  return "Thinking...";
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
          AI chat access
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

  function openChat() {
    result.innerHTML = `
      <div class="answer-box">
        <div class="answer-label">CHAT</div>
        <div class="answer-title">Instant Answer Chat</div>

        <div style="display:flex; gap:6px; margin-bottom:10px;">
          <button id="assignmentBtn" style="${getToolButtonStyle("assignment")}">Assignment</button>
          <button id="improveBtn" style="${getToolButtonStyle("improve")}">Improve</button>
          <button id="feedbackBtn" style="${getToolButtonStyle("feedback")}">Feedback</button>
        </div>

        <div id="chatMessages" style="
          max-height: 240px;
          overflow-y: auto;
          margin-bottom: 10px;
          font-size: 13px;
          line-height: 1.45;
        ">
          ${renderChatMessages()}
        </div>

        <textarea id="chatInput" placeholder="${getChatPlaceholder()}" style="
          width: 100%;
          height: 80px;
          resize: none;
          box-sizing: border-box;
          border: 1px solid #ddd;
          border-radius: 10px;
          padding: 10px;
          font-family: Arial, sans-serif;
          font-size: 13px;
          outline: none;
        "></textarea>

        <button id="sendChatBtn" style="
          width: 100%;
          margin-top: 8px;
          padding: 11px;
          border: none;
          border-radius: 10px;
          background: linear-gradient(135deg, #000, #333);
          color: white;
          font-weight: bold;
          cursor: pointer;
        ">${getSendLabel()}</button>

        <button id="clearChatBtn" style="
          width: 100%;
          margin-top: 8px;
          padding: 10px;
          border: 1px solid #ddd;
          border-radius: 10px;
          background: #f7f7f7;
          color: #333;
          font-weight: bold;
          cursor: pointer;
        ">${getClearChatLabel()}</button>
      </div>
    `;

    document.getElementById("assignmentBtn").onclick = () => {
      activeChatTool = activeChatTool === "assignment" ? "normal" : "assignment";
      openChat();
    };

    document.getElementById("improveBtn").onclick = () => {
      activeChatTool = activeChatTool === "improve" ? "normal" : "improve";
      openChat();
    };

    document.getElementById("feedbackBtn").onclick = () => {
      activeChatTool = activeChatTool === "feedback" ? "normal" : "feedback";
      openChat();
    };

    document.getElementById("sendChatBtn").onclick = sendChatMessage;

    document.getElementById("clearChatBtn").onclick = () => {
      clearChatMessages();
      openChat();
    };

    const chatMessagesBox = document.getElementById("chatMessages");
    chatMessagesBox.scrollTop = chatMessagesBox.scrollHeight;
  }

  function renderChatMessages() {
    if (chatMessages.length === 0) {
      return `
        <div style="color:#777;">
          ${escapeHTML(getChatPlaceholder())}
        </div>
      `;
    }

    return chatMessages.map(message => {
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
        </div>
      `;
    }).join("");
  }

  function getToolPrompt(tool) {
    if (tool === "assignment") {
      return `
Special mode: Assignment helper.

Explain:
1. What the assignment requires.
2. How the student should start.
3. A clear disposition/structure.
4. An example sentence/formulation.
5. Keep it easy and useful.
`;
    }

    if (tool === "improve") {
      return `
Special mode: Improve text.

Do this:
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

Give feedback:
1. What is good.
2. What is missing.
3. What can be improved.
4. Concrete suggestions.
5. A better version if useful.
`;
    }

    return `
Special mode: Normal chat.

Answer the user's question clearly and helpfully.
`;
  }

  async function sendChatMessage() {
    const chatInput = document.getElementById("chatInput");
    const sendChatBtn = document.getElementById("sendChatBtn");

    const userMessage = chatInput.value.trim();

    if (!userMessage) return;

    await checkProStatus();
    updateProStatus();

    if (hasReachedLimit()) {
      showProBox();
      return;
    }

    chatMessages.push({
      role: "user",
      content: userMessage
    });

    saveChatMessages();

    chatInput.value = "";
    sendChatBtn.disabled = true;
    sendChatBtn.textContent = getThinkingLabel();

    document.getElementById("chatMessages").innerHTML = renderChatMessages();

    try {
      const chatContext = chatMessages
        .slice(-8)
        .map(msg => `${msg.role.toUpperCase()}: ${msg.content}`)
        .join("\n");

      const input = `
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
- Answer clearly.
- Be useful.
- Keep it easy to understand.
- If the user asks about the current page, use the page context.
- Do not say you cannot see the page if page context exists.
`;

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

      if (!response.ok || !data.answer) {
        chatMessages.push({
          role: "assistant",
          content: "Could not get an AI answer right now."
        });

        saveChatMessages();
      } else {
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
      }
    } catch (error) {
      console.error(error);

      chatMessages.push({
        role: "assistant",
        content: "Could not connect to backend."
      });

      saveChatMessages();
    }

    openChat();
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
- If it is Reddit, summarize the post and visible comments.
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

  if (url.includes("youtube.com/watch")) {
    const title =
      document.querySelector("h1 yt-formatted-string")?.innerText ||
      document.querySelector("h1")?.innerText ||
      document.title;

    const description =
      document.querySelector("#description-inline-expander")?.innerText ||
      document.querySelector("#description")?.innerText ||
      "";

    return {
      type: "youtube",
      label: title.slice(0, 60),
      text: `
YouTube title:
${title}

Description:
${description || "No visible description found."}
`
    };
  }

  if (url.includes("google.") && url.includes("/search")) {
    const searchInput = document.querySelector("textarea[name='q'], input[name='q']");
    const query = searchInput ? searchInput.value : document.title.replace(" - Google Search", "");

    const resultTexts = Array.from(document.querySelectorAll("h3"))
      .slice(0, 8)
      .map(item => item.innerText)
      .join("\n");

    return {
      type: "google_search",
      label: `Google: ${query}`.slice(0, 60),
      text: `
Google search query:
${query}

Visible search results:
${resultTexts || "No visible results found."}
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
      .slice(0, 8)
      .map(comment => comment.innerText)
      .join("\n\n")
      .slice(0, 5000);

    return {
      type: "reddit",
      label: `Reddit: ${title.slice(0, 50)}`,
      text: `
Reddit post title:
${title}

Post content:
${postText || "No post text found."}

Top visible comments:
${comments || "No comments found."}
`
    };
  }

  const pageTitle = document.title || "Current page";
  const bodyText = document.body?.innerText?.slice(0, 5000) || "";

  return {
    type: "webpage",
    label: pageTitle.slice(0, 60),
    text: `
Page title:
${pageTitle}

Visible page text:
${bodyText || "No visible text found."}
`
  };
}