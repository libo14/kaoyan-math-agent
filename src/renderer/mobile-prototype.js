const setupScreen = document.querySelector("#setupScreen");
const loadingScreen = document.querySelector("#loadingScreen");
const appScreen = document.querySelector("#appScreen");
const setupForm = document.querySelector("#setupForm");
const setupApiKey = document.querySelector("#setupApiKey");
const setupBaseUrl = document.querySelector("#setupBaseUrl");
const setupModel = document.querySelector("#setupModel");
const setupSubmit = document.querySelector("#setupSubmit");
const toggleKeyButton = document.querySelector("#toggleKeyButton");
const imageInput = document.querySelector("#imageInput");
const uploadArea = document.querySelector("#uploadArea");
const imagePreview = document.querySelector("#imagePreview");
const uploadEmpty = document.querySelector("#uploadEmpty");
const sampleProblem = document.querySelector("#sampleProblem");
const recognitionPanel = document.querySelector("#recognitionPanel");
const recognitionStatus = document.querySelector("#recognitionStatus");
const recognizedQuestionInput = document.querySelector("#recognizedQuestionInput");
const recognizedQuestionRendered = document.querySelector("#recognizedQuestionRendered");
const toggleRecognitionEditButton = document.querySelector("#toggleRecognitionEdit");
const questionInput = document.querySelector("#questionInput");
const counter = document.querySelector("#counter");
const sendButton = document.querySelector("#sendButton");
const cameraButton = document.querySelector("#cameraButton");
const answerContent = document.querySelector("#answerContent");
const statusPill = document.querySelector("#statusPill");
const resetConfigButton = document.querySelector("#resetConfigButton");
const saveFoundationButton = document.querySelector("#saveFoundationButton");
const saveIntensiveButton = document.querySelector("#saveIntensiveButton");
const saveReviewButton = document.querySelector("#saveReviewButton");
const saveFavoriteButton = document.querySelector("#saveFavoriteButton");
const foundationCount = document.querySelector("#foundationCount");
const intensiveCount = document.querySelector("#intensiveCount");
const dueReviewCountMobile = document.querySelector("#dueReviewCountMobile");
const hubList = document.querySelector("#hubList");
const favoritesList = document.querySelector("#prototypeFavorites");
const settingsApiKey = document.querySelector("#settingsApiKey");
const settingsProvider = document.querySelector("#settingsProvider");
const settingsBaseUrl = document.querySelector("#settingsBaseUrl");
const settingsModelPreset = document.querySelector("#settingsModelPreset");
const settingsModel = document.querySelector("#settingsModel");
const refreshModelsButton = document.querySelector("#refreshModelsButton");
const saveSettingsButton = document.querySelector("#saveSettingsButton");
const exportDataButton = document.querySelector("#exportDataButton");
const importDataButton = document.querySelector("#importDataButton");
const importDataInput = document.querySelector("#importDataInput");

const CONFIG_KEY = "mathTutorConfig";
const LEGACY_PROTOTYPE_CONFIG_KEY = "mathTutorMobilePrototypeConfig";
const MAIN_CONFIG_KEY = "mathTutorConfig";
const HISTORY_KEY = "mathTutorHistory";
const FAVORITES_KEY = "mathTutorFavorites";
const REVIEW_CARDS_KEY = "mathTutorReviewCards";
const STAGE_MATERIALS_KEY = "mathTutorStageMaterials";
const PROVIDER_PRESETS = {
  deepseek: {
    baseUrl: "https://api.deepseek.com/v1",
    models: [
      { label: "DeepSeek Chat（通用，推荐）", value: "deepseek-chat" },
      { label: "DeepSeek Reasoner（推理更强）", value: "deepseek-reasoner" }
    ]
  },
  siliconflow: {
    baseUrl: "https://api.siliconflow.cn/v1",
    models: [
      { label: "Qwen2.5-VL-32B（图片识别）", value: "Qwen/Qwen2.5-VL-32B-Instruct" },
      { label: "Qwen2.5-72B（文字解析）", value: "Qwen/Qwen2.5-72B-Instruct" },
      { label: "DeepSeek-V3（硅基流动）", value: "deepseek-ai/DeepSeek-V3" },
      { label: "DeepSeek-R1（推理，硅基流动）", value: "deepseek-ai/DeepSeek-R1" }
    ]
  },
  xiaomi: {
    baseUrl: "https://api.xiaomimimo.com/v1",
    models: [
      { label: "MiMo V2.5（图片/全模态）", value: "mimo-v2.5" },
      { label: "MiMo V2 Omni（若账号开放）", value: "mimo-v2-omni" },
      { label: "MiMo V2.5 Pro（文字/推理，不推荐识图）", value: "mimo-v2.5-pro" },
      { label: "MiMo V2 Flash（文字快速）", value: "mimo-v2-flash" },
      { label: "MiMo V2 Pro（文字/推理）", value: "mimo-v2-pro" }
    ]
  },
  custom: {
    baseUrl: "",
    models: [
      { label: "手动填写模型名称", value: "" }
    ]
  }
};

