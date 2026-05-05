#!/usr/bin/env python3
"""
Build a structured postgraduate math question bank from manually collected answers.

This script does not call any LLM API. You provide each real exam question image,
optional OCR/problem text, and the high-quality answers you copied from ChatGPT.
The script normalizes metadata, creates structure review flags, chunks text for
future RAG, and writes JSONL + SQLite outputs.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sqlite3
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}
TEXT_EXTENSIONS = {".md", ".txt"}
try:
    from PIL import Image
except ImportError:
    Image = None

SECTION_ALIASES = {
    "knowledge_points": [
        "涉及知识点",
        "知识点",
        "核心知识点",
        "考点",
        "题型识别",
    ],
    "solution": [
        "完整解答",
        "解答",
        "解题过程",
        "详细解答",
        "证明",
        "解题步骤",
    ],
    "idea": [
        "解题思路",
        "思路",
        "分析",
    ],
    "pitfalls": [
        "易错提醒",
        "易错点",
        "注意事项",
        "常见错误",
    ],
    "review_card": [
        "复习卡片",
        "总结",
        "题型总结",
        "复盘",
    ],
    "final_answer": [
        "答案",
        "最终答案",
        "结论",
    ],
}

SUBJECT_ALIASES = {
    "数一": ["数一", "数学一", "math1", "shu1", "shuyi", "yi"],
    "数二": ["数二", "数学二", "math2", "shu2", "shuer", "er"],
    "数三": ["数三", "数学三", "math3", "shu3", "shusan", "san"],
}


@dataclass
class QuestionItem:
    item_id: str
    folder: Path
    metadata: dict[str, Any] = field(default_factory=dict)
    image_path: str | None = None
    problem_text: str = ""
    gpt_answer: str = ""
    gemini_answer: str = ""


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8-sig").strip()


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8") as file:
        for row in rows:
            file.write(json.dumps(row, ensure_ascii=False) + "\n")


def stable_id(*parts: str) -> str:
    digest = hashlib.sha1("||".join(parts).encode("utf-8")).hexdigest()
    return digest[:16]


def normalize_space(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def infer_subject(value: str) -> str | None:
    lowered = value.lower()
    for subject, aliases in SUBJECT_ALIASES.items():
        if any(alias.lower() in lowered for alias in aliases):
            return subject
    return None


def infer_metadata(folder: Path, explicit: dict[str, Any] | None = None) -> dict[str, Any]:
    explicit = explicit or {}
    text = f"{folder.name} {' '.join(str(v) for v in explicit.values())}"

    year = explicit.get("year")
    if not year:
        match = re.search(r"(19|20)\d{2}", text)
        year = int(match.group(0)) if match else None

    question_no = explicit.get("question_no") or explicit.get("number")
    if not question_no:
        match = re.search(r"(?:第)?(\d{1,2})(?:题|$|[-_])", text)
        question_no = int(match.group(1)) if match else None

    subject = explicit.get("subject") or infer_subject(text)
    question_type = explicit.get("type") or explicit.get("question_type")

    metadata = {
        "year": year,
        "subject": subject,
        "question_no": question_no,
        "type": question_type,
        "source_folder": str(folder),
    }
    metadata.update({k: v for k, v in explicit.items() if v not in (None, "")})
    return metadata


def find_first_file(folder: Path, candidates: list[str]) -> Path | None:
    names = {candidate.lower() for candidate in candidates}
    for path in sorted(folder.iterdir()):
        if path.is_file() and path.name.lower() in names:
            return path
    return None


def find_image(folder: Path) -> Path | None:
    preferred_names = ["question", "problem", "题目", "image"]
    images = [path for path in folder.iterdir() if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS]
    for stem in preferred_names:
        for path in images:
            if path.stem.lower() == stem.lower():
                return path
    return images[0] if images else None


def compute_average_hash(image_path: Path) -> str | None:
    if Image is None or not image_path or not image_path.exists():
        return None

    try:
        with Image.open(image_path) as image:
            image = image.convert("RGB").resize((8, 8))
            values = []
            for red, green, blue in image.getdata():
                gray = red * 0.299 + green * 0.587 + blue * 0.114
                values.append(gray)
            average = sum(values) / len(values)
            bits = "".join("1" if value >= average else "0" for value in values)
            return "".join(f"{int(bits[index:index + 4], 2):x}" for index in range(0, len(bits), 4))
    except Exception:
        return None


def discover_from_folders(input_dir: Path) -> list[QuestionItem]:
    items: list[QuestionItem] = []
    folders = sorted(path for path in input_dir.rglob("*") if path.is_dir())
    for folder in folders:
        meta_path = folder / "meta.json"
        metadata = json.loads(read_text(meta_path)) if meta_path.exists() else {}

        gpt_path = find_first_file(folder, ["gpt.md", "gpt.txt", "chatgpt.md", "chatgpt.txt", "openai.md"])
        gemini_path = find_first_file(folder, ["gemini.md", "gemini.txt", "google.md"])
        if not gpt_path:
            continue

        problem_path = find_first_file(folder, ["problem.md", "problem.txt", "question.md", "question.txt", "题目.md"])
        image_path = find_image(folder)
        inferred = infer_metadata(folder, metadata)
        if image_path and not inferred.get("image_hash"):
            image_hash = compute_average_hash(image_path)
            if image_hash:
                inferred["image_hash"] = image_hash
        item_id = metadata.get("id") or build_item_id(inferred, folder.name)

        items.append(QuestionItem(
            item_id=item_id,
            folder=folder,
            metadata=inferred,
            image_path=str(image_path) if image_path else None,
            problem_text=read_text(problem_path) if problem_path else "",
            gpt_answer=read_text(gpt_path) if gpt_path else "",
            gemini_answer=read_text(gemini_path) if gemini_path else "",
        ))
    return items


def discover_from_manifest(manifest_path: Path) -> list[QuestionItem]:
    items: list[QuestionItem] = []
    base = manifest_path.parent
    with manifest_path.open("r", encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        for row in reader:
            folder = base / row.get("folder", ".")
            metadata = infer_metadata(folder, row)
            item_id = row.get("id") or build_item_id(metadata, folder.name)

            def maybe_read(column: str) -> str:
                value = row.get(column, "").strip()
                if not value:
                    return ""
                path = (base / value).resolve()
                return read_text(path) if path.exists() else value

            image_value = row.get("image", "").strip()
            image_path = str((base / image_value).resolve()) if image_value else None

            items.append(QuestionItem(
                item_id=item_id,
                folder=folder,
                metadata=metadata,
                image_path=image_path,
                problem_text=maybe_read("problem_text") or maybe_read("problem"),
                gpt_answer=maybe_read("gpt_answer") or maybe_read("gpt"),
                gemini_answer=maybe_read("gemini_answer") or maybe_read("gemini"),
            ))
    return items


def build_item_id(metadata: dict[str, Any], fallback: str) -> str:
    parts = [
        str(metadata.get("year") or "unknown"),
        str(metadata.get("subject") or "unknown"),
        str(metadata.get("question_no") or fallback),
    ]
    slug = "_".join(re.sub(r"\W+", "", part, flags=re.UNICODE) or "x" for part in parts)
    return slug


def split_sections(markdown: str) -> dict[str, str]:
    sections: dict[str, list[str]] = {"full": [markdown.strip()]}
    current_key = "intro"
    sections[current_key] = []

    for line in markdown.splitlines():
        heading = re.match(r"^\s{0,3}#{1,6}\s*(.+?)\s*$", line)
        numbered_heading = re.match(r"^\s*(?:\d+[.、])\s*(.+?)(?:[:：]\s*)?$", line)
        title = heading.group(1) if heading else numbered_heading.group(1) if numbered_heading else None

        matched_key = match_section_key(title) if title else None
        if matched_key:
            current_key = matched_key
            sections.setdefault(current_key, [])
            continue

        sections.setdefault(current_key, []).append(line)

    return {key: "\n".join(lines).strip() for key, lines in sections.items() if "\n".join(lines).strip()}


def match_section_key(title: str | None) -> str | None:
    if not title:
        return None
    normalized = re.sub(r"[*_`：:\s]", "", title)
    for key, aliases in SECTION_ALIASES.items():
        if any(alias in normalized for alias in aliases):
            return key
    return None


def extract_final_answer(answer: str, sections: dict[str, str]) -> str:
    if sections.get("final_answer"):
        return normalize_space(sections["final_answer"])[:500]

    patterns = [
        r"(?:答案|结论|故|所以)[：:，,]?\s*([^\n。；;]{1,200})",
        r"(?:得证|证毕|成立)",
    ]
    for pattern in patterns:
        matches = re.findall(pattern, answer)
        if matches:
            match = matches[-1]
            return normalize_space(match if isinstance(match, str) else "".join(match))[:500]
    return ""


def evaluate_gpt_answer(gpt_answer: str, gpt_sections: dict[str, str], gpt_final: str) -> dict[str, Any]:
    missing_sections = [
        key for key in ["knowledge_points", "idea", "solution", "final_answer", "pitfalls", "review_card"]
        if not gpt_sections.get(key)
    ]
    review_needed = bool(missing_sections) or not gpt_answer.strip() or not gpt_final
    return {
        "similarity": None,
        "status": "needs_structure_review" if review_needed else "gpt_structured",
        "review_needed": review_needed,
        "missing_sections": missing_sections,
        "quality_source": "gpt",
    }


def extract_keywords(*texts: str) -> list[str]:
    joined = "\n".join(texts)
    candidates = [
        "极限", "连续", "导数", "微分", "中值定理", "泰勒公式", "洛必达",
        "积分", "定积分", "二重积分", "级数", "幂级数", "微分方程",
        "矩阵", "行列式", "特征值", "特征向量", "线性方程组", "二次型",
        "概率", "随机变量", "分布", "期望", "方差", "最大值", "最小值",
        "单调性", "凹凸性", "渐近线", "证明", "不等式",
    ]
    return [keyword for keyword in candidates if keyword in joined]


def chunk_text(text: str, max_chars: int = 900, overlap: int = 120) -> list[str]:
    text = text.strip()
    if not text:
        return []

    paragraphs = [paragraph.strip() for paragraph in re.split(r"\n\s*\n", text) if paragraph.strip()]
    chunks: list[str] = []
    current = ""
    for paragraph in paragraphs:
        if len(current) + len(paragraph) + 2 <= max_chars:
            current = f"{current}\n\n{paragraph}".strip()
        else:
            if current:
                chunks.append(current)
            current = paragraph

    if current:
        chunks.append(current)

    final_chunks: list[str] = []
    for chunk in chunks:
        if len(chunk) <= max_chars:
            final_chunks.append(chunk)
            continue
        start = 0
        while start < len(chunk):
            final_chunks.append(chunk[start:start + max_chars])
            start += max_chars - overlap
    return final_chunks


def build_record(item: QuestionItem) -> dict[str, Any]:
    gpt_sections = split_sections(item.gpt_answer)
    gemini_sections = split_sections(item.gemini_answer)
    gpt_final = extract_final_answer(item.gpt_answer, gpt_sections)
    gemini_final = extract_final_answer(item.gemini_answer, gemini_sections)
    comparison = evaluate_gpt_answer(item.gpt_answer, gpt_sections, gpt_final)
    keywords = extract_keywords(
        item.problem_text,
        gpt_sections.get("knowledge_points", ""),
        item.gpt_answer,
    )

    return {
        "id": item.item_id,
        "metadata": item.metadata,
        "image_path": item.image_path,
        "problem_text": item.problem_text,
        "knowledge_points": keywords,
        "answers": {
          "gpt": {
              "raw": item.gpt_answer,
              "sections": gpt_sections,
              "final_answer": gpt_final,
          },
          "gemini": {
              "raw": item.gemini_answer,
              "sections": gemini_sections,
              "final_answer": gemini_final,
          },
        },
        "comparison": comparison,
        "review_needed": comparison["review_needed"] or not keywords,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


def build_chunks(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for record in records:
        base_meta = {
            "question_id": record["id"],
            **record["metadata"],
            "knowledge_points": record["knowledge_points"],
            "review_needed": record["review_needed"],
        }

        sources = {
            "problem": record.get("problem_text", ""),
            "gpt_full": record["answers"]["gpt"]["raw"],
            "gpt_solution": record["answers"]["gpt"]["sections"].get("solution", ""),
            "gpt_idea": record["answers"]["gpt"]["sections"].get("idea", ""),
            "gpt_knowledge_points": record["answers"]["gpt"]["sections"].get("knowledge_points", ""),
            "gpt_pitfalls": record["answers"]["gpt"]["sections"].get("pitfalls", ""),
            "gpt_review_card": record["answers"]["gpt"]["sections"].get("review_card", ""),
        }

        for source_type, text in sources.items():
            for index, chunk in enumerate(chunk_text(text)):
                chunk_id = stable_id(record["id"], source_type, str(index), chunk)
                rows.append({
                    "id": chunk_id,
                    "question_id": record["id"],
                    "source_type": source_type,
                    "chunk_index": index,
                    "text": chunk,
                    "metadata": base_meta,
                })
    return rows


def write_sqlite(path: Path, records: list[dict[str, Any]], chunks: list[dict[str, Any]]) -> None:
    if path.exists():
        path.unlink()

    connection = sqlite3.connect(path)
    try:
        connection.executescript("""
        create table questions (
            id text primary key,
            metadata_json text not null,
            image_path text,
            problem_text text,
            knowledge_points_json text not null,
            comparison_json text not null,
            review_needed integer not null,
            created_at text not null
        );

        create table answer_versions (
            id text primary key,
            question_id text not null,
            provider text not null,
            raw_answer text not null,
            sections_json text not null,
            final_answer text,
            foreign key(question_id) references questions(id)
        );

        create table rag_chunks (
            id text primary key,
            question_id text not null,
            source_type text not null,
            chunk_index integer not null,
            text text not null,
            metadata_json text not null,
            embedding_json text,
            foreign key(question_id) references questions(id)
        );

        create index idx_chunks_question_id on rag_chunks(question_id);
        create index idx_chunks_source_type on rag_chunks(source_type);
        """)

        for record in records:
            connection.execute(
                """
                insert into questions (
                    id, metadata_json, image_path, problem_text, knowledge_points_json,
                    comparison_json, review_needed, created_at
                ) values (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record["id"],
                    json.dumps(record["metadata"], ensure_ascii=False),
                    record["image_path"],
                    record["problem_text"],
                    json.dumps(record["knowledge_points"], ensure_ascii=False),
                    json.dumps(record["comparison"], ensure_ascii=False),
                    1 if record["review_needed"] else 0,
                    record["created_at"],
                ),
            )

            providers = ["gpt"]
            if record["answers"]["gemini"]["raw"]:
                providers.append("gemini")

            for provider in providers:
                answer = record["answers"][provider]
                connection.execute(
                    """
                    insert into answer_versions (
                        id, question_id, provider, raw_answer, sections_json, final_answer
                    ) values (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        stable_id(record["id"], provider),
                        record["id"],
                        provider,
                        answer["raw"],
                        json.dumps(answer["sections"], ensure_ascii=False),
                        answer["final_answer"],
                    ),
                )

        for chunk in chunks:
            connection.execute(
                """
                insert into rag_chunks (
                    id, question_id, source_type, chunk_index, text, metadata_json, embedding_json
                ) values (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    chunk["id"],
                    chunk["question_id"],
                    chunk["source_type"],
                    chunk["chunk_index"],
                    chunk["text"],
                    json.dumps(chunk["metadata"], ensure_ascii=False),
                    None,
                ),
            )

        connection.commit()
    finally:
        connection.close()


