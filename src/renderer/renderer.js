const state = {
  imageDataUrl: "",
  selectedFileName: "",
  selectedFileSize: 0,
  imageHash: "",
  history: [],
  reviewCards: [],
  favorites: [],
  stageMaterials: [],
  activeStage: "foundation",
  currentPage: "home",
  currentRawContent: "",
  currentTitle: "",
  bankStats: null,
  currentSource: null
};

const els = {
  apiKey: document.querySelector("#apiKeyInput"),
  baseUrl: document.querySelector("#baseUrlInput"),
  model: document.querySelector("#modelInput"),
  temperature: document.querySelector("#temperatureInput"),
  saveConfig: document.querySelector("#saveConfigButton"),
  clearHistory: document.querySelector("#clearHistoryButton"),
  dropZone: document.querySelector("#dropZone"),
  fileInput: document.querySelector("#fileInput"),
  emptyUpload: document.querySelector("#emptyUpload"),
  previewImage: document.querySelector("#previewImage"),
  extraQuestion: document.querySelector("#extraQuestionInput"),
  solve: document.querySelector("#solveButton"),
  answer: document.querySelector("#answerOutput"),
  status: document.querySelector("#statusText"),
  historyList: document.querySelector("#historyList"),
  paperPreview: document.querySelector("#paperPreview"),
  questionCounter: document.querySelector("#questionCounter"),
  navHome: document.querySelector('[data-page="home"]'),
  navDashboard: document.querySelector('[data-page="dashboard"]'),
  navReview: document.querySelector('[data-page="review"]'),
  navFavorites: document.querySelector('[data-page="favorites"]'),
  navSettings: document.querySelector('[data-page="settings"]'),
  // Page containers
  homePage: document.querySelector(".main"),
  dashboardPage: document.querySelector("#dashboardPage"),
  reviewPage: document.querySelector("#reviewPage"),
  favoritesPage: document.querySelector("#favoritesPage"),
  settingsPage: document.querySelector("#settingsPage"),
  // Review card elements
  reviewCardsList: document.querySelector("#reviewCardsList"),
  addReviewCardBtn: document.querySelector("#addReviewCardBtn"),
  clearReviewCardsBtn: document.querySelector("#clearReviewCardsBtn"),
  // Favorites elements
  favoritesList: document.querySelector("#favoritesList"),
  clearFavoritesBtn: document.querySelector("#clearFavoritesBtn"),
  // Settings elements
  exportDataBtn: document.querySelector("#exportDataBtn"),
  importDataBtn: document.querySelector("#importDataBtn"),
  importFileInput: document.querySelector("#importFileInput"),
  clearAllDataBtn: document.querySelector("#clearAllDataBtn"),
  themeSelect: document.querySelector("#themeSelect")
};

Object.assign(els, {
  bankQuestionCount: document.querySelector("#bankQuestionCount"),
  bankChunkCount: document.querySelector("#bankChunkCount"),
  dueReviewCount: document.querySelector("#dueReviewCount"),
  favoriteCount: document.querySelector("#favoriteCount"),
  reviewTotalCount: document.querySelector("#reviewTotalCount"),
  reviewDueCount: document.querySelector("#reviewDueCount"),
  reviewMasteryAvg: document.querySelector("#reviewMasteryAvg"),
  dashQuestionCount: document.querySelector("#dashQuestionCount"),
  dashDueCount: document.querySelector("#dashDueCount"),
  dashFavoriteCount: document.querySelector("#dashFavoriteCount"),
  dashMasteryAvg: document.querySelector("#dashMasteryAvg"),
  dashboardDueList: document.querySelector("#dashboardDueList"),
  dashboardKnowledgeList: document.querySelector("#dashboardKnowledgeList"),
  dashboardRecentList: document.querySelector("#dashboardRecentList"),
  dashboardRecommendList: document.querySelector("#dashboardRecommendList"),
  stageDescription: document.querySelector("#stageDescription"),
  stageMaterialCount: document.querySelector("#stageMaterialCount"),
  stageKnowledgeCount: document.querySelector("#stageKnowledgeCount"),
  stageQuestionCount: document.querySelector("#stageQuestionCount"),
  stageMaterialList: document.querySelector("#stageMaterialList")
});

function loadConfig() {
  const raw = localStorage.getItem("mathTutorConfig");
  if (!raw) {
    els.apiKey.value = "";
    els.baseUrl.value = "https://api.openai.com/v1";
    els.model.value = "gpt-4o-mini";
    els.temperature.value = "0.25";
    return;
  }

  try {
    const config = JSON.parse(raw);
    els.apiKey.value = config.apiKey || "";
    els.baseUrl.value = config.baseUrl || "https://api.openai.com/v1";
    els.model.value = config.model || "gpt-4o-mini";
    els.temperature.value = config.temperature || "0.25";
  } catch {
    localStorage.removeItem("mathTutorConfig");
    loadConfig();
  }
}

function saveConfig() {
  localStorage.setItem("mathTutorConfig", JSON.stringify({
    apiKey: els.apiKey.value,
    baseUrl: els.baseUrl.value,
    model: els.model.value,
    temperature: els.temperature.value
  }));
  setStatus("配置已保存");
}

function loadHistory() {
  try {
    state.history = JSON.parse(localStorage.getItem("mathTutorHistory") || "[]");
  } catch {
    state.history = [];
  }
  renderHistory();
}

function saveHistory() {
  localStorage.setItem("mathTutorHistory", JSON.stringify(state.history.slice(0, 8)));
  renderHistory();
  renderLearningStats();
}

function renderHistory() {
  els.historyList.innerHTML = "";
  if (!state.history.length) {
    const empty = document.createElement("p");
    empty.className = "placeholder";
    empty.textContent = "还没有解析记录。";
    els.historyList.appendChild(empty);
    return;
  }

  state.history.forEach((item) => {
    const button = document.createElement("button");
    button.className = "history-item";
    button.innerHTML = `<strong>${escapeHtml(item.title)}</strong><span>${new Date(item.createdAt).toLocaleString()}</span>`;
    button.addEventListener("click", () => {
      renderAnswer(item.content);
      state.currentRawContent = item.content;
      state.currentTitle = item.title || "数学题解析";
      state.currentSource = item.source || null;
      if (state.currentSource?.id) {
        loadSimilarQuestions({
          sourceId: state.currentSource.id,
          query: state.currentTitle,
          limit: 4
        }).catch(() => {});
      }
      setStatus("已载入历史解析");
    });
    els.historyList.appendChild(button);
  });
}

