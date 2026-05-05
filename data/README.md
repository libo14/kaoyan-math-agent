# Data Policy

This repository includes text-only structured answer data generated for this project, plus demo data for quick verification. Binary source material and local private files stay out of Git.

## Open-source data included

- `imports/`
  - ChatGPT-generated Markdown解析按年份/数学类别分类保存。
  - Only text files are committed; screenshots, PDFs, and `pdf_pages/` are ignored.

- `processed/`
  - Text knowledge-base outputs built from the imports.
  - `question_bank.jsonl` powers exact/year-question retrieval.
  - `rag_chunks.jsonl` powers knowledge-point and similar-question retrieval.
  - SQLite files are local binary caches and are ignored.

- `processed-demo/`
  - A tiny synthetic/demo dataset used to verify the app and show the data shape.
  - Kept for clone-and-run demos even when the full processed data is absent.

## Local-only data ignored by Git

- `raw/`
  - User-owned raw question folders.
  - Usually contains generated answers or manually collected problem material.

- `chatgpt_outputs/`
  - Browser automation outputs.

## Recommended workflow

1. Keep raw PDFs/images under `data/raw/` or ignored subfolders.
2. Run:

   ```bash
   python3 scripts/build_question_bank.py --input data/raw --output data/processed
   ```

3. The app will use `data/processed/` when present.
4. If `data/processed/` is absent, the app falls back to `data/processed-demo/`.
