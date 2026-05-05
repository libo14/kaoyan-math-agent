# Data Policy

This repository intentionally does **not** include the full postgraduate math exam corpus.

## Open-source data included

- `processed-demo/`
  - A tiny synthetic/demo dataset used to verify the app and show the data shape.
  - Safe to commit.

## Local-only data ignored by Git

- `raw/`
  - User-owned raw question folders.
  - Usually contains generated answers or manually collected problem material.

- `imports/`
  - Original Markdown/PDF/image imports.
  - May contain copyrighted exam content or personal file paths.

- `processed/`
  - Full generated JSONL/SQLite/RAG outputs.
  - Built locally from `raw/`.

- `chatgpt_outputs/`
  - Browser automation outputs.

## Recommended workflow

1. Keep your full private corpus under `data/raw/` and `data/imports/`.
2. Run:

   ```bash
   python3 scripts/build_question_bank.py --input data/raw --output data/processed
   ```

3. The app will use `data/processed/` when present.
4. If `data/processed/` is absent, the app falls back to `data/processed-demo/`.

## Copyright note

Do not commit full exam PDFs, screenshots, copied official problem statements, or large generated answer corpora unless you have the legal right to publish them.
