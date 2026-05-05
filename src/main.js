const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");

const DEFAULT_BASE_URL = "https://api.openai.com/v1/chat/completions";

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1040,
    minHeight: 700,
    backgroundColor: "#f6f5f0",
    title: "研数导学 Agent",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

function normalizeBaseUrl(input) {
  const value = (input || DEFAULT_BASE_URL).trim();
  if (value.endsWith("/chat/completions")) return value;
  return `${value.replace(/\/$/, "")}/chat/completions`;
}

function buildSystemPrompt() {
  return [
    "你是一个考研数学导学 Agent，目标是帮助用户快速看懂题目并学会这类题。",
    "你要直接给出完整答案，但不能只报答案；必须解释知识点、题型识别、关键转化和易错点。",
    "如果图片内容识别不清，你要先说明不确定处，并基于可见内容尽量解答。",
    "输出必须使用中文，风格像耐心但高效的考研数学老师。",
    "请严格按以下结构输出：",
    "1. 题目识别：用自己的话复述题意，若有不清楚内容请标注。",
    "2. 涉及知识点：列出本题用到的核心知识点和公式。",
    "3. 解题思路：说明为什么这样做，不要跳过关键判断。",
    "4. 完整解答：给出从条件到答案的详细过程。",
    "5. 易错提醒：指出本题最容易错在哪里。",
    "6. 复习卡片：用三到五句话总结这类题以后怎么做。",
    "数学公式尽量使用 Markdown/LaTeX 表达。"
  ].join("\n");
}

ipcMain.handle("solve-math-problem", async (_event, payload) => {
  const {
    apiKey,
    baseUrl,
    model,
    imageDataUrl,
    extraQuestion,
    temperature
  } = payload || {};

  if (!apiKey || !apiKey.trim()) {
    throw new Error("请先填写你的大模型 API Key。");
  }

  if (!imageDataUrl && !String(extraQuestion || "").trim()) {
    throw new Error("请先拖入题目图片，或输入你想问的数学问题。");
  }

  const targetUrl = normalizeBaseUrl(baseUrl);
  const chosenModel = (model || "gpt-4o-mini").trim();
  const userContent = imageDataUrl
    ? [
        {
          type: "text",
          text: [
            "请解析这道考研数学题。",
            extraQuestion ? `用户补充问题：${extraQuestion}` : "",
            "请先识别题目，再给知识点和完整解答。"
          ].filter(Boolean).join("\n")
        },
        {
          type: "image_url",
          image_url: {
            url: imageDataUrl,
            detail: "low"
          }
        }
      ]
    : [
        "用户没有上传图片，只输入了文字问题。",
        `用户问题：${extraQuestion}`,
        "请优先判断这是题库检索、知识点讲解、同类题推荐还是普通考研数学疑问。",
        "如果不是完整题目，不要硬编题干；请围绕用户问题给出清晰、可复习的讲解。"
      ].join("\n");

  const response = await fetch(targetUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey.trim()}`
    },
    body: JSON.stringify({
      model: chosenModel,
      temperature: Number.isFinite(Number(temperature)) ? Number(temperature) : 0.25,
      messages: [
        {
          role: "system",
          content: buildSystemPrompt()
        },
        {
          role: "user",
          content: userContent
        }
      ]
    })
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const detail = data?.error?.message || data?.message || response.statusText;
    throw new Error(`模型请求失败：${detail}`);
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("模型没有返回可展示的解析内容。");
  }

  return {
    content,
    model: chosenModel,
    createdAt: new Date().toISOString()
  };
});