function setStatus(text, isError = false) {
  els.status.textContent = text;
  els.status.classList.toggle("error", isError);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function markdownLite(text) {
  const normalized = normalizeMathText(text);
  const blocks = normalized.split(/\n{2,}/);

  return blocks.map((block) => {
    const trimmed = block.trim();
    if (!trimmed) return "";

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = Math.min(3, Math.max(1, heading[1].length));
      return `<h${level}>${inlineMarkdown(heading[2])}</h${level}>`;
    }

    const lines = trimmed.split("\n");
    if (lines.every((line) => /^\s*[-*]\s+/.test(line))) {
      const items = lines
        .map((line) => `<li>${inlineMarkdown(line.replace(/^\s*[-*]\s+/, ""))}</li>`)
        .join("");
      return `<ul>${items}</ul>`;
    }

    if (lines.every((line) => /^\s*\d+[.、]\s+/.test(line))) {
      const items = lines
        .map((line) => `<li>${inlineMarkdown(line.replace(/^\s*\d+[.、]\s+/, ""))}</li>`)
        .join("");
      return `<ol>${items}</ol>`;
    }

    return `<p>${inlineMarkdown(trimmed).replace(/\n/g, "<br>")}</p>`;
  }).join("");
}

function normalizeMathText(text) {
  const normalized = String(text)
    .replace(/^\s*\[\s*$/gm, "\\[")
    .replace(/^\s*\]\s*$/gm, "\\]");
  return closeDanglingDisplayMath(normalized);
}

function closeDanglingDisplayMath(text) {
  const displayDelimiters = text.match(/\$\$/g) || [];
  if (displayDelimiters.length % 2 === 0) return text;
  return `${text}\n$$`;
}

function inlineMarkdown(text) {
  return escapeHtml(text)
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function renderAnswer(content) {
  els.answer.innerHTML = markdownLite(content);
  typesetMath(els.answer);
}

function typesetMath(element) {
  if (!window.MathJax?.typesetPromise) return;
  window.MathJax.typesetPromise([element]).catch((error) => {
    console.warn("MathJax render failed", error);
  });
}

function updateSolveState() {
  els.solve.disabled = !state.imageDataUrl && !els.extraQuestion.value.trim();
}

function formatBytes(bytes) {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("图片读取失败。"));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("图片加载失败，请换一张截图或照片。"));
      image.onload = () => {
        const maxSide = 1400;
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));

        const context = canvas.getContext("2d");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        resolve({
          dataUrl: canvas.toDataURL("image/jpeg", 0.82),
          width: canvas.width,
          height: canvas.height,
          imageHash: computeAverageHash(image)
        });
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function computeAverageHash(image) {
  const size = 8;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, size, size);
  context.drawImage(image, 0, 0, size, size);

  const pixels = context.getImageData(0, 0, size, size).data;
  const values = [];
  for (let index = 0; index < pixels.length; index += 4) {
    const gray = pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114;
    values.push(gray);
  }

  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  let bits = "";
  for (const value of values) {
    bits += value >= average ? "1" : "0";
  }

  let hex = "";
  for (let index = 0; index < bits.length; index += 4) {
    hex += parseInt(bits.slice(index, index + 4), 2).toString(16);
  }
  return hex;
}

function readFile(file) {
  if (!file || !file.type.startsWith("image/")) {
    setStatus("请选择图片文件", true);
    return;
  }

  setStatus("正在压缩图片...");
  compressImage(file)
    .then((image) => {
    state.imageDataUrl = image.dataUrl;
    state.selectedFileName = file.name;
    state.selectedFileSize = file.size;
    state.imageHash = image.imageHash;
    els.previewImage.src = state.imageDataUrl;
    els.previewImage.hidden = false;
    if (els.paperPreview) els.paperPreview.hidden = true;
    setStatus(`题目已载入 · ${image.width}×${image.height} · 原图 ${formatBytes(file.size)}`);
    updateSolveState();
    })
    .catch((error) => {
      setStatus(error.message || "图片处理失败", true);
    });
}

async function solveProblem() {
  saveConfig();
  const startedAt = Date.now();
  const timer = window.setInterval(() => {
    const seconds = Math.round((Date.now() - startedAt) / 1000);
    setStatus(`Agent 正在解析... ${seconds}s`);
  }, 1000);

  setStatus("Agent 正在解析... 0s");
  els.solve.disabled = true;
  els.answer.innerHTML = `<p class="placeholder">正在理解问题、检索本地题库并组织导学回答，请稍等。</p>`;

  try {
    const payload = {
      apiKey: els.apiKey.value,
      baseUrl: els.baseUrl.value,
      model: els.model.value,
      temperature: els.temperature.value,
      imageDataUrl: state.imageDataUrl,
      extraQuestion: els.extraQuestion.value,
      fileName: state.selectedFileName,
      imageHash: state.imageHash
    };

    setStatus("正在查询个人阶段资料...");
    const stageAnswer = getStageAnswer(payload.extraQuestion);
    let result = stageAnswer;

    if (!result) {
      setStatus("正在运行学习 Agent...");
      result = await solveWithAvailableRuntime(payload);
    }

    renderAnswer(result.content);
    if (result.stageMatches?.length) {
      renderStageSearchResults(result.stageMatches);
    }
    state.currentRawContent = result.content;
    state.currentTitle = getResultTitle(result, payload);
    state.currentSource = result.source || null;
    if (state.currentSource?.id) {
      loadSimilarQuestions({
        sourceId: state.currentSource.id,
        query: payload.extraQuestion || state.currentTitle,
        limit: 4
      }).catch(() => {});
    }
    const seconds = Math.round((Date.now() - startedAt) / 1000);
    setStatus(`解析完成 · ${seconds}s · ${result.model}`);

    state.history.unshift({
      title: state.currentTitle,
      content: result.content,
      source: result.source || null,
      createdAt: result.createdAt
    });
    saveHistory();
  } catch (error) {
    els.answer.innerHTML = `<p>${escapeHtml(formatErrorMessage(error))}</p>`;
    setStatus("解析失败", true);
  } finally {
    window.clearInterval(timer);
    updateSolveState();
  }
}

function getResultTitle(result, payload) {
  const metadata = result?.source?.metadata || {};
  const title = [
    metadata.year ? `${metadata.year}年` : "",
    metadata.subject || "",
    metadata.question_no ? `第${metadata.question_no}题` : "",
  ].filter(Boolean).join("");
  return title || payload.fileName || payload.extraQuestion?.slice(0, 24) || "数学题解析";
}

async function solveWithAvailableRuntime(payload) {
  if (window.mathTutor?.solve) {
    return window.mathTutor.solve(payload);
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 300000);

  let response;
  try {
    response = await fetch("/api/solve", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("请求超过 5 分钟仍未返回。这个模型可能太慢，建议换更小的视觉模型，或裁剪题目图片后重试。");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error || response.statusText || "本地服务请求失败");
  }

  return data;
}

function hasLearningQuestion(text) {
  const value = String(text || "")
    .replace(/(19|20)\d{2}/g, "")
    .replace(/第\s*[\d一二三四五六七八九十两〇零]{1,4}\s*(题|道|问|小题)/g, "")
    .replace(/[\d一二三四五六七八九十两〇零]{1,4}\s*(题|道|问|小题)/g, "")
    .trim();
  return value.length >= 2;
}