let imageDataUrl = "";
let selectedFileName = "";
let recognizedQuestionText = "";
let currentRawContent = "";
let currentTitle = "";
let currentSource = null;
let activeHubPanel = "foundation";
let favorites = [];
let reviewCards = [];
let stageMaterials = [];
let history = [];
let activeSavedContext = null;
let recognitionEditMode = false;

function getConfig() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG_KEY) || localStorage.getItem(LEGACY_PROTOTYPE_CONFIG_KEY) || "null");
  } catch {
    return null;
  }
}

function setConfig(config) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  localStorage.setItem(LEGACY_PROTOTYPE_CONFIG_KEY, JSON.stringify(config));
  localStorage.setItem(MAIN_CONFIG_KEY, JSON.stringify({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model: config.model,
    temperature: "0.25"
  }));
}

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function inferProvider(baseUrl = "", model = "") {
  const value = `${baseUrl} ${model}`.toLowerCase();
  if (value.includes("xiaomimimo") || value.includes("mimo")) return "xiaomi";
  if (value.includes("siliconflow") || value.includes("qwen/") || value.includes("deepseek-ai/")) return "siliconflow";
  if (value.includes("deepseek.com") || value.includes("deepseek-chat") || value.includes("deepseek-reasoner")) return "deepseek";
  return "custom";
}

function renderModelPresetOptions(provider, currentModel = "") {
  if (!settingsModelPreset) return;
  const preset = PROVIDER_PRESETS[provider] || PROVIDER_PRESETS.custom;
  const hasCurrent = preset.models.some((item) => item.value === currentModel);
  const options = [...preset.models];
  if (currentModel && !hasCurrent) {
    options.unshift({ label: `当前模型：${currentModel}`, value: currentModel });
  }
  settingsModelPreset.innerHTML = options
    .map((item) => `<option value="${escapeHtml(item.value)}">${escapeHtml(item.label)}</option>`)
    .join("");
  settingsModelPreset.value = hasCurrent || currentModel ? currentModel : options[0]?.value || "";
}

function renderFetchedModelOptions(models, currentModel = "") {
  if (!settingsModelPreset) return;
  const uniqueModels = [...new Set(models || [])].filter(Boolean);
  const hasCurrent = uniqueModels.includes(currentModel);
  const options = hasCurrent || !currentModel ? uniqueModels : [currentModel, ...uniqueModels];
  settingsModelPreset.innerHTML = options
    .map((modelName) => `<option value="${escapeHtml(modelName)}">${escapeHtml(modelName)}</option>`)
    .join("");
  const nextModel = hasCurrent ? currentModel : options[0] || "";
  settingsModelPreset.value = nextModel;
  if (nextModel) settingsModel.value = nextModel;
}

function applyProviderPreset(provider, keepModel = false) {
  const preset = PROVIDER_PRESETS[provider] || PROVIDER_PRESETS.custom;
  if (provider !== "custom" && preset.baseUrl) {
    settingsBaseUrl.value = preset.baseUrl;
  }
  const currentModel = keepModel ? settingsModel.value.trim() : "";
  const nextModel = currentModel || preset.models[0]?.value || "";
  renderModelPresetOptions(provider, nextModel);
  if (nextModel) settingsModel.value = nextModel;
}

function show(element) {
  element.hidden = false;
  element.classList.remove("fade-out");
  element.classList.add("fade-in");
}

function hide(element) {
  element.hidden = true;
  element.classList.remove("fade-in", "fade-out");
}

