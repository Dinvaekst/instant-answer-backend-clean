let currentPageText = "";
let currentPageType = "";

const BACKEND_URL = "http://localhost:3000";
const ASK_URL = `${BACKEND_URL}/ask`;
const CHECK_PRO_URL = `${BACKEND_URL}/check-pro`;

const userLanguage = navigator.language || "en";

const DAILY_LIMIT = 5;
const PRO_LINK = "https://buy.stripe.com/4gMbJ38OycALbkD3ZD3ks02";

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
  if (userLanguage.startsWith("fr")) return "Answer in French.";
  if (userLanguage.startsWith("de")) return "Answer in German.";
  if (userLanguage.startsWith("tr")) return "Answer in Turkish.";
  if (userLanguage.startsWith("es")) return "Answer in Spanish.";
  if (userLanguage.startsWith("it")) return "Answer in Italian.";
  if (userLanguage.startsWith("pt")) return "Answer in Portuguese.";
  if (userLanguage.startsWith("nl")) return "Answer in Dutch.";
  if (userLanguage.startsWith("sv")) return "Answer in Swedish.";
  if (userLanguage.startsWith("no")) return "Answer in Norwegian.";
  return "Answer in English.";
}

document.addEventListener("DOMContentLoaded", async () => {
  const videoTitleElement = document.getElementById("videoTitle");
  const quickBtn = document.getElementById("quickBtn");
  const deepBtn = document.getElementById("deepBtn");
  const studyBtn = document.getElementById("studyBtn");
  const result = document.getElementById("result");
  const proStatus = document.getElementById("proStatus");

  const historyBtn = document.getElementById("historyBtn");
  const clearHistoryBtn = document.getElementById("clearHistoryBtn");

  const deviceId = getDeviceId();
  const languageInstruction = getLanguageInstruction();

  async function checkProStatus() {
    try {
      const response = await fetch(CHECK_PRO_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId })
      });

      const data = await response.json();
      if (data.pro) setProUser(true);
    } catch (error) {
      console.error("Pro check failed", error);
    }
  }

  function updateProStatus() {
    proStatus.textContent = isProUser()
      ? "Pro plan active"
      : `Free plan · ${getRemainingUsage()}/${DAILY_LIMIT}`;
  }

  await checkProStatus();
  updateProStatus();

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
              <strong>${item.mode.toUpperCase()}</strong><br>
              ${item.question.slice(0, 80)}...<br><br>
              ${item.answer.slice(0, 180).replace(/\n/g,"<br>")}...
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
    result.innerHTML = "Open YouTube, Google Search or Reddit and try again.";
    return;
  }

  chrome.scripting.executeScript(
    { target: { tabId: tab.id }, function: getPageInfo },
    (results) => {
      const pageInfo = results?.[0]?.result;

      if (!pageInfo) {
        currentPageText = "No page found";
        currentPageType = "unknown";
        videoTitleElement.textContent = "No page found";
        return;
      }

      currentPageText = pageInfo.text;
      currentPageType = pageInfo.type;

      videoTitleElement.textContent = isProUser()
        ? `${pageInfo.label} · Pro`
        : `${pageInfo.label} · Free ${getRemainingUsage()}`;
    }
  );

  quickBtn.onclick = () => generateAnswer("quick");
  deepBtn.onclick = () => generateAnswer("deep");
  studyBtn.onclick = () => generateAnswer("study");

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
          Study mode access
        </div>
        <button class="upgrade-btn" id="upgradeBtn">Upgrade to Pro</button>
      </div>
    `;

    document.getElementById("upgradeBtn").onclick = () => {
      const checkoutUrl = `${PRO_LINK}?client_reference_id=${deviceId}`;
      window.open(checkoutUrl, "_blank");
    };
  }

  async function generateAnswer(mode) {
    result.innerHTML = `<div class="loading">AI is working...</div>`;

    quickBtn.disabled = true;
    deepBtn.disabled = true;
    studyBtn.disabled = true;

    try {
      await checkProStatus();
      updateProStatus();

      if (hasReachedLimit()) {
        showProBox();
        return;
      }

      if (!currentPageText || currentPageText.includes("No content")) {
        result.innerHTML = "Open YouTube, Google Search or Reddit and try again.";
        return;
      }

      const improvedInput = `
You are reading content from a browser page.

Language rule:
${languageInstruction}

Page type:
${currentPageType}

Important:
- Do not say "I can't interpret".
- If the page content is short, explain the topic behind it.
- If it is a search query, answer the search question directly.
- If it is a school topic, explain it clearly.
- If it is Reddit, summarize the post and visible comments.
- Always give useful value.

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

      videoTitleElement.textContent = isProUser()
        ? `${currentPageText.slice(0, 60)}... · Pro`
        : `${currentPageText.slice(0, 60)}... · Free ${getRemainingUsage()}`;

      result.innerHTML = `
        <div class="answer-box">
          <div class="answer-label">${mode.toUpperCase()}</div>
          <div class="answer-title">${
            mode === "quick" ? "Quick Answer" : mode === "deep" ? "AI Overview" : "Study Help"
          }</div>
          <div class="answer-content">
            ${data.answer.replace(/\n/g, "<br>")}
          </div>
        </div>
      `;
    } catch (error) {
      console.error(error);
      result.innerHTML = "Could not connect to backend. Make sure your server is running.";
    }

    quickBtn.disabled = false;
    deepBtn.disabled = false;
    studyBtn.disabled = false;
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
      .slice(0, 6)
      .map(item => item.innerText)
      .join("\n");

    return {
      type: "google_search",
      label: `Google: ${query}`,
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
      label: `Reddit: ${title.slice(0, 60)}`,
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
  const bodyText = document.body?.innerText?.slice(0, 4000) || "";

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