async function enhanceLocalAnswer(payload) {
  const response = await fetch("/api/enhance-local-answer", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      apiKey: payload.apiKey,
      baseUrl: payload.baseUrl,
      model: payload.model,
      temperature: payload.temperature,
      fileName: payload.fileName,
      imageHash: payload.imageHash,
      searchText: payload.extraQuestion,
      extraQuestion: payload.extraQuestion,
      questionNo: inferQuestionNo(payload.fileName)
    })
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error || response.statusText || "本地答案拓展失败");
  }
  return data;
}

async function getLocalAnswer(payload) {
  if (window.mathTutor?.solve) return null;

  const response = await fetch("/api/local-answer", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      fileName: payload.fileName,
      imageHash: payload.imageHash,
      searchText: payload.extraQuestion,
      questionNo: inferQuestionNo(payload.fileName)
    })
  });

  if (!response.ok) return null;
  return response.json();
}

async function loadSimilarQuestions({ sourceId = "", query = "", limit = 4 } = {}) {
  const response = await fetch("/api/similar-questions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      sourceId,
      query,
      limit
    })
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error || response.statusText || "同类题检索失败");
  }

  renderSimilarQuestions(data.results || [], query);
  return data.results || [];
}

function renderSimilarQuestions(items, query = "") {
  const old = els.answer.querySelector(".similar-panel");
  if (old) old.remove();

  const section = document.createElement("section");
  section.className = "similar-panel";
  const title = query ? `同类题推荐 · ${escapeHtml(query.slice(0, 24))}` : "同类题推荐";
  section.innerHTML = `<h4>${title}</h4>`;

  if (!items.length) {
    section.innerHTML += `<p class="placeholder">暂时没有找到合适的同类题。</p>`;
    els.answer.appendChild(section);
    return;
  }

  const list = document.createElement("div");
  list.className = "similar-list";
  for (const item of items) {
    const button = document.createElement("button");
    button.className = "similar-item";
    const reasons = (item.reasons || []).slice(0, 4).map(reason => `<span>${escapeHtml(reason)}</span>`).join("");
    button.innerHTML = `
      <strong>${escapeHtml(item.title || item.id)}</strong>
      <small>${escapeHtml(item.problemText || item.idea || "点击载入本地解析")}</small>
      <span class="similar-reasons">${reasons}</span>
    `;
    button.addEventListener("click", async () => {
      const metadata = item.metadata || {};
      const lookup = metadata.year && metadata.question_no
        ? `${metadata.year}年第${metadata.question_no}题`
        : item.title;
      els.extraQuestion.value = lookup;
      updateQuestionCounter();
      updateSolveState();
      setStatus("正在载入同类题解析...");
      try {
        const result = await getLocalAnswer({
          searchText: lookup,
          extraQuestion: lookup
        });
        if (!result) throw new Error("未找到同类题解析");
        renderAnswer(result.content);
        state.currentRawContent = result.content;
        state.currentTitle = getResultTitle(result, { extraQuestion: lookup });
        state.currentSource = result.source || null;
        if (state.currentSource?.id) {
          loadSimilarQuestions({
            sourceId: state.currentSource.id,
            query: state.currentTitle,
            limit: 4
          }).catch(() => {});
        }
        setStatus("已载入同类题解析");
      } catch (error) {
        setStatus(error.message || "同类题载入失败", true);
      }
    });
    list.appendChild(button);
  }

  section.appendChild(list);
  els.answer.appendChild(section);
}

function inferQuestionNo(fileName) {
  const matches = [...String(fileName || "").matchAll(/(?:^|[^\d])(\d{1,2})(?=$|[^\d])/g)];
  return matches.length ? Number(matches.at(-1)[1]) : null;
}

function formatErrorMessage(error) {
  const message = error?.message || String(error);
  if (message.includes("aborted") || error?.name === "AbortError") {
    return "请求被超时中断。这个模型响应太慢，建议换更小的视觉模型，或把图片裁剪到只剩题目区域后重试。";
  }
  return message;
}

els.dropZone.addEventListener("click", () => els.fileInput.click());
els.fileInput.addEventListener("change", (event) => readFile(event.target.files[0]));

["dragenter", "dragover"].forEach((eventName) => {
  els.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    els.dropZone.classList.add("dragging");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  els.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    els.dropZone.classList.remove("dragging");
  });
});

els.dropZone.addEventListener("drop", (event) => {
  readFile(event.dataTransfer.files[0]);
});

els.solve.addEventListener("click", solveProblem);
els.saveConfig.addEventListener("click", saveConfig);
els.clearHistory.addEventListener("click", () => {
  state.history = [];
  saveHistory();
  setStatus("历史已清空");
});

els.extraQuestion.addEventListener("input", updateQuestionCounter);
els.extraQuestion.addEventListener("input", updateSolveState);

document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    els.extraQuestion.value = chip.textContent.trim();
    updateQuestionCounter();
    updateSolveState();
    els.extraQuestion.focus();
  });
});

function updateQuestionCounter() {
  if (!els.questionCounter) return;
  els.questionCounter.textContent = `${els.extraQuestion.value.length}/500`;
}

function prepareFollowUp(title = state.currentTitle) {
  const focusTitle = title || state.currentTitle || "当前内容";
  els.extraQuestion.value = `围绕「${focusTitle}」继续讲一下最重要的考点和易错点`;
  updateQuestionCounter();
  updateSolveState();
  navigateTo("home");
  els.extraQuestion.focus();
  setStatus("已填入追问，点击开始解析即可继续");
}

// Navigation functions
function navigateTo(page) {
  state.currentPage = page;

  // Update navigation active state
  document.querySelectorAll(".nav-item").forEach(item => item.classList.remove("active"));

  // Hide all pages
  if (els.homePage) els.homePage.style.display = "none";
  if (els.dashboardPage) els.dashboardPage.style.display = "none";
  if (els.reviewPage) els.reviewPage.style.display = "none";
  if (els.favoritesPage) els.favoritesPage.style.display = "none";
  if (els.settingsPage) els.settingsPage.style.display = "none";

  // Show selected page and update nav
  switch (page) {
    case "home":
      if (els.homePage) els.homePage.style.display = "block";
      if (els.navHome) els.navHome.classList.add("active");
      break;
    case "dashboard":
      if (els.dashboardPage) els.dashboardPage.style.display = "block";
      if (els.navDashboard) els.navDashboard.classList.add("active");
      renderDashboard();
      break;
    case "review":
      if (els.reviewPage) els.reviewPage.style.display = "block";
      if (els.navReview) els.navReview.classList.add("active");
      renderReviewCards();
      break;
    case "favorites":
      if (els.favoritesPage) els.favoritesPage.style.display = "block";
      if (els.navFavorites) els.navFavorites.classList.add("active");
      renderFavorites();
      break;
    case "settings":
      if (els.settingsPage) els.settingsPage.style.display = "block";
      if (els.navSettings) els.navSettings.classList.add("active");
      break;
  }
}