def write_review_report(path: Path, records: list[dict[str, Any]]) -> None:
    lines = [
        "# 真题答案复核报告",
        "",
        f"生成时间：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        "",
        "## 需要人工复核",
        "",
    ]

    flagged = [record for record in records if record["review_needed"]]
    if not flagged:
        lines.append("暂无需要复核的题目。")
    else:
        for record in flagged:
            meta = record["metadata"]
            title = " ".join(str(x) for x in [
                meta.get("year") or "未知年份",
                meta.get("subject") or "未知科目",
                f"第{meta.get('question_no')}题" if meta.get("question_no") else record["id"],
            ])
            lines.extend([
                f"### {title}",
                "",
                f"- ID：`{record['id']}`",
                f"- 状态：`{record['comparison']['status']}`",
                f"- 缺失结构：{', '.join(record['comparison'].get('missing_sections', [])) or '无'}",
                f"- 知识点：{', '.join(record['knowledge_points']) or '未识别'}",
                f"- GPT 结论：{record['answers']['gpt']['final_answer'] or '未提取'}",
                "",
            ])

    path.write_text("\n".join(lines), encoding="utf-8")


def write_readme(path: Path) -> None:
    path.write_text(
        """# 处理结果

- `question_bank.jsonl`：完整题库记录，一题一行。
- `rag_chunks.jsonl`：未来导入向量数据库的切片数据。
- `question_bank.sqlite`：SQLite 数据库，包含 questions / answer_versions / rag_chunks。
- `review_report.md`：结构缺失或知识点未识别、需要人工复核的题目列表。

`rag_chunks.embedding_json` 目前为空，后续可以用本地 embedding 模型或付费 API 补进去。
""",
        encoding="utf-8",
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build a local math exam question bank for RAG.")
    parser.add_argument("--input", required=True, help="Input folder containing one folder per question.")
    parser.add_argument("--manifest", help="Optional CSV manifest. If provided, it overrides folder discovery.")
    parser.add_argument("--output", default="data/processed", help="Output directory.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    input_dir = Path(args.input).resolve()
    output_dir = Path(args.output).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    if args.manifest:
        items = discover_from_manifest(Path(args.manifest).resolve())
    else:
        items = discover_from_folders(input_dir)

    if not items:
        raise SystemExit(f"No question folders found in {input_dir}")

    records = [build_record(item) for item in items]
    chunks = build_chunks(records)

    write_jsonl(output_dir / "question_bank.jsonl", records)
    write_jsonl(output_dir / "rag_chunks.jsonl", chunks)
    write_sqlite(output_dir / "question_bank.sqlite", records, chunks)
    write_review_report(output_dir / "review_report.md", records)
    write_readme(output_dir / "README.md")

    flagged = sum(1 for record in records if record["review_needed"])
    print(f"Processed questions: {len(records)}")
    print(f"RAG chunks: {len(chunks)}")
    print(f"Need review: {flagged}")
    print(f"Output: {output_dir}")


if __name__ == "__main__":
    main()
