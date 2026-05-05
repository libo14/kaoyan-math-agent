# 处理结果

- `question_bank.jsonl`：完整题库记录，一题一行。
- `rag_chunks.jsonl`：未来导入向量数据库的切片数据。
- `question_bank.sqlite`：SQLite 数据库，包含 questions / answer_versions / rag_chunks。
- `review_report.md`：需要人工复核的题目列表。

`rag_chunks.embedding_json` 目前为空，后续可以用本地 embedding 模型或付费 API 补进去。