// Review Cards functions
function loadReviewCards() {
  try {
    state.reviewCards = JSON.parse(localStorage.getItem("mathTutorReviewCards") || "[]");
  } catch {
    state.reviewCards = [];
  }
}

function saveReviewCards() {
  localStorage.setItem("mathTutorReviewCards", JSON.stringify(state.reviewCards));
  renderReviewCards();
  renderLearningStats();
}

function addReviewCard(title, content) {
  const now = new Date();
  const card = {
    id: Date.now(),
    title: title || "复习卡片",
    content: content,
    mastery: 0,
    reviewCount: 0,
    lastReviewedAt: null,
    nextReviewAt: now.toISOString(),
    createdAt: new Date().toISOString()
  };
  state.reviewCards.unshift(card);
  saveReviewCards();
  setStatus("已添加到复习卡");
}

function removeReviewCard(id) {
  state.reviewCards = state.reviewCards.filter(card => card.id !== id);
  saveReviewCards();
}

function normalizeReviewCard(card) {
  if (typeof card.mastery !== "number") card.mastery = 0;
  if (typeof card.reviewCount !== "number") card.reviewCount = 0;
  if (!card.nextReviewAt) card.nextReviewAt = card.createdAt || new Date().toISOString();
  return card;
}

function isDue(card) {
  return new Date(normalizeReviewCard(card).nextReviewAt).getTime() <= Date.now();
}

function reviewCard(id, remembered) {
  const card = state.reviewCards.find(item => item.id === id);
  if (!card) return;
  normalizeReviewCard(card);
  card.reviewCount += 1;
  card.lastReviewedAt = new Date().toISOString();
  card.mastery = remembered ? Math.min(5, card.mastery + 1) : Math.max(0, card.mastery - 1);
  const intervals = [1, 2, 4, 7, 14, 30];
  const days = remembered ? intervals[card.mastery] || 30 : 1;
  const next = new Date();
  next.setDate(next.getDate() + days);
  card.nextReviewAt = next.toISOString();
  saveReviewCards();
  setStatus(remembered ? `已安排 ${days} 天后复习` : "已安排明天复习");
}

function renderReviewSummary() {
  if (!els.reviewTotalCount) return;
  const total = state.reviewCards.length;
  const due = state.reviewCards.filter(isDue).length;
  const masteryAvg = total
    ? Math.round(state.reviewCards.reduce((sum, card) => sum + normalizeReviewCard(card).mastery, 0) / total / 5 * 100)
    : 0;
  els.reviewTotalCount.textContent = total;
  els.reviewDueCount.textContent = due;
  els.reviewMasteryAvg.textContent = `${masteryAvg}%`;
}

function getReviewStats() {
  const total = state.reviewCards.length;
  const due = state.reviewCards.filter(isDue).length;
  const masteryAvg = total
    ? Math.round(state.reviewCards.reduce((sum, card) => sum + normalizeReviewCard(card).mastery, 0) / total / 5 * 100)
    : 0;
  return { total, due, masteryAvg };
}

function renderReviewCards() {
  if (!els.reviewCardsList) return;

  els.reviewCardsList.innerHTML = "";

  if (!state.reviewCards.length) {
    const empty = document.createElement("p");
    empty.className = "placeholder";
    empty.textContent = "还没有复习卡片。解析题目后可以添加到复习卡。";
    els.reviewCardsList.appendChild(empty);
    return;
  }

  renderReviewSummary();

  state.reviewCards
    .map(normalizeReviewCard)
    .sort((left, right) => new Date(left.nextReviewAt) - new Date(right.nextReviewAt))
    .forEach(card => {
    const cardEl = document.createElement("div");
    cardEl.className = "review-card";
    const due = isDue(card);
    const nextText = due ? "今天复习" : `${new Date(card.nextReviewAt).toLocaleDateString()} 复习`;
    cardEl.innerHTML = `
      <div class="review-card-header">
        <h4>${escapeHtml(card.title)}</h4>
        <div class="review-card-actions">
          <button class="icon-btn view-card" data-id="${card.id}" title="查看">👁</button>
          <button class="icon-btn delete-card" data-id="${card.id}" title="删除">🗑</button>
        </div>
      </div>
      <div class="review-meta">
        <span class="${due ? "due-badge" : "soft-badge"}">${nextText}</span>
        <span>掌握度 ${card.mastery}/5</span>
        <span>复习 ${card.reviewCount} 次</span>
      </div>
      <div class="review-card-controls">
        <button class="secondary small remember-card" data-id="${card.id}" type="button">记住了</button>
        <button class="ghost small forget-card" data-id="${card.id}" type="button">还不会</button>
      </div>
    `;
    els.reviewCardsList.appendChild(cardEl);
  });

  // Add event listeners
  els.reviewCardsList.querySelectorAll(".view-card").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = Number(btn.dataset.id);
      const card = state.reviewCards.find(c => c.id === id);
      if (card) {
        renderAnswer(card.content);
        state.currentRawContent = card.content;
        navigateTo("home");
        setStatus("已加载复习卡片内容");
      }
    });
  });

  els.reviewCardsList.querySelectorAll(".delete-card").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = Number(btn.dataset.id);
      removeReviewCard(id);
    });
  });

  els.reviewCardsList.querySelectorAll(".remember-card").forEach(btn => {
    btn.addEventListener("click", () => reviewCard(Number(btn.dataset.id), true));
  });

  els.reviewCardsList.querySelectorAll(".forget-card").forEach(btn => {
    btn.addEventListener("click", () => reviewCard(Number(btn.dataset.id), false));
  });
}

// Favorites functions
function loadFavorites() {
  try {
    state.favorites = JSON.parse(localStorage.getItem("mathTutorFavorites") || "[]");
  } catch {
    state.favorites = [];
  }
}

function saveFavorites() {
  localStorage.setItem("mathTutorFavorites", JSON.stringify(state.favorites));
  renderFavorites();
  renderLearningStats();
}

function addFavorite(title, content, imageHash) {
  const favorite = {
    id: Date.now(),
    title: title || "收藏题目",
    content: content,
    imageHash: imageHash,
    createdAt: new Date().toISOString()
  };
  state.favorites.unshift(favorite);
  saveFavorites();
  setStatus("已添加到收藏夹");
}

function removeFavorite(id) {
  state.favorites = state.favorites.filter(fav => fav.id !== id);
  saveFavorites();
}

