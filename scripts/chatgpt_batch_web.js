#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const args = {
    input: "",
    output: path.resolve("data", "chatgpt_outputs"),
    prompt: path.resolve("prompts", "chatgpt_batch_exam_prompt.md"),
    profile: path.resolve(".chatgpt-chrome-profile"),
    delay: 8000,
    timeout: 20 * 60 * 1000,
    startIndex: 0,
    headless: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];
    if (current === "--input" || current === "-i") args.input = path.resolve(next || "");
    if (current === "--output" || current === "-o") args.output = path.resolve(next || "");
    if (current === "--prompt") args.prompt = path.resolve(next || "");
    if (current === "--profile") args.profile = path.resolve(next || "");
    if (current === "--delay") args.delay = Number(next || args.delay);
    if (current === "--timeout") args.timeout = Number(next || args.timeout);
    if (current === "--start-index") args.startIndex = Number(next || 0);
    if (current === "--headless") args.headless = true;
    if (current.startsWith("--") && next && !next.startsWith("--")) index += 1;
  }

  return args;
}

function loadPlaywright() {
  try {
    return require("playwright-core");
  } catch (error) {
    console.error("缺少依赖 playwright-core。请先运行：");
    console.error("  npm install playwright-core");
    process.exit(1);
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function listExamFiles(inputDir) {
  const allowed = new Set([".pdf", ".png", ".jpg", ".jpeg", ".webp", ".bmp"]);
  return fs.readdirSync(inputDir)
    .map((name) => path.join(inputDir, name))
    .filter((file) => fs.statSync(file).isFile() && allowed.has(path.extname(file).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
}

function inferExamMeta(filePath) {
  const base = path.basename(filePath, path.extname(filePath));
  const yearMatch = base.match(/(19|20)\d{2}/);
  const subjectMatch = base.match(/数学\s*([一二三123])/);
  const subjectMap = { "1": "数学一", "2": "数学二", "3": "数学三", "一": "数学一", "二": "数学二", "三": "数学三" };
  const subject = subjectMatch ? subjectMap[subjectMatch[1]] : "数学一";
  const year = yearMatch ? yearMatch[0] : "未知年份";
  const slug = `${year}_${subject.replace("数学", "math")}_${base}`
    .replace(/[^\w\u4e00-\u9fa5-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return { year, subject, slug, fileName: path.basename(filePath) };
}

function renderPrompt(template, meta) {
  return template
    .replaceAll("{{year}}", meta.year)
    .replaceAll("{{subject}}", meta.subject)
    .replaceAll("{{fileName}}", meta.fileName);
}

async function openChat(page) {
  await page.goto("https://chatgpt.com/", { waitUntil: "domcontentloaded", timeout: 120000 });
  console.log("如果浏览器要求登录，请在打开的 Chrome 里手动登录。脚本会等待输入框出现。");
  await waitForPrompt(page, 10 * 60 * 1000);
}

async function waitForPrompt(page, timeout) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const found = await page.locator("#prompt-textarea, textarea, [contenteditable='true']").first().count().catch(() => 0);
    if (found) return;
    await page.waitForTimeout(1000);
  }
  throw new Error("没有找到 ChatGPT 输入框。请确认已经登录，且页面没有验证码或弹窗遮挡。");
}

async function setPromptText(page, text) {
  const prompt = page.locator("#prompt-textarea, textarea, [contenteditable='true']").first();
  await prompt.click({ timeout: 60000 });

  const tagName = await prompt.evaluate((node) => node.tagName.toLowerCase());
  if (tagName === "textarea") {
    await prompt.fill(text);
    return;
  }

  await prompt.evaluate((node, value) => {
    node.focus();
    node.textContent = value;
    node.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
  }, text);
}

async function uploadFile(page, filePath) {
  const existingInputs = await page.locator("input[type='file']").count();
  if (!existingInputs) {
    const attachButton = page.locator([
      "button[aria-label*='Attach']",
      "button[aria-label*='Upload']",
      "button[aria-label*='上传']",
      "button[aria-label*='添加']",
      "button:has-text('上传')",
    ].join(", ")).first();
    if (await attachButton.count().catch(() => 0)) {
      await attachButton.click().catch(() => {});
      await page.waitForTimeout(1000);
    }
  }

  const fileInput = page.locator("input[type='file']").last();
  await fileInput.setInputFiles(filePath);
  await page.waitForTimeout(5000);
}

async function clickSend(page) {
  const sendButton = page.locator([
    "button[data-testid='send-button']",
    "button[aria-label*='Send']",
    "button[aria-label*='发送']",
  ].join(", ")).first();

  await sendButton.waitFor({ state: "visible", timeout: 120000 });
  await sendButton.click();
}

async function waitForAnswerDone(page, previousCount, timeout) {
  const start = Date.now();
  let lastText = "";
  let stableCount = 0;

  while (Date.now() - start < timeout) {
    const messages = page.locator("[data-message-author-role='assistant']");
    const count = await messages.count().catch(() => 0);
    const stopVisible = await page.locator("button[data-testid='stop-button'], button[aria-label*='Stop'], button[aria-label*='停止']").first().isVisible().catch(() => false);

    if (count > previousCount) {
      const current = (await messages.nth(count - 1).innerText().catch(() => "")).trim();
      if (current && current === lastText && !stopVisible) {
        stableCount += 1;
      } else {
        stableCount = 0;
        lastText = current;
      }

      if (current.length > 200 && stableCount >= 4) {
        return current;
      }
    }

    await page.waitForTimeout(3000);
  }

  throw new Error("等待 ChatGPT 回答超时。可以增加 --timeout，或检查页面是否要求继续生成/验证。");
}

async function copyLastAnswerMarkdown(page) {
  const messages = page.locator("[data-message-author-role='assistant']");
  const count = await messages.count();
  if (!count) return "";

  const last = messages.nth(count - 1);
  await last.scrollIntoViewIfNeeded().catch(() => {});

  const copyButton = last.locator("button[aria-label*='Copy'], button[aria-label*='复制'], [data-testid*='copy']").last();
  if (await copyButton.count().catch(() => 0)) {
    await copyButton.click().catch(() => {});
    await page.waitForTimeout(1000);
    const clip = await page.evaluate(async () => navigator.clipboard.readText()).catch(() => "");
    if (clip && clip.trim().length > 50) return clip.trim();
  }

  return (await last.innerText().catch(() => "")).trim();
}

async function run() {
  const args = parseArgs(process.argv);
  if (!args.input || !fs.existsSync(args.input)) {
    console.error("请提供试卷文件夹，例如：");
    console.error("  node scripts/chatgpt_batch_web.js --input \"D:\\\\考研真题\"");
    process.exit(1);
  }

  const { chromium } = loadPlaywright();
  const files = listExamFiles(args.input).slice(args.startIndex);
  if (!files.length) {
    console.error("输入文件夹里没有找到 pdf/png/jpg/jpeg/webp/bmp 文件。");
    process.exit(1);
  }

  ensureDir(args.output);
  const template = fs.readFileSync(args.prompt, "utf8");
  const context = await chromium.launchPersistentContext(args.profile, {
    channel: process.env.CHATGPT_CHROME_PATH ? undefined : "chrome",
    executablePath: process.env.CHATGPT_CHROME_PATH || undefined,
    headless: args.headless,
    acceptDownloads: true,
    viewport: { width: 1440, height: 1000 },
    permissions: ["clipboard-read", "clipboard-write"],
  });

  const page = context.pages()[0] || await context.newPage();
  await openChat(page);

  const indexPath = path.join(args.output, "_batch_index.jsonl");
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const meta = inferExamMeta(file);
    const outputPath = path.join(args.output, `${meta.slug}.md`);

    if (fs.existsSync(outputPath)) {
      console.log(`[跳过] ${meta.fileName} -> 已存在 ${outputPath}`);
      continue;
    }

    console.log(`[${index + 1}/${files.length}] 上传并解析：${meta.fileName}`);
    const previousCount = await page.locator("[data-message-author-role='assistant']").count().catch(() => 0);
    await uploadFile(page, file);
    await setPromptText(page, renderPrompt(template, meta));
    await clickSend(page);
    await waitForAnswerDone(page, previousCount, args.timeout);

    const markdown = await copyLastAnswerMarkdown(page);
    if (!markdown || markdown.length < 100) {
      throw new Error(`没有抓到有效回答：${meta.fileName}`);
    }

    fs.writeFileSync(outputPath, markdown + "\n", "utf8");
    fs.appendFileSync(indexPath, JSON.stringify({
      file,
      outputPath,
      year: meta.year,
      subject: meta.subject,
      createdAt: new Date().toISOString(),
    }, null, 0) + "\n", "utf8");

    console.log(`[完成] ${outputPath}`);
    await page.waitForTimeout(args.delay);
    await page.goto("https://chatgpt.com/", { waitUntil: "domcontentloaded", timeout: 120000 }).catch(() => {});
    await waitForPrompt(page, 120000).catch(() => {});
  }

  console.log("全部处理完成。");
  await context.close();
}

run().catch((error) => {
  console.error("批处理失败：", error.message || error);
  process.exit(1);
});