function transitionToApp() {
  hide(setupScreen);
  show(loadingScreen);
  setTimeout(() => {
    hide(loadingScreen);
    show(appScreen);
    typeset(appScreen);
  }, 850);
}

function initConfig() {
  const config = getConfig();
  if (!config) {
    setupBaseUrl.value = "https://api.deepseek.com/v1";
    setupModel.value = "deepseek-chat";
    show(setupScreen);
    return;
  }
  setupApiKey.value = config.apiKey || "";
  setupBaseUrl.value = config.baseUrl || "https://api.deepseek.com/v1";
  setupModel.value = config.model || "deepseek-chat";
  syncSettingsFields();
  hide(setupScreen);
  hide(loadingScreen);
  show(appScreen);
}

function typeset(element) {
  if (!window.MathJax?.typesetPromise) return;
  window.MathJax.typesetPromise([element]).catch((error) => console.warn("MathJax render failed", error));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function inlineMarkdown(text) {
  return escapeHtml(text)
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function markdownLite(text) {
  const normalized = String(text || "")
    .replace(/^\s*\[\s*$/gm, "\\[")
    .replace(/^\s*\]\s*$/gm, "\\]");
  return normalized.split(/\n{2,}/).map((block) => {
    const trimmed = block.trim();
    if (!trimmed) return "";
    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) return `<h3>${inlineMarkdown(heading[2])}</h3>`;
    const lines = trimmed.split("\n");
    if (lines.every((line) => /^\s*[-*]\s+/.test(line))) {
      return `<ul>${lines.map((line) => `<li>${inlineMarkdown(line.replace(/^\s*[-*]\s+/, ""))}</li>`).join("")}</ul>`;
    }
    if (lines.every((line) => /^\s*\d+[.、]\s+/.test(line))) {
      return `<ol>${lines.map((line) => `<li>${inlineMarkdown(line.replace(/^\s*\d+[.、]\s+/, ""))}</li>`).join("")}</ol>`;
    }
    return `<p>${inlineMarkdown(trimmed).replace(/\n/g, "<br>")}</p>`;
  }).join("");
}

function updateCounter() {
  counter.textContent = `${questionInput.value.length} / 500`;
}

function setStatus(text, isError = false) {
  statusPill.textContent = text;
  statusPill.style.color = isError ? "#7e3d33" : "";
}

function setRecognitionStatus(text, isError = false) {
  if (!recognitionStatus) return;
  recognitionStatus.textContent = text;
  recognitionStatus.style.color = isError ? "#7e3d33" : "";
}

function renderRecognizedQuestion() {
  if (!recognizedQuestionRendered) return;
  const text = recognizedQuestionInput?.value || "";
  recognizedQuestionRendered.innerHTML = text.trim()
    ? markdownLite(text)
    : `<p class="empty-state">识别完成后会在这里渲染公式。</p>`;
  typeset(recognizedQuestionRendered);
}

function setRecognitionEditMode(isEditing) {
  recognitionEditMode = Boolean(isEditing);
  if (recognizedQuestionInput) recognizedQuestionInput.hidden = !recognitionEditMode;
  if (recognizedQuestionRendered) recognizedQuestionRendered.hidden = recognitionEditMode;
  if (toggleRecognitionEditButton) {
    toggleRecognitionEditButton.textContent = recognitionEditMode ? "预览" : "编辑";
  }
  if (!recognitionEditMode) {
    renderRecognizedQuestion();
  } else {
    recognizedQuestionInput?.focus();
  }
}

function loadLocalData() {
  favorites = readJson(FAVORITES_KEY, []);
  reviewCards = readJson(REVIEW_CARDS_KEY, []);
  stageMaterials = readJson(STAGE_MATERIALS_KEY, []);
  history = readJson(HISTORY_KEY, []);
  renderHub();
  renderFavorites();
}

function syncSettingsFields() {
  const config = getConfig() || {};
  if (settingsApiKey) settingsApiKey.value = config.apiKey || "";
  const baseUrl = config.baseUrl || "https://api.deepseek.com/v1";
  const model = config.model || "deepseek-chat";
  const provider = inferProvider(baseUrl, model);
  if (settingsProvider) settingsProvider.value = provider;
  if (settingsBaseUrl) settingsBaseUrl.value = baseUrl;
  if (settingsModel) settingsModel.value = model;
  renderModelPresetOptions(provider, model);
}

function saveSettingsFromPanel() {
  const apiKey = settingsApiKey.value.trim();
  const baseUrl = settingsBaseUrl.value.trim();
  const model = settingsModel.value.trim();
  if (!apiKey || !baseUrl || !model) {
    setStatus("请补全 API 配置", true);
    return;
  }
  setConfig({ apiKey, baseUrl, model });
  setStatus("配置已保存");
}

async function refreshAvailableModels() {
  const apiKey = settingsApiKey.value.trim();
  const baseUrl = settingsBaseUrl.value.trim();
  if (!apiKey || !baseUrl) {
    setStatus("请先填写 API Key 和 API 地址", true);
    return;
  }

  refreshModelsButton.disabled = true;
  refreshModelsButton.textContent = "正在刷新...";
  try {
    const response = await fetch("/api/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey, baseUrl })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "获取模型列表失败");
    renderFetchedModelOptions(result.models, settingsModel.value.trim());
    setStatus(`已获取 ${result.count} 个真实可用模型`);
  } catch (error) {
    setStatus(error.message || "获取模型列表失败", true);
  } finally {
    refreshModelsButton.disabled = false;
    refreshModelsButton.textContent = "刷新真实可用模型";
  }
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

function inferKnowledge(content) {
  const keywords = ["极限", "连续", "导数", "微分", "中值定理", "泰勒", "积分", "级数", "矩阵", "特征值", "概率", "期望", "方差"];
  return keywords.filter((keyword) => String(content || "").includes(keyword));
}

function saveStageMaterial(stage) {
  if (!currentRawContent) {
    setStatus("请先解析一道题", true);
    return;
  }
  const now = new Date().toISOString();
  stageMaterials.unshift({
    id: Date.now(),
    stage,
    type: currentSource?.id ? "question" : "knowledge",
    title: currentTitle || "数学题解析",
    content: currentRawContent,
    sourceQuestionId: currentSource?.id || null,
    knowledgePoints: currentSource?.knowledgePoints || inferKnowledge(currentRawContent),
    metadata: currentSource?.metadata || {},
    mastery: 0,
    createdAt: now,
    updatedAt: now
  });
  writeJson(STAGE_MATERIALS_KEY, stageMaterials);
  renderHub();
  setStatus(stage === "foundation" ? "已加入基础" : "已加入强化");
}

function saveReviewCard() {
  if (!currentRawContent) {
    setStatus("请先解析一道题", true);
    return;
  }
  const now = new Date().toISOString();
  reviewCards.unshift({
    id: Date.now(),
    title: currentTitle || "复习卡片",
    content: currentRawContent,
    mastery: 0,
    reviewCount: 0,
    lastReviewedAt: null,
    nextReviewAt: now,
    createdAt: now
  });
  writeJson(REVIEW_CARDS_KEY, reviewCards);
  renderHub();
  setStatus("已加入复习卡");
}

function saveFavorite() {
  if (!currentRawContent) {
    setStatus("请先解析一道题", true);
    return;
  }
  favorites.unshift({
    id: Date.now(),
    title: currentTitle || "收藏题目",
    content: currentRawContent,
    imageHash: "",
    createdAt: new Date().toISOString()
  });
  writeJson(FAVORITES_KEY, favorites);
  renderFavorites();
  setStatus("已加入收藏夹");
}

function openContent(item, label = "已载入内容") {
  currentRawContent = item.content || "";
  currentTitle = item.title || "学习资料";
  currentSource = item.sourceQuestionId ? { id: item.sourceQuestionId, metadata: item.metadata, knowledgePoints: item.knowledgePoints } : null;
  answerContent.innerHTML = markdownLite(currentRawContent);
  setStatus(label);
  switchTab("study");
  typeset(answerContent);
}

function deleteItem(kind, id) {
  if (kind === "favorite") {
    favorites = favorites.filter((item) => item.id !== id);
    writeJson(FAVORITES_KEY, favorites);
    renderFavorites();
  }
  if (kind === "stage") {
    stageMaterials = stageMaterials.filter((item) => item.id !== id);
    writeJson(STAGE_MATERIALS_KEY, stageMaterials);
    renderHub();
  }
  if (kind === "review") {
    reviewCards = reviewCards.filter((item) => item.id !== id);
    writeJson(REVIEW_CARDS_KEY, reviewCards);
    renderHub();
  }
}

function switchTab(tabName) {
  document.querySelectorAll(".bottom-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tabName);
  });
  document.querySelectorAll(".tab-view").forEach((view) => {
    view.classList.toggle("active", view.dataset.view === tabName);
  });
  if (tabName === "hub") renderHub();
  if (tabName === "favorites") renderFavorites();
  if (tabName === "settings") syncSettingsFields();
}

function makeResultTitle(result, extraQuestion) {
  if (result?.source?.metadata?.year && result?.source?.metadata?.number) {
    return `${result.source.metadata.year}年第${result.source.metadata.number}题`;
  }
  if (result?.source?.id) return result.source.id;
  if (extraQuestion) return extraQuestion.slice(0, 34);
  if (selectedFileName) return selectedFileName;
  return "数学题解析";
}

function saveHistoryItem(result, extraQuestion) {
  const item = {
    id: Date.now(),
    title: currentTitle,
    content: currentRawContent,
    question: extraQuestion,
    source: result.source || null,
    createdAt: new Date().toISOString()
  };
  history = [item, ...history.filter((entry) => entry.content !== item.content)].slice(0, 50);
  writeJson(HISTORY_KEY, history);
}

function extractMarkdownSection(content, headingNames) {
  const text = String(content || "");
  const names = Array.isArray(headingNames) ? headingNames : [headingNames];
  for (const name of names) {
    const pattern = new RegExp(`(?:^|\\n)#{0,6}\\s*${name}\\s*\\n([\\s\\S]*?)(?=\\n#{0,6}\\s*(?:题目识别|涉及知识点|解题思路|完整解答|最终答案|易错提醒|复习卡片|复习卡|答案)\\s*\\n|$)`, "i");
    const match = text.match(pattern);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return "";
}

function makeSavedContextAnswer(item, question) {
  const content = item?.content || "";
  const knowledge = extractMarkdownSection(content, ["涉及知识点", "知识点"]);
  const idea = extractMarkdownSection(content, ["解题思路"]);
  const mistakes = extractMarkdownSection(content, ["易错提醒", "易错点"]);
  const card = extractMarkdownSection(content, ["复习卡片", "复习卡"]);
  const fallback = compactTextForLocal(content, 900);

  return [
    "# 本地资料追问",
    "",
    `你正在围绕 **${item?.title || "这份收藏资料"}** 继续学习。`,
    "",
    `**你的问题：** ${question || "继续讲一下最重要的考点和易错点"}`,
    "",
    "## 最重要的考点",
    knowledge || "这份资料没有单独写出“涉及知识点”模块，可以先从下方摘要里定位关键概念。",
    "",
    "## 怎么继续理解",
    idea || "建议先回到原解析，找出第一步使用的定理或公式，再看它为什么能把题目条件转化成可计算的表达式。",
    "",
    "## 最容易错的地方",
    mistakes || "重点检查条件是否用全、公式适用范围是否满足、符号和上下标是否抄错，以及最后是否回到题目要求的结论。",
    "",
    "## 复习抓手",
    card || fallback,
    "",
    "> 以上内容来自你本地保存的资料，没有调用外部模型。需要更深入的变式讲解时，可以在设置里换成可用模型后再追问。"
  ].join("\n");
}

function compactTextForLocal(content, limit = 900) {
  return String(content || "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, limit) || "暂无可摘要内容。";
}

function answerFromSavedContext(item, question) {
  currentRawContent = makeSavedContextAnswer(item, question);
  currentTitle = `围绕「${item?.title || "本地资料"}」的追问`;
  currentSource = item?.sourceQuestionId ? { id: item.sourceQuestionId, metadata: item.metadata, knowledgePoints: item.knowledgePoints } : null;
  answerContent.innerHTML = markdownLite(currentRawContent);
  saveHistoryItem({ content: currentRawContent, source: currentSource }, question);
  activeSavedContext = null;
  setStatus("本地资料追问 · 再次发送调用模型");
  renderHub();
  renderFavorites();
  switchTab("study");
  typeset(answerContent);
}

function renderMobileList(container, items, emptyText, kind) {
  container.innerHTML = "";
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = emptyText;
    container.appendChild(empty);
    return;
  }
  items.slice(0, 18).forEach((item) => {
    const row = document.createElement("div");
    row.className = "mobile-list-item";
    const date = item.updatedAt || item.createdAt || new Date().toISOString();
    row.innerHTML = `
      <div>
        <strong>${escapeHtml(item.title || "学习资料")}</strong>
        <small>${new Date(date).toLocaleDateString()}${item.knowledgePoints?.length ? ` · ${escapeHtml(item.knowledgePoints.slice(0, 3).join("、"))}` : ""}</small>
      </div>
      <div class="mobile-list-actions">
        <button class="tiny-button view-item" type="button">查看</button>
        <button class="tiny-button ask-item" type="button">追问</button>
        <button class="tiny-button delete-item" type="button">删除</button>
      </div>
    `;
    row.querySelector(".view-item").addEventListener("click", () => openContent(item));
    row.querySelector(".ask-item").addEventListener("click", () => {
      activeSavedContext = item;
      openContent(item, "已载入本地资料 · 可追问");
      questionInput.value = `围绕「${item.title || "这份资料"}」继续讲一下最重要的考点和易错点`;
      updateCounter();
      switchTab("study");
      questionInput.focus();
    });
    row.querySelector(".delete-item").addEventListener("click", () => deleteItem(kind, item.id));
    container.appendChild(row);
  });
}

function exportLocalData() {
  const payload = {
    exportedAt: new Date().toISOString(),
    config: getConfig(),
    history,
    favorites,
    reviewCards,
    stageMaterials
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `math-tutor-mobile-data-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setStatus("学习数据已导出");
}

function importLocalData(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onerror = () => setStatus("导入失败", true);
  reader.onload = () => {
    try {
      const payload = JSON.parse(reader.result);
      if (payload.config?.apiKey && payload.config?.baseUrl && payload.config?.model) {
        setConfig(payload.config);
      }
      if (Array.isArray(payload.history)) writeJson(HISTORY_KEY, payload.history);
      if (Array.isArray(payload.favorites)) writeJson(FAVORITES_KEY, payload.favorites);
      if (Array.isArray(payload.reviewCards)) writeJson(REVIEW_CARDS_KEY, payload.reviewCards);
      if (Array.isArray(payload.stageMaterials)) writeJson(STAGE_MATERIALS_KEY, payload.stageMaterials);
      loadLocalData();
      syncSettingsFields();
      setStatus("学习数据已导入");
    } catch {
      setStatus("导入文件格式不正确", true);
    }
  };
  reader.readAsText(file);
}

function renderHub() {
  if (!hubList) return;
  const foundationItems = stageMaterials.filter((item) => item.stage === "foundation");
  const intensiveItems = stageMaterials.filter((item) => item.stage === "intensive");
  const dueCards = reviewCards.map(normalizeReviewCard).filter(isDue);
  foundationCount.textContent = foundationItems.length;
  intensiveCount.textContent = intensiveItems.length;
  dueReviewCountMobile.textContent = dueCards.length;

  const items = activeHubPanel === "foundation"
    ? foundationItems
    : activeHubPanel === "intensive"
      ? intensiveItems
      : reviewCards.map(normalizeReviewCard).sort((a, b) => new Date(a.nextReviewAt) - new Date(b.nextReviewAt));
  const empty = activeHubPanel === "foundation"
    ? "还没有基础资料。解析后可以点“加入基础”。"
    : activeHubPanel === "intensive"
      ? "还没有强化资料。解析后可以点“加入强化”。"
      : "还没有复习卡。解析后可以点“复习卡”。";
  renderMobileList(hubList, items, empty, activeHubPanel === "review" ? "review" : "stage");
}

function renderFavorites() {
  if (!favoritesList) return;
  renderMobileList(favoritesList, favorites, "还没有收藏内容。解析后可以点“收藏”。", "favorite");
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("图片读取失败"));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("图片加载失败"));
      image.onload = () => {
        const maxSide = 1400;
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        context.fillStyle = "#fffdf7";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.84));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function handleFile(file, autoRecognize = true) {
  if (!file) return;
  activeSavedContext = null;
  selectedFileName = file.name;
  recognizedQuestionText = "";
  if (recognizedQuestionInput) recognizedQuestionInput.value = "";
  renderRecognizedQuestion();
  setRecognitionEditMode(false);
  setStatus("正在读取图片");
  imageDataUrl = await compressImage(file);
  imagePreview.src = imageDataUrl;
  imagePreview.hidden = false;
  uploadEmpty.hidden = true;
  sampleProblem.classList.remove("visible");
  recognitionPanel.hidden = false;
  setStatus("图片已上传 · 正在识别题目");
  if (autoRecognize) recognizeUploadedImage();
}

async function recognizeUploadedImage() {
  const config = getConfig();
  if (!config) {
    hide(appScreen);
    show(setupScreen);
    return;
  }
  if (!imageDataUrl) {
    setStatus("请先上传图片", true);
    return;
  }

  sendButton.disabled = true;
  setRecognitionStatus("正在识别，请稍候");
  setStatus("正在识别题目");
  setRecognitionEditMode(false);
  recognizedQuestionInput.value = "正在识别图片中的题目，请稍候...";
  renderRecognizedQuestion();

  try {
    const response = await fetch("/api/recognize-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageDataUrl,
        extraQuestion: questionInput.value.trim(),
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        model: config.model,
        temperature: "0"
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "题目识别失败");
    recognizedQuestionText = result.recognizedQuestion || "";
    recognizedQuestionInput.value = recognizedQuestionText;
    setRecognitionEditMode(false);
    renderRecognizedQuestion();
    setRecognitionStatus(`识别完成 · ${result.model || "vision model"}`);
    setStatus("请核对题目识别，再发送解析");
  } catch (error) {
    recognizedQuestionText = "";
    recognizedQuestionInput.value = "";
    renderRecognizedQuestion();
    setRecognitionStatus(error.message || "题目识别失败", true);
    setStatus("题目识别失败", true);
  } finally {
    sendButton.disabled = false;
  }
}

function makeStatusLabel(result) {
  const route = result?.agentTrace?.route;
  if (route === "direct_local") return "本地优先 · 0 token";
  if (route === "direct_similar") return "同类题命中 · 0 token";
  if (route === "local_enhance") {
    return result?.agentTrace?.isFollowUp
      ? `追问拓展 · ${result.model || "模型"}`
      : `本地资料 + 模型综合 · ${result.model || "模型"}`;
  }
  if (route === "model_solve") return `模型解析 · ${result.model || "模型"}`;
  if (result?.model) return `解析完成 · ${result.model}`;
  return "解析完成";
}

async function solve(options = {}) {
  const isFollowUp = Boolean(options.followUp);
  const extraQuestion = questionInput.value.trim();

  const config = getConfig();
  if (!config) {
    hide(appScreen);
    show(setupScreen);
    return;
  }
  if (!imageDataUrl && !extraQuestion) {
    setStatus("请上传图片或输入问题", true);
    return;
  }
  if (isFollowUp && !extraQuestion) {
    setStatus("请先输入你想追问的问题", true);
    return;
  }
  if (isFollowUp && !currentRawContent && !currentSource?.id && !activeSavedContext) {
    setStatus("请先完成一道题解析，或从中枢/收藏夹载入资料后再追问", true);
    return;
  }
  if (imageDataUrl && !recognizedQuestionInput?.value.trim()) {
    setStatus("请先完成题目识别，并核对预览文本", true);
    return;
  }

  sendButton.disabled = true;
  cameraButton.disabled = true;
  setStatus(isFollowUp ? "正在结合本地资料调用模型追问" : "正在检索本地题库");
  answerContent.innerHTML = `<p>${isFollowUp ? "正在结合当前题目和本地资料回答追问。" : "正在检索本地题库，并准备解析你的问题。"}</p>`;

  const contextItem = activeSavedContext || null;
  const sourceQuestionId = currentSource?.id || contextItem?.sourceQuestionId || null;
  const currentAnswerContext = currentRawContent || contextItem?.content || "";

  try {
    const response = await fetch("/api/solve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        followUp: isFollowUp,
        sourceQuestionId,
        currentAnswerContext,
        imageDataUrl,
        fileName: selectedFileName,
        recognizedQuestion: recognizedQuestionInput?.value.trim() || recognizedQuestionText,
        extraQuestion,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        model: config.model,
        temperature: "0.25"
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "解析失败");

    currentRawContent = result.content || "";
    currentTitle = makeResultTitle(result, extraQuestion);
    currentSource = result.source || null;
    saveHistoryItem(result, extraQuestion);
    answerContent.innerHTML = markdownLite(result.content || "");
    setStatus(makeStatusLabel(result));
    activeSavedContext = null;
    renderHub();
    renderFavorites();
    typeset(answerContent);
  } catch (error) {
    answerContent.innerHTML = `<p>${escapeHtml(error.message || "解析失败，请检查配置。")}</p>`;
    setStatus("解析失败", true);
  } finally {
    sendButton.disabled = false;
    cameraButton.disabled = false;
  }
}

setupForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const apiKey = setupApiKey.value.trim();
  const baseUrl = setupBaseUrl.value.trim();
  const model = setupModel.value.trim();
  if (!apiKey || !baseUrl || !model) return;
  setupSubmit.disabled = true;
  setupSubmit.textContent = "正在连接...";
  setConfig({ apiKey, baseUrl, model });
  transitionToApp();
  setTimeout(() => {
    setupSubmit.disabled = false;
    setupSubmit.textContent = "保存并开始";
  }, 950);
});

toggleKeyButton.addEventListener("click", () => {
  setupApiKey.type = setupApiKey.type === "password" ? "text" : "password";
});

uploadArea.addEventListener("click", () => imageInput.click());
cameraButton.addEventListener("click", () => solve({ followUp: true }));
imageInput.addEventListener("change", () => handleFile(imageInput.files[0], true).catch((error) => setStatus(error.message, true)));

["dragenter", "dragover"].forEach((eventName) => {
  uploadArea.addEventListener(eventName, (event) => {
    event.preventDefault();
    uploadArea.classList.add("dragging");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  uploadArea.addEventListener(eventName, (event) => {
    event.preventDefault();
    uploadArea.classList.remove("dragging");
  });
});

uploadArea.addEventListener("drop", (event) => {
  handleFile(event.dataTransfer.files[0], true).catch((error) => setStatus(error.message, true));
});

questionInput.addEventListener("input", updateCounter);
recognizedQuestionInput.addEventListener("input", () => {
  recognizedQuestionText = recognizedQuestionInput.value;
  renderRecognizedQuestion();
  setRecognitionStatus("已手动修改，请确认后发送");
});
toggleRecognitionEditButton.addEventListener("click", () => {
  setRecognitionEditMode(!recognitionEditMode);
});
sendButton.addEventListener("click", () => solve());
saveFoundationButton.addEventListener("click", () => saveStageMaterial("foundation"));
saveIntensiveButton.addEventListener("click", () => saveStageMaterial("intensive"));
saveReviewButton.addEventListener("click", saveReviewCard);
saveFavoriteButton.addEventListener("click", saveFavorite);

document.querySelectorAll(".bottom-tab").forEach((button) => {
  button.addEventListener("click", () => switchTab(button.dataset.tab));
});

document.querySelectorAll("[data-hub-panel]").forEach((button) => {
  button.addEventListener("click", () => {
    activeHubPanel = button.dataset.hubPanel;
    document.querySelectorAll("[data-hub-panel]").forEach((item) => item.classList.toggle("active", item === button));
    renderHub();
  });
});

settingsProvider.addEventListener("change", () => applyProviderPreset(settingsProvider.value));
settingsModelPreset.addEventListener("change", () => {
  settingsModel.value = settingsModelPreset.value;
});
settingsModel.addEventListener("input", () => {
  renderModelPresetOptions(settingsProvider.value, settingsModel.value.trim());
});
refreshModelsButton.addEventListener("click", refreshAvailableModels);
saveSettingsButton.addEventListener("click", saveSettingsFromPanel);
exportDataButton.addEventListener("click", exportLocalData);
importDataButton.addEventListener("click", () => importDataInput.click());
importDataInput.addEventListener("change", () => importLocalData(importDataInput.files[0]));

resetConfigButton.addEventListener("click", () => {
  localStorage.removeItem(CONFIG_KEY);
  localStorage.removeItem(MAIN_CONFIG_KEY);
  hide(appScreen);
  show(setupScreen);
});

initConfig();
loadLocalData();
updateCounter();
typeset(document.body);