function renderFavorites() {
  if (!els.favoritesList) return;

  els.favoritesList.innerHTML = "";

  if (!state.favorites.length) {
    const empty = document.createElement("p");
    empty.className = "placeholder";
    empty.textContent = "还没有收藏题目。可以收藏解析结果以便复习。";
    els.favoritesList.appendChild(empty);
    return;
  }

  state.favorites.forEach(fav => {
    const favEl = document.createElement("div");
    favEl.className = "favorite-item";
    favEl.innerHTML = `
      <div class="favorite-header">
        <h4>${escapeHtml(fav.title)}</h4>
        <div class="favorite-actions">
          <button class="icon-btn view-fav" data-id="${fav.id}" title="查看">👁</button>
          <button class="icon-btn delete-fav" data-id="${fav.id}" title="删除">🗑</button>
        </div>
      </div>
      <p class="favorite-date">${new Date(fav.createdAt).toLocaleDateString()}</p>
    `;
    els.favoritesList.appendChild(favEl);
  });

  // Add event listeners
  els.favoritesList.querySelectorAll(".view-fav").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = Number(btn.dataset.id);
      const fav = state.favorites.find(f => f.id === id);
      if (fav) {
        renderAnswer(fav.content);
        state.currentRawContent = fav.content;
        state.currentTitle = fav.title || "收藏题目";
        navigateTo("home");
        setStatus("已加载收藏题目");
      }
    });
  });

  els.favoritesList.querySelectorAll(".delete-fav").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = Number(btn.dataset.id);
      removeFavorite(id);
    });
  });
}

const STAGE_META = {
  foundation: {
    label: "基础",
    description: "基础阶段用于沉淀概念、公式、定理、常见题型和入门题。"
  },
  intensive: {
    label: "强化",
    description: "强化阶段用于整理综合题、证明题、技巧题、易错题和同类题训练。"
  }
};

function loadStageMaterials() {
  try {
    state.stageMaterials = JSON.parse(localStorage.getItem("mathTutorStageMaterials") || "[]");
  } catch {
    state.stageMaterials = [];
  }
}

function saveStageMaterials() {
  localStorage.setItem("mathTutorStageMaterials", JSON.stringify(state.stageMaterials));
  renderDashboard();
}

function inferStageMaterialType(content, source) {
  if (source?.id) return "question";
  const text = String(content || "");
  if (/同类题|推荐题|练习/.test(text)) return "similar_question";
  if (/复习卡片|复习卡/.test(text)) return "review_card";
  return "knowledge";
}

function addStageMaterial(stage) {
  if (!state.currentRawContent) {
    setStatus("请先解析或载入一条内容", true);
    return;
  }

  const source = state.currentSource || {};
  const metadata = source.metadata || {};
  const now = new Date().toISOString();
  const material = {
    id: Date.now(),
    stage,
    type: inferStageMaterialType(state.currentRawContent, source),
    title: state.currentTitle || state.selectedFileName || `${STAGE_META[stage]?.label || "阶段"}资料`,
    content: state.currentRawContent,
    sourceQuestionId: source.id || metadata.id || null,
    knowledgePoints: source.knowledgePoints || extractKnowledgeFromText(state.currentRawContent),
    metadata,
    mastery: 0,
    createdAt: now,
    updatedAt: now
  };

  state.stageMaterials.unshift(material);
  saveStageMaterials();
  setStatus(`已加入${STAGE_META[stage]?.label || "阶段"}阶段`);
}

function removeStageMaterial(id) {
  state.stageMaterials = state.stageMaterials.filter(item => item.id !== id);
  saveStageMaterials();
  setStatus("阶段资料已删除");
}

function getStageMaterials(stage = state.activeStage) {
  return state.stageMaterials.filter(item => item.stage === stage);
}

function inferStageFromText(text) {
  const value = String(text || "");
  if (/强化\s*阶段|强化/.test(value)) return "intensive";
  if (/基础\s*阶段|基础/.test(value)) return "foundation";
  if (/综合|证明|技巧|易错|突破|训练/.test(value)) return "intensive";
  if (/打底|公式|定理|概念/.test(value)) return "foundation";
  return null;
}

function hasExplicitStageQuery(text) {
  return /(基础|强化)\s*(阶段|资料|复习|题|知识点)?/.test(String(text || ""));
}

function normalizeClientSearchText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[{}()[\]$`*_#>~^=+\-–—|/\\:：,，.。;；!?！？、\s]+/g, " ")
    .trim();
}

function buildStageSearchTokens(text) {
  const normalized = normalizeClientSearchText(text);
  const keywords = extractKnowledgeFromText(normalized);
  const splitTokens = normalized
    .split(/\s+/)
    .map(token => token.trim())
    .filter(token => token.length >= 2)
    .filter(token => !/^(基础|强化|阶段|资料|复习|讲一下|围绕)$/.test(token));
  return [...new Set([...keywords, ...splitTokens])];
}

function searchStageMaterials(query, limit = 6) {
  const tokens = buildStageSearchTokens(query);
  const explicitStage = inferStageFromText(query);
  const explicitOnly = hasExplicitStageQuery(query);
  if (!tokens.length && !explicitOnly) return [];

  return state.stageMaterials
    .filter(item => !explicitStage || item.stage === explicitStage)
    .map(item => {
      const haystack = normalizeClientSearchText([
        item.title,
        item.content,
        item.type,
        item.sourceQuestionId,
        ...(item.knowledgePoints || []),
      ].filter(Boolean).join("\n"));
      let score = explicitStage && item.stage === explicitStage ? 4 : 0;
      const reasons = [];
      for (const token of tokens) {
        if (haystack.includes(token)) {
          score += token.length >= 4 ? 4 : 2;
          reasons.push(token);
        }
      }
      for (const point of item.knowledgePoints || []) {
        if (normalizeClientSearchText(query).includes(normalizeClientSearchText(point))) {
          score += 5;
          reasons.push(point);
        }
      }
      return { item, score, reasons: [...new Set(reasons)].slice(0, 4) };
    })
    .filter(result => result.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return new Date(right.item.updatedAt || right.item.createdAt) - new Date(left.item.updatedAt || left.item.createdAt);
    })
    .slice(0, limit);
}

function getStageAnswer(query) {
  if (!hasExplicitStageQuery(query)) return null;
  const matches = searchStageMaterials(query, 6);
  if (!matches.length) return null;

  const stage = inferStageFromText(query) || state.activeStage;
  const stageLabel = STAGE_META[stage]?.label || "阶段";
  const lines = matches.map((match, index) => {
    const item = match.item;
    const reason = match.reasons.length ? `，匹配：${match.reasons.join("、")}` : "";
    return `${index + 1}. **${item.title}**（${formatStageMaterialType(item.type)}${reason}）`;
  });

  return {
    content: [
      `# ${stageLabel}阶段资料命中`,
      "",
      `你正在查找：**${query}**`,
      "",
      `我优先检索了你保存在${stageLabel}阶段的个人资料，找到 ${matches.length} 条相关内容：`,
      "",
      ...lines,
      "",
      "可以点击下方资料卡片直接载入内容，或选择“追问”继续让 Agent 讲解。"
    ].join("\n"),
    model: "local-stage-materials",
    createdAt: new Date().toISOString(),
    stageMatches: matches.map(match => match.item)
  };
}

