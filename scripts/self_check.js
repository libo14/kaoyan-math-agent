#!/usr/bin/env node

const { spawn } = require("node:child_process");

const PORT = Number(process.env.SELF_CHECK_PORT || 5299);
const BASE_URL = `http://127.0.0.1:${PORT}`;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${BASE_URL}/api/bank-stats`);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await wait(250);
  }
  throw new Error("本地服务启动超时");
}

async function postJson(path, payload) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => null);
  return { response, data };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function runChecks() {
  const statsResponse = await fetch(`${BASE_URL}/api/bank-stats`);
  const stats = await statsResponse.json();
  assert(stats.totalQuestions >= 390, `题库数量异常：${stats.totalQuestions}`);
  assert(stats.totalChunks >= 2900, `RAG 切片数量异常：${stats.totalChunks}`);

  const cases = [
    ["2015年第一题", "2015_math1_01"],
    ["15年数一第1题", "2015_math1_01"],
    ["05年数一第1题", "2005_math1_01"],
    ["2013年第23题", "2013_math1_23"]
  ];

  for (const [query, expectedId] of cases) {
    const { response, data } = await postJson("/api/local-answer", { searchText: query });
    assert(response.ok, `本地检索失败：${query}`);
    const actualId = data?.source?.id;
    assert(actualId === expectedId, `本地检索命中错误：${query} -> ${actualId}, expected ${expectedId}`);
  }

  const { response: agentLocalResponse, data: agentLocalData } = await postJson("/api/solve", {
    extraQuestion: "2015年第1题"
  });
  assert(agentLocalResponse.ok, "LangGraph Agent 本地题号命中失败");
  assert(agentLocalData?.source?.id === "2015_math1_01", "LangGraph Agent 本地题号命中错误");
  assert(agentLocalData?.agentTrace?.route === "direct_local", "LangGraph Agent 未走 0-token 本地命中路径");

  const { response: agentSimilarResponse, data: agentSimilarData } = await postJson("/api/solve", {
    extraQuestion: "给我推荐一道泰勒公式同类题"
  });
  assert(agentSimilarResponse.ok, "LangGraph Agent 同类题推荐失败");
  assert(agentSimilarData?.agentTrace?.route === "direct_similar", "LangGraph Agent 未走 0-token 同类题路径");

  const { response: similarResponse, data: similarData } = await postJson("/api/similar-questions", {
    query: "泰勒公式",
    limit: 5
  });
  assert(similarResponse.ok, "同类题接口请求失败");
  assert(similarData?.count > 0, "同类题接口没有返回结果");
  assert(
    similarData.results.every((item) => item.metadata?.year),
    "同类题接口返回了缺少年份的旧样例"
  );

  const naturalLanguageChecks = [
    ["中值定理证明题", "中值定理"],
    ["二重积分换元", "二重积分"],
    ["矩阵特征值", "特征值"],
    ["正态分布参数估计", "正态分布"]
  ];
  for (const [query, expectedReason] of naturalLanguageChecks) {
    const { response, data } = await postJson("/api/similar-questions", {
      query,
      limit: 3
    });
    assert(response.ok, `自然语言检索失败：${query}`);
    assert(data?.count > 0, `自然语言检索无结果：${query}`);
    const reasonText = JSON.stringify(data.results, null, 0);
    assert(reasonText.includes(expectedReason), `自然语言检索结果不含预期考点：${query}`);
  }

  const { data: textOnlyData } = await postJson("/api/solve", {
    apiKey: "self-check-placeholder",
    baseUrl: "http://127.0.0.1:9/v1",
    model: "self-check",
    extraQuestion: "泰勒公式怎么复习"
  });
  assert(
    !String(textOnlyData?.error || "").includes("拖入") && !String(textOnlyData?.error || "").includes("图片"),
    `纯文字问题被图片校验拦截：${textOnlyData?.error}`
  );

  return stats;
}

async function main() {
  const server = spawn(process.execPath, ["src/server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(PORT)
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let serverOutput = "";
  server.stdout.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });
  server.stderr.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });

  try {
    await waitForServer();
    const stats = await runChecks();
    console.log("Self-check passed.");
    console.log(`Questions: ${stats.totalQuestions}`);
    console.log(`RAG chunks: ${stats.totalChunks}`);
  } catch (error) {
    console.error("Self-check failed.");
    console.error(error.message || error);
    if (serverOutput.trim()) {
      console.error("\nServer output:");
      console.error(serverOutput.trim());
    }
    process.exitCode = 1;
  } finally {
    server.kill();
  }
}

main();
