# 真题知识库批处理脚本

这个脚本不调用 API，也不自动操作网页。你手动把 ChatGPT 的高质量答案复制到文件里，脚本负责后续整理：

- 生成标准题库 `question_bank.jsonl`
- 生成 RAG 切片 `rag_chunks.jsonl`
- 生成 SQLite 数据库 `question_bank.sqlite`
- 检查 GPT 解析结构完整性，输出 `review_report.md`

## 推荐目录格式

```text
data/raw/
  2010-数一-20/
    meta.json
    question.jpg
    problem.md
    gpt.md
  2011-数一-18/
    question.png
    gpt.md
```

`meta.json` 可选，推荐这样写：

```json
{
  "id": "2010_math1_20",
  "year": 2010,
  "subject": "数一",
  "question_no": 20,
  "type": "解答题"
}
```

`problem.md` 可选，用来放你手工 OCR 或自己整理的题干文本。

`gpt.md` 是你从 ChatGPT 网页复制下来的结构化解析。`gemini.md` 已不再需要；如果旧数据里存在，脚本会保留兼容但不会依赖它做校验。

## 运行

在项目根目录运行：

```bash
python scripts/build_question_bank.py --input data/raw --output data/processed
```

如果你的环境里没有 `python` 命令，用：

```bash
python3 scripts/build_question_bank.py --input data/raw --output data/processed
```

Windows PowerShell 中也可以：

```powershell
python .\scripts\build_question_bank.py --input .\data\raw --output .\data\processed
```

## 输出文件

```text
data/processed/
  question_bank.jsonl
  rag_chunks.jsonl
  question_bank.sqlite
  review_report.md
  README.md
```

`rag_chunks.jsonl` 后续可以导入 pgvector、Qdrant、Chroma、Milvus 等向量库。

## CSV manifest 方式

如果你不想一题一个文件夹，也可以写一个 CSV：

```csv
id,year,subject,question_no,type,image,problem,gpt
2010_math1_20,2010,数一,20,解答题,images/2010_20.jpg,problems/2010_20.md,answers/2010_20_gpt.md
```

运行：

```bash
python scripts/build_question_bank.py --input data/raw --manifest data/raw/manifest.csv --output data/processed
```

## 注意

脚本只检查结构完整性和关键词提取，不能替代数学人工校验。凡是 `review_report.md` 标记出来的题，都建议人工看一遍。