function renderStageSearchResults(items) {
  const old = els.answer.querySelector(".stage-search-panel");
  if (old) old.remove();

  const section = document.createElement("section");
  section.className = "stage-search-panel";
  section.innerHTML = `<h4>个人阶段资料</h4>`;
  const list = document.createElement("div");
  list.className = "stage-search-list";

  for (const item of items) {
    const card = document.createElement("div");
    card.className = "stage-search-item";
    const points = (item.knowledgePoints || []).slice(0, 3).map(point => `<span>${escapeHtml(point)}</span>`).join("");
    card.innerHTML = `
      <div>
        <strong>${escapeHtml(item.title)}</strong>
        <small>${escapeHtml(STAGE_META[item.stage]?.label || "阶段")} · ${escapeHtml(formatStageMaterialType(item.type))}</small>
        <span class="stage-points">${points}</span>
      </div>
      <div class="stage-search-actions">
        <button class="ghost small view-stage-search" type="button">查看</button>
        <button class="secondary small ask-stage-search" type="button">追问</button>
      </div>
    `;
    card.querySelector(".view-stage-search").addEventListener("click", () => {
      renderAnswer(item.content);
      state.currentRawContent = item.content;
      state.currentTitle = item.title;
      state.currentSource = item.sourceQuestionId ? { id: item.sourceQuestionId, metadata: item.metadata, knowledgePoints: item.knowledgePoints } : null;
      setStatus(`已载入${STAGE_META[item.stage]?.label || "阶段"}资料`);
    });
    card.querySelector(".ask-stage-search").addEventListener("click", () => prepareFollowUp(item.title));
    list.appendChild(card);
  }

  section.appendChild(list);
  els.answer.appendChild(section);
}

function renderStageWorkbench() {
  if (!els.stageMaterialList) return;

  const meta = STAGE_META[state.activeStage] || STAGE_META.foundation;
  if (els.stageDescription) els.stageDescription.textContent = meta.description;
  document.querySelectorAll(".stage-tab").forEach(button => {
    button.classList.toggle("active", button.dataset.stage === state.activeStage);
  });

  const materials = getStageMaterials();
  const knowledgeCount = materials.filter(item => item.type === "knowledge" || item.type === "review_card").length;
  const questionCount = materials.filter(item => item.type === "question" || item.type === "similar_question").length;
  if (els.stageMaterialCount) els.stageMaterialCount.textContent = materials.length;
  if (els.stageKnowledgeCount) els.stageKnowledgeCount.textContent = knowledgeCount;
  if (els.stageQuestionCount) els.stageQuestionCount.textContent = questionCount;

  els.stageMaterialList.innerHTML = "";
  if (!materials.length) {
    const empty = document.createElement("p");
    empty.className = "placeholder";
    empty.textContent = state.activeStage === "foundation"
      ? "还没有基础阶段资料。可以把公式、定理解释或基础题解析加入这里。"
      : "还没有强化阶段资料。可以把综合题、证明题、易错题或同类题加入这里。";
    els.stageMaterialList.appendChild(empty);
    return;
  }

  materials.slice(0, 6).forEach(item => {
    const div = document.createElement("div");
    div.className = "stage-material-item";
    const points = (item.knowledgePoints || []).slice(0, 3)
      .map(point => `<span>${escapeHtml(point)}</span>`)
      .join("");
    div.innerHTML = `
      <div>
        <strong>${escapeHtml(item.title)}</strong>
        <small>${escapeHtml(formatStageMaterialType(item.type))} · ${new Date(item.updatedAt || item.createdAt).toLocaleDateString()}</small>
        <div class="stage-points">${points}</div>
      </div>
      <div class="stage-item-actions">
        <button class="ghost small view-stage-material" type="button" data-id="${item.id}">查看</button>
        <button class="ghost small ask-stage-material" type="button" data-id="${item.id}">追问</button>
        <button class="icon-btn delete-stage-material" type="button" data-id="${item.id}" title="删除">×</button>
      </div>
    `;
    els.stageMaterialList.appendChild(div);
  });

  els.stageMaterialList.querySelectorAll(".view-stage-material").forEach(button => {
    button.addEventListener("click", () => {
      const item = state.stageMaterials.find(material => material.id === Number(button.dataset.id));
      if (!item) return;
      renderAnswer(item.content);
      state.currentRawContent = item.content;
      state.currentTitle = item.title;
      state.currentSource = item.sourceQuestionId ? { id: item.sourceQuestionId, metadata: item.metadata, knowledgePoints: item.knowledgePoints } : null;
      navigateTo("home");
      setStatus(`已载入${STAGE_META[item.stage]?.label || "阶段"}资料`);
    });
  });

  els.stageMaterialList.querySelectorAll(".ask-stage-material").forEach(button => {
    button.addEventListener("click", () => {
      const item = state.stageMaterials.find(material => material.id === Number(button.dataset.id));
      if (!item) return;
      els.extraQuestion.value = `围绕「${item.title}」继续讲一下最重要的考点和易错点`;
      updateQuestionCounter();
      updateSolveState();
      navigateTo("home");
      els.extraQuestion.focus();
      setStatus("已填入阶段资料追问");
    });
  });

  els.stageMaterialList.querySelectorAll(".delete-stage-material").forEach(button => {
    button.addEventListener("click", () => removeStageMaterial(Number(button.dataset.id)));
  });
}

function formatStageMaterialType(type) {
  const map = {
    knowledge: "知识资料",
    question: "题目解析",
    review_card: "复习卡",
    similar_question: "同类题"
  };
  return map[type] || "阶段资料";
}

