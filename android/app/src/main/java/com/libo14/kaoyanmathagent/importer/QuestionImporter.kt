package com.libo14.kaoyanmathagent.importer

import android.content.Context
import android.net.Uri
import com.libo14.kaoyanmathagent.data.QuestionEntity
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.util.Locale

class QuestionImporter(private val context: Context) {
    fun loadBundledQuestions(): List<QuestionEntity> =
        context.assets.open("question_bank.jsonl").use { input ->
            BufferedReader(InputStreamReader(input)).lineSequence()
                .mapNotNull { parseJsonLine(it) }
                .toList()
        }

    fun importFromUri(uri: Uri): List<QuestionEntity> {
        val name = queryName(uri).lowercase(Locale.ROOT)
        val text = context.contentResolver.openInputStream(uri)?.bufferedReader()?.use { it.readText() }.orEmpty()
        return when {
            name.endsWith(".jsonl") -> text.lineSequence().mapNotNull { parseJsonLine(it) }.toList()
            name.endsWith(".json") -> parseJsonArrayOrSingle(text)
            name.endsWith(".md") || name.endsWith(".txt") -> parseMarkdown(text, name)
            else -> parseMarkdown(text, name)
        }
    }

    private fun parseJsonArrayOrSingle(text: String): List<QuestionEntity> = runCatching {
        val trimmed = text.trim()
        if (trimmed.startsWith("[")) {
            val arr = org.json.JSONArray(trimmed)
            (0 until arr.length()).mapNotNull { parseQuestionObject(arr.getJSONObject(it)) }
        } else {
            listOfNotNull(parseQuestionObject(JSONObject(trimmed)))
        }
    }.getOrDefault(emptyList())

    private fun parseJsonLine(line: String): QuestionEntity? = runCatching {
        parseQuestionObject(JSONObject(line))
    }.getOrNull()

    private fun parseQuestionObject(obj: JSONObject): QuestionEntity? {
        val id = obj.optString("id").ifBlank { return null }
        val metadata = obj.optJSONObject("metadata")
        val answers = obj.optJSONObject("answers")
        val gpt = answers?.optJSONObject("gpt")
        val raw = gpt?.optString("raw").orEmpty()
        val sections = gpt?.optJSONObject("sections")
        val intro = sections?.optString("intro").orEmpty()
        val problem = obj.optString("problem_text").ifBlank { intro }
        val knowledge = obj.optJSONArray("knowledge_points")?.let { arr ->
            (0 until arr.length()).joinToString("，") { arr.optString(it) }
        }.orEmpty()
        val year = metadata?.optInt("year")?.takeIf { it > 0 }
        val no = metadata?.optInt("question_no")?.takeIf { it > 0 }
        val title = buildString {
            if (year != null) append("${year}年")
            append(metadata?.optString("subject").orEmpty().ifBlank { "数学一" })
            if (no != null) append("第${no}题")
        }.ifBlank { id }
        val search = listOf(title, problem, knowledge, raw).joinToString("\n")
        return QuestionEntity(
            id = id,
            year = year,
            subject = metadata?.optString("subject").orEmpty().ifBlank { "数一" },
            questionNo = no,
            type = metadata?.optString("type").orEmpty(),
            title = title,
            problemText = problem,
            knowledgePoints = knowledge,
            answerMarkdown = raw,
            searchText = normalizeSearchText(search)
        )
    }

    private fun parseMarkdown(text: String, fileName: String): List<QuestionEntity> {
        val year = Regex("(20\\d{2}|19\\d{2})").find(fileName)?.value?.toIntOrNull()
        val blocks = Regex("(?m)^#\\s*第\\s*(\\d+)\\s*题").findAll(text).toList()
        if (blocks.isEmpty()) {
            return listOf(markdownEntity(text, fileName, year, null))
        }
        return blocks.mapIndexed { index, match ->
            val start = match.range.first
            val end = blocks.getOrNull(index + 1)?.range?.first ?: text.length
            val no = match.groupValues[1].toIntOrNull()
            markdownEntity(text.substring(start, end).trim(), fileName, year, no)
        }
    }

    private fun markdownEntity(block: String, fileName: String, year: Int?, no: Int?): QuestionEntity {
        val id = "${year ?: "custom"}_math1_${no ?: System.currentTimeMillis()}_${block.hashCode().toString(16)}"
        val title = when {
            year != null && no != null -> "${year}年数学一第${no}题"
            year != null -> "${year}年导入资料"
            else -> fileName.ifBlank { "导入资料" }
        }
        val knowledge = Regex("(?s)##\\s*涉及知识点\\s*(.*?)(?=\\n##\\s*)")
            .find(block)?.groupValues?.getOrNull(1)?.trim().orEmpty()
        return QuestionEntity(
            id = id,
            year = year,
            subject = "数一",
            questionNo = no,
            type = "",
            title = title,
            problemText = Regex("(?s)##\\s*题目识别\\s*(.*?)(?=\\n##\\s*)")
                .find(block)?.groupValues?.getOrNull(1)?.trim().orEmpty(),
            knowledgePoints = knowledge,
            answerMarkdown = block,
            searchText = normalizeSearchText("$title\n$knowledge\n$block")
        )
    }

    private fun normalizeSearchText(value: String): String =
        value.lowercase(Locale.ROOT)
            .replace("第一题", "第1题")
            .replace("第二题", "第2题")
            .replace("第三题", "第3题")
            .replace("第四题", "第4题")
            .replace("第五题", "第5题")
            .replace("第六题", "第6题")
            .replace("第七题", "第7题")
            .replace("第八题", "第8题")
            .replace("第九题", "第9题")
            .replace("第十题", "第10题")

    private fun queryName(uri: Uri): String =
        context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
            val index = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
            if (index >= 0 && cursor.moveToFirst()) cursor.getString(index) else null
        } ?: uri.lastPathSegment.orEmpty()
}