// Settings functions
function exportData() {
  const data = {
    config: JSON.parse(localStorage.getItem("mathTutorConfig") || "{}"),
    history: state.history,
    reviewCards: state.reviewCards,
    favorites: state.favorites,
    stageMaterials: state.stageMaterials,
    exportDate: new Date().toISOString()
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `math-tutor-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  setStatus("数据已导出");
}

function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function copyAnswer() {
  if (!state.currentRawContent) {
    setStatus("请先解析一道题目", true);
    return;
  }
  try {
    await navigator.clipboard.writeText(state.currentRawContent);
    setStatus("解析已复制");
  } catch {
    setStatus("复制失败，请手动选择文本", true);
  }
}

function exportAnswer() {
  if (!state.currentRawContent) {
    setStatus("请先解析一道题目", true);
    return;
  }
  const safeTitle = String(state.currentTitle || "数学题解析")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .slice(0, 60);
  downloadTextFile(`${safeTitle}.md`, state.currentRawContent + "\n");
  setStatus("解析已导出为 Markdown");
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);

      if (data.config) {
        localStorage.setItem("mathTutorConfig", JSON.stringify(data.config));
        loadConfig();
      }
      if (data.history) {
        state.history = data.history;
        saveHistory();
      }
      if (data.reviewCards) {
        state.reviewCards = data.reviewCards;
        saveReviewCards();
      }
      if (data.favorites) {
        state.favorites = data.favorites;
        saveFavorites();
      }
      if (data.stageMaterials) {
        state.stageMaterials = data.stageMaterials;
        saveStageMaterials();
      }

      setStatus("数据已导入成功");
    } catch (error) {
      setStatus("导入失败：文件格式不正确", true);
    }
  };
  reader.readAsText(file);
}

function clearAllData() {
  if (confirm("确定要清除所有数据吗？此操作不可恢复。")) {
    localStorage.removeItem("mathTutorConfig");
    localStorage.removeItem("mathTutorHistory");
    localStorage.removeItem("mathTutorReviewCards");
    localStorage.removeItem("mathTutorFavorites");
    localStorage.removeItem("mathTutorStageMaterials");
    localStorage.removeItem("mathTutorTheme");

    state.history = [];
    state.reviewCards = [];
    state.favorites = [];
    state.stageMaterials = [];

    loadConfig();
    loadTheme();
    renderHistory();
    renderReviewCards();
    renderFavorites();
    renderDashboard();

    setStatus("所有数据已清除");
  }
}

function loadTheme() {
  const theme = localStorage.getItem("mathTutorTheme") || "light";
  document.documentElement.setAttribute("data-theme", theme);
  if (els.themeSelect) els.themeSelect.value = theme;
}

function setTheme(theme) {
  localStorage.setItem("mathTutorTheme", theme);
  document.documentElement.setAttribute("data-theme", theme);
}

async function loadBankStats() {
  try {
    const response = await fetch("/api/bank-stats");
    if (!response.ok) return;
    const stats = await response.json();
    state.bankStats = stats;
    if (els.bankQuestionCount) els.bankQuestionCount.textContent = stats.totalQuestions ?? "--";
    if (els.bankChunkCount) els.bankChunkCount.textContent = stats.totalChunks ?? "--";
    renderDashboard();
  } catch {
    // 统计只用于展示，失败不影响主流程。
  }
}

function renderLearningStats() {
  if (els.dueReviewCount) els.dueReviewCount.textContent = state.reviewCards.filter(isDue).length;
  if (els.favoriteCount) els.favoriteCount.textContent = state.favorites.length;
  renderReviewSummary();
  renderDashboard();
}

function extractKnowledgeFromText(text) {
  const keywords = ["极限", "连续", "导数", "微分", "中值定理", "泰勒", "积分", "级数", "矩阵", "特征值", "概率", "分布", "期望", "方差"];
  return keywords.filter(keyword => String(text || "").includes(keyword));
}

function getFocusKnowledge() {
  const lowMasteryText = state.reviewCards
    .map(normalizeReviewCard)
    .filter(card => card.mastery <= 2)
    .map(card => `${card.title}\n${card.content.slice(0, 500)}`)
    .join("\n");
  const localWeak = extractKnowledgeFromText(lowMasteryText).map(name => ({ name, count: 1, source: "复习卡" }));
  const top = (state.bankStats?.topKnowledge || []).slice(0, 8).map(item => ({ ...item, source: "题库高频" }));
  const merged = new Map();
  for (const item of [...localWeak, ...top]) {
    const current = merged.get(item.name) || { name: item.name, count: 0, source: item.source };
    current.count += item.count || 1;
    if (item.source === "复习卡") current.source = "复习卡";
    merged.set(item.name, current);
  }
  return [...merged.values()].slice(0, 10);
}

function setDashboardQuery(query) {
  els.extraQuestion.value = query;
  updateQuestionCounter();
  updateSolveState();
  navigateTo("home");
  els.extraQuestion.focus();
  setStatus("已填入推荐提问");
}

function renderCompactItems(container, items, emptyText) {
  if (!container) return;
  container.innerHTML = "";
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "placeholder";
    empty.textContent = emptyText;
    container.appendChild(empty);
    return;
  }
  for (const item of items) {
    const div = document.createElement("div");
    div.className = "compact-item";
    div.innerHTML = `<strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.meta || "")}</span>`;
    if (item.onClick) div.addEventListener("click", item.onClick);
    container.appendChild(div);
  }
}

function renderDashboard() {
  if (!els.dashboardPage) return;
  const reviewStats = getReviewStats();
  if (els.dashQuestionCount) els.dashQuestionCount.textContent = state.bankStats?.totalQuestions ?? "--";
  if (els.dashDueCount) els.dashDueCount.textContent = reviewStats.due;
  if (els.dashFavoriteCount) els.dashFavoriteCount.textContent = state.favorites.length;
  if (els.dashMasteryAvg) els.dashMasteryAvg.textContent = `${reviewStats.masteryAvg}%`;
  renderStageWorkbench();

  const dueCards = state.reviewCards
    .map(normalizeReviewCard)
    .filter(isDue)
    .slice(0, 5)
    .map(card => ({
      title: card.title,
      meta: `掌握度 ${card.mastery}/5 · 复习 ${card.reviewCount} 次`,
      onClick: () => {
        renderAnswer(card.content);
        state.currentRawContent = card.content;
        state.currentTitle = card.title;
        navigateTo("home");
      }
    }));
  renderCompactItems(els.dashboardDueList, dueCards, "今天没有到期复习卡，可以从最近解析里添加。");

  const recentItems = state.history.slice(0, 5).map(item => ({
    title: item.title || "数学题解析",
    meta: new Date(item.createdAt).toLocaleString(),
    onClick: () => {
      renderAnswer(item.content);
      state.currentRawContent = item.content;
      state.currentTitle = item.title || "数学题解析";
      navigateTo("home");
    }
  }));
  renderCompactItems(els.dashboardRecentList, recentItems, "还没有学习记录，先用题号或图片解析一道题。");

  if (els.dashboardKnowledgeList) {
    const stageKnowledge = getStageMaterials()
      .flatMap(item => item.knowledgePoints || [])
      .filter(Boolean)
      .map(name => ({ name, count: 1, source: STAGE_META[state.activeStage]?.label || "阶段" }));
    const knowledge = [...stageKnowledge, ...getFocusKnowledge()].slice(0, 10);
    els.dashboardKnowledgeList.innerHTML = knowledge.length
      ? knowledge.map(item => `<button class="tag-pill" type="button" data-query="讲一下${escapeHtml(item.name)}在考研数学真题中的常见考法">${escapeHtml(item.name)}<small>${escapeHtml(item.source)}</small></button>`).join("")
      : `<p class="placeholder">题库统计载入后会显示高频知识点。</p>`;
    els.dashboardKnowledgeList.querySelectorAll(".tag-pill").forEach(button => {
      button.addEventListener("click", () => setDashboardQuery(button.dataset.query));
    });
  }

  if (els.dashboardRecommendList) {
    const firstKnowledge = getFocusKnowledge()[0]?.name || "泰勒公式";
    const stageLabel = STAGE_META[state.activeStage]?.label || "基础";
    const recommendations = [
      `讲一下${firstKnowledge}在历年真题里的常见考法`,
      `${stageLabel}阶段 ${firstKnowledge}`,
      "给我推荐一道今天适合复习的同类题",
      "根据我的复习卡总结薄弱点",
      "生成一份本周考研数学复习计划"
    ];
    els.dashboardRecommendList.innerHTML = recommendations
      .map(query => `<button class="recommend-item" type="button" data-query="${escapeHtml(query)}">${escapeHtml(query)}</button>`)
      .join("");
    els.dashboardRecommendList.querySelectorAll(".recommend-item").forEach(button => {
      button.addEventListener("click", () => setDashboardQuery(button.dataset.query));
    });
  }
}

// Add action buttons to answer section
function addAnswerActions() {
  const toolsEl = document.querySelector(".tools");
  if (!toolsEl || document.querySelector("#answerActions")) return;

  const actionsDiv = document.createElement("div");
  actionsDiv.id = "answerActions";
  actionsDiv.className = "answer-actions";
  actionsDiv.innerHTML = `
    <button id="copyAnswerBtn" class="icon-btn" title="复制解析">⧉</button>
    <button id="exportAnswerBtn" class="icon-btn" title="导出 Markdown">⇩</button>
    <button id="similarQuestionsBtn" class="icon-btn" title="推荐同类题">≋</button>
    <button id="followUpBtn" class="icon-btn text-icon" title="追问当前内容">追</button>
    <button id="addToFoundationBtn" class="icon-btn text-icon" title="加入基础阶段">基</button>
    <button id="addToIntensiveBtn" class="icon-btn text-icon" title="加入强化阶段">强</button>
    <button id="addToReviewBtn" class="icon-btn" title="添加到复习卡">📝</button>
    <button id="addToFavoritesBtn" class="icon-btn" title="添加到收藏夹">⭐</button>
  `;
  toolsEl.appendChild(actionsDiv);

  document.querySelector("#copyAnswerBtn").addEventListener("click", copyAnswer);
  document.querySelector("#exportAnswerBtn").addEventListener("click", exportAnswer);
  document.querySelector("#similarQuestionsBtn").addEventListener("click", async () => {
    const query = els.extraQuestion.value.trim() || state.currentTitle || state.currentRawContent.slice(0, 240);
    if (!query && !state.currentSource?.id) {
      setStatus("请先输入知识点或解析一道题", true);
      return;
    }
    setStatus("正在检索同类题...");
    try {
      await loadSimilarQuestions({
        sourceId: state.currentSource?.id || "",
        query,
        limit: 6
      });
      setStatus("已生成同类题推荐");
    } catch (error) {
      setStatus(error.message || "同类题检索失败", true);
    }
  });
  document.querySelector("#followUpBtn").addEventListener("click", () => prepareFollowUp());
  document.querySelector("#addToFoundationBtn").addEventListener("click", () => addStageMaterial("foundation"));
  document.querySelector("#addToIntensiveBtn").addEventListener("click", () => addStageMaterial("intensive"));

  document.querySelector("#addToReviewBtn").addEventListener("click", () => {
    if (state.currentRawContent) {
      addReviewCard(state.currentTitle || state.selectedFileName || "数学题解析", state.currentRawContent);
    } else {
      setStatus("请先解析一道题目", true);
    }
  });

  document.querySelector("#addToFavoritesBtn").addEventListener("click", () => {
    if (state.currentRawContent) {
      addFavorite(state.currentTitle || state.selectedFileName || "收藏题目", state.currentRawContent, state.imageHash);
    } else {
      setStatus("请先解析一道题目", true);
    }
  });
}

// Initialize navigation
function initNavigation() {
  // Navigation items
  document.querySelectorAll(".nav-item").forEach(item => {
    item.addEventListener("click", () => {
      const page = item.dataset.page;
      if (page) navigateTo(page);
    });
  });

  // Review card buttons
  if (els.addReviewCardBtn) {
    els.addReviewCardBtn.addEventListener("click", () => {
      if (state.currentRawContent) {
        addReviewCard(state.currentTitle || state.selectedFileName || "数学题解析", state.currentRawContent);
      } else {
        setStatus("请先解析一道题目", true);
      }
    });
  }
  if (els.clearReviewCardsBtn) {
    els.clearReviewCardsBtn.addEventListener("click", () => {
      if (confirm("确定要清空所有复习卡片吗？")) {
        state.reviewCards = [];
        saveReviewCards();
      }
    });
  }

  // Favorites buttons
  if (els.clearFavoritesBtn) {
    els.clearFavoritesBtn.addEventListener("click", () => {
      if (confirm("确定要清空所有收藏吗？")) {
        state.favorites = [];
        saveFavorites();
      }
    });
  }

  // Settings buttons
  if (els.exportDataBtn) els.exportDataBtn.addEventListener("click", exportData);
  if (els.importDataBtn) els.importDataBtn.addEventListener("click", () => els.importFileInput?.click());
  if (els.importFileInput) {
    els.importFileInput.addEventListener("change", (e) => {
      if (e.target.files[0]) importData(e.target.files[0]);
    });
  }
  if (els.clearAllDataBtn) els.clearAllDataBtn.addEventListener("click", clearAllData);
  if (els.themeSelect) {
    els.themeSelect.addEventListener("change", (e) => setTheme(e.target.value));
  }

  document.querySelectorAll(".stage-tab").forEach(button => {
    button.addEventListener("click", () => {
      state.activeStage = button.dataset.stage || "foundation";
      renderDashboard();
      setStatus(`已切换到${STAGE_META[state.activeStage]?.label || "阶段"}阶段`);
    });
  });

  document.querySelectorAll("[data-dashboard-action]").forEach(button => {
    button.addEventListener("click", () => {
      const action = button.dataset.dashboardAction;
      if (action === "review") navigateTo("review");
      if (action === "practice") {
        const focus = getFocusKnowledge()[0]?.name || "薄弱知识点";
        setDashboardQuery(`围绕${focus}给我推荐一道同类题，并说明对应考点`);
      }
      if (action === "history") navigateTo("home");
      if (action === "refresh") {
        renderDashboard();
        setStatus("学习中枢已刷新");
      }
    });
  });
}

loadConfig();
loadHistory();
loadReviewCards();
loadFavorites();
loadStageMaterials();
loadTheme();
updateQuestionCounter();
updateSolveState();
initNavigation();
addAnswerActions();
loadBankStats();
renderLearningStats();
navigateTo("home");
