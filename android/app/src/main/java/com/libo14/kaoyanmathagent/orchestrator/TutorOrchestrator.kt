package com.libo14.kaoyanmathagent.orchestrator

import android.net.Uri
import com.libo14.kaoyanmathagent.data.AppSettings
import com.libo14.kaoyanmathagent.data.LearningAssetDao
import com.libo14.kaoyanmathagent.data.LearningAssetEntity
import com.libo14.kaoyanmathagent.data.QuestionDao
import com.libo14.kaoyanmathagent.data.QuestionEntity
import com.libo14.kaoyanmathagent.data.ThreadDao
import com.libo14.kaoyanmathagent.data.ThreadEntity
import com.libo14.kaoyanmathagent.data.ThreadMessageEntity
import com.libo14.kaoyanmathagent.llm.OpenAiCompatibleClient
import com.libo14.kaoyanmathagent.llm.Prompts
import kotlin.math.max
import kotlin.math.roundToInt
import java.util.UUID

data class LocalQuestionMatch(
    val question: QuestionEntity,
    val kind: String
)

private const val MATCH_EXACT = "exact"
private const val MATCH_WEAK = "weak"
private const val MATCH_TEXT = "text"
private const val ASSET_THREAD_BUNDLE = "thread_bundle"
private const val TEN_MINUTES_MS = 10L * 60L * 1000L
private const val DAY_MS = 24L * 60L * 60L * 1000L

private data class ReviewSchedule(
    val mastery: Int,
    val reviewDueAt: Long,
    val reviewRepetitions: Int,
    val reviewIntervalDays: Int,
    val reviewEaseFactor: Double,
    val reviewLapses: Int
)

data class SolveResult(
    val threadId: String,
    val questionText: String,
    val answerMarkdown: String,
    val route: String,
    val localMatches: List<LocalQuestionMatch>,
    val localMatchSummary: String = ""
)

data class FollowUpResult(
    val threadId: String,
    val originalQuestion: String,
    val originalAnswer: String,
    val userQuestion: String,
    val followUpAnswer: String
)

data class SolveProgress(
    val stage: String,
    val questionPreview: String? = null
)

class TutorOrchestrator(
    private val questionDao: QuestionDao,
    private val assetDao: LearningAssetDao,
    private val threadDao: ThreadDao,
    private val llm: OpenAiCompatibleClient
) {
    suspend fun solve(
        settings: AppSettings,
        text: String,
        imageUri: Uri?,
        onProgress: (SolveProgress) -> Unit = {}
    ): SolveResult {
        require(settings.configured) { "请先配置主 API" }
        val recognized = if (imageUri != null) {
            onProgress(SolveProgress("识别题目中"))
            runCatching {
                llm.recognizeImage(settings.visionProfile.withFallbackKey(settings.main.apiKey), imageUri, text)
            }.getOrElse { error ->
                throw IllegalStateException("视觉识别失败：${friendlyModelError(error)}")
            }
        } else {
            ""
        }
        val questionText = listOf(recognized, text).filter { it.isNotBlank() }.joinToString("\n\n")
        val recognizedPreview = recognized.takeIf { it.isNotBlank() }
        onProgress(SolveProgress("检索本地题库", recognizedPreview))
        val local = retrieve(questionText)
        onProgress(SolveProgress("组织解题思路", recognizedPreview))
        onProgress(SolveProgress("生成完整解析", recognizedPreview))
        val rawAnswer = runCatching {
            llm.chat(
                profile = settings.main,
                messages = Prompts.solveWithLocalContext(questionText, localContext(local))
            )
        }.getOrElse { error ->
            throw IllegalStateException("主模型解析失败：${friendlyModelError(error)}")
        }
        val primaryMatch = local.firstOrNull()?.question
        val primaryStrongMatch = local.firstOrNull { it.kind != MATCH_WEAK }?.question
        val canonicalQuestion = cleanQuestionText(recognized
            .takeIf { it.isNotBlank() }
            ?: primaryStrongMatch?.problemText?.takeIf { it.isNotBlank() }
            ?: text)
        val answer = normalizeAnswerQuestionSection(rawAnswer, canonicalQuestion)
        val now = System.currentTimeMillis()
        val thread = ThreadEntity(
            id = UUID.randomUUID().toString(),
            title = titleFrom(questionText, primaryMatch),
            questionText = questionText,
            answerMarkdown = answer,
            sourceQuestionId = primaryMatch?.id,
            createdAt = now,
            updatedAt = now
        )
        threadDao.upsert(thread)
        threadDao.addMessage(ThreadMessageEntity(UUID.randomUUID().toString(), thread.id, "user", questionText, now))
        threadDao.addMessage(ThreadMessageEntity(UUID.randomUUID().toString(), thread.id, "assistant", answer, now + 1))
        return SolveResult(
            thread.id,
            questionText,
            answer,
            if (local.isEmpty()) "model" else "local_plus_model",
            local,
            summarizeLocalMatches(local)
        )
    }

    suspend fun followUp(settings: AppSettings, current: SolveResult?, userQuestion: String): FollowUpResult {
        require(settings.configured) { "请先配置主 API" }
        val base = current ?: error("请先完成一道题的解析，再继续追问")
        val existingThread = threadDao.findById(base.threadId)
        val followUpContext = followUpContext(base)
        val answer = runCatching {
            llm.chat(
                profile = settings.main,
                messages = Prompts.followUp(base.questionText, followUpContext, userQuestion),
                temperature = 0.3
            )
        }.getOrElse { error ->
            throw IllegalStateException("追问失败：${friendlyModelError(error)}")
        }
        val now = System.currentTimeMillis()
        threadDao.addMessage(ThreadMessageEntity(UUID.randomUUID().toString(), base.threadId, "user", userQuestion, now))
        threadDao.addMessage(ThreadMessageEntity(UUID.randomUUID().toString(), base.threadId, "assistant", answer, now + 1))
        threadDao.upsert(
            ThreadEntity(
                id = base.threadId,
                title = existingThread?.title ?: titleFrom(base.questionText, base.localMatches.firstOrNull()?.question),
                questionText = existingThread?.questionText ?: base.questionText,
                answerMarkdown = existingThread?.answerMarkdown ?: base.answerMarkdown,
                sourceQuestionId = existingThread?.sourceQuestionId ?: base.localMatches.firstOrNull()?.question?.id,
                createdAt = existingThread?.createdAt ?: now,
                updatedAt = now
            )
        )
        refreshThreadBundleIfExists(base.threadId, now)
        return FollowUpResult(
            threadId = base.threadId,
            originalQuestion = base.questionText,
            originalAnswer = base.answerMarkdown,
            userQuestion = userQuestion,
            followUpAnswer = answer
        )
    }

    suspend fun saveAsset(result: SolveResult, type: String, stage: String, favorite: Boolean = true) {
        val now = System.currentTimeMillis()
        assetDao.upsert(
            LearningAssetEntity(
                id = UUID.randomUUID().toString(),
                type = type,
                stage = stage,
                title = titleFrom(result.questionText, result.localMatches.firstOrNull()?.question),
                content = result.answerMarkdown,
                sourceQuestionId = result.localMatches.firstOrNull()?.question?.id,
                sourceThreadId = result.threadId,
                knowledgePoints = result.localMatches.firstOrNull()?.question?.knowledgePoints.orEmpty(),
                mastery = 0,
                favorite = favorite,
                reviewDueAt = now,
                createdAt = now,
                updatedAt = now
            )
        )
    }

    suspend fun saveThreadBundle(result: SolveResult, stage: String): LearningAssetEntity {
        val now = System.currentTimeMillis()
        val existingThread = threadDao.findById(result.threadId)
        if (existingThread == null) {
            threadDao.upsert(
                ThreadEntity(
                    id = result.threadId,
                    title = titleFrom(result.questionText, result.localMatches.firstOrNull()?.question),
                    questionText = result.questionText,
                    answerMarkdown = result.answerMarkdown,
                    sourceQuestionId = result.localMatches.firstOrNull()?.question?.id,
                    createdAt = now,
                    updatedAt = now
                )
            )
        }
        val thread = threadDao.findById(result.threadId)
        val existing = assetDao.findThreadBundle(result.threadId)
        val sourceQuestion = thread?.sourceQuestionId ?: result.localMatches.firstOrNull()?.question?.id
        val knowledge = result.localMatches.firstOrNull()?.question?.knowledgePoints.orEmpty()
        val item = existing?.copy(
            stage = existing.stage,
            title = thread?.title ?: existing.title,
            content = threadBundleMarkdown(
                threadId = result.threadId,
                fallbackQuestion = thread?.questionText ?: result.questionText,
                fallbackAnswer = thread?.answerMarkdown ?: result.answerMarkdown
            ),
            sourceQuestionId = sourceQuestion ?: existing.sourceQuestionId,
            sourceThreadId = result.threadId,
            knowledgePoints = knowledge.ifBlank { existing.knowledgePoints },
            favorite = true,
            reviewDueAt = now,
            updatedAt = now
        ) ?: LearningAssetEntity(
            id = UUID.randomUUID().toString(),
            type = ASSET_THREAD_BUNDLE,
            stage = stage,
            title = thread?.title ?: titleFrom(result.questionText, result.localMatches.firstOrNull()?.question),
            content = threadBundleMarkdown(
                threadId = result.threadId,
                fallbackQuestion = thread?.questionText ?: result.questionText,
                fallbackAnswer = thread?.answerMarkdown ?: result.answerMarkdown
            ),
            sourceQuestionId = sourceQuestion,
            sourceThreadId = result.threadId,
            knowledgePoints = knowledge,
            mastery = 0,
            favorite = true,
            reviewDueAt = now,
            createdAt = now,
            updatedAt = now
        )
        assetDao.upsert(item)
        return item
    }

    suspend fun threadBundle(threadId: String): LearningAssetEntity? =
        assetDao.findThreadBundle(threadId)

    suspend fun hub(stage: String): List<LearningAssetEntity> = assetDao.byStage(stage, 30)
    suspend fun hub(stage: String, filter: String): List<LearningAssetEntity> {
        val now = System.currentTimeMillis()
        return when (filter) {
            "due" -> assetDao.dueByStage(stage, now)
            "favorite" -> assetDao.favoritesByStage(stage)
            "review_card" -> assetDao.byStageAndType(stage, "review_card")
            "question" -> assetDao.byStageAndType(stage, "question")
            "thread_bundle" -> assetDao.byStageAndType(stage, ASSET_THREAD_BUNDLE)
            else -> assetDao.byStageAll(stage)
        }
    }

    suspend fun hubStats(stage: String): Triple<Int, Int, Int> {
        val now = System.currentTimeMillis()
        return Triple(
            assetDao.countByStage(stage),
            assetDao.countFavoritesByStage(stage),
            assetDao.countDueByStage(stage, now)
        )
    }

    suspend fun updateAssetStage(id: String, stage: String): LearningAssetEntity? {
        assetDao.updateStage(id, stage)
        return assetDao.findById(id)
    }

    suspend fun updateAssetFavorite(id: String, favorite: Boolean): LearningAssetEntity? {
        assetDao.updateFavorite(id, favorite)
        return assetDao.findById(id)
    }

    suspend fun reviewAsset(id: String, quality: Int): LearningAssetEntity? {
        val item = assetDao.findById(id) ?: return null
        val now = System.currentTimeMillis()
        val next = scheduleReview(item, quality, now)
        assetDao.updateReviewState(
            id = id,
            mastery = next.mastery,
            reviewDueAt = next.reviewDueAt,
            reviewRepetitions = next.reviewRepetitions,
            reviewIntervalDays = next.reviewIntervalDays,
            reviewEaseFactor = next.reviewEaseFactor,
            reviewLastAt = now,
            reviewLapses = next.reviewLapses,
            updatedAt = now
        )
        return assetDao.findById(id)
    }

    suspend fun favorites(query: String): List<LearningAssetEntity> =
        if (query.isBlank()) assetDao.all() else assetDao.search(query)

    private suspend fun refreshThreadBundleIfExists(threadId: String, now: Long): LearningAssetEntity? {
        val existing = assetDao.findThreadBundle(threadId) ?: return null
        val thread = threadDao.findById(threadId)
        val content = threadBundleMarkdown(
            threadId = threadId,
            fallbackQuestion = thread?.questionText ?: existing.title,
            fallbackAnswer = thread?.answerMarkdown ?: existing.content
        )
        val item = existing.copy(
            title = thread?.title ?: existing.title,
            content = content,
            sourceQuestionId = thread?.sourceQuestionId ?: existing.sourceQuestionId,
            sourceThreadId = threadId,
            favorite = true,
            reviewDueAt = now,
            updatedAt = now
        )
        assetDao.upsert(item)
        return item
    }

    private suspend fun followUpContext(base: SolveResult): String {
        val messages = threadDao.messages(base.threadId)
        if (messages.size <= 2) return base.answerMarkdown
        return buildString {
            append(base.answerMarkdown.trim())
            var followUpNo = 1
            messages.drop(2).forEach { message ->
                when (message.role) {
                    "user" -> append("\n\n【历史追问 $followUpNo】\n${message.content.trim()}")
                    "assistant" -> {
                        append("\n\n【历史回答 $followUpNo】\n${message.content.trim()}")
                        followUpNo += 1
                    }
                }
            }
        }.trim()
    }

    private suspend fun threadBundleMarkdown(
        threadId: String,
        fallbackQuestion: String,
        fallbackAnswer: String
    ): String {
        val messages = threadDao.messages(threadId)
        val userMessages = messages.filter { it.role == "user" }
        val assistantMessages = messages.filter { it.role == "assistant" }
        val question = userMessages.firstOrNull()?.content?.trim().orEmpty().ifBlank { fallbackQuestion.trim() }
        val firstAnswer = assistantMessages.firstOrNull()?.content?.trim().orEmpty().ifBlank { fallbackAnswer.trim() }
        return buildString {
            appendSection("原题", question)
            appendSection("第一次解析", firstAnswer)
            userMessages.drop(1).forEachIndexed { index, userMessage ->
                val number = index + 1
                appendSection("追问 $number", userMessage.content)
                appendSection("回答 $number", assistantMessages.drop(1).getOrNull(index)?.content.orEmpty())
            }
        }.trim()
    }

    private fun StringBuilder.appendSection(title: String, body: String) {
        val content = body.trim()
        if (content.isBlank()) return
        if (isNotEmpty()) append("\n\n")
        append("## ").append(title).append("\n\n").append(content)
    }

    private suspend fun retrieve(query: String): List<LocalQuestionMatch> {
        val (year, questionNo) = parseYearAndNo(query)
        val candidates = mutableListOf<LocalQuestionMatch>()
        if (year != null && questionNo != null) {
            val exact = questionDao.findByYearAndNo(year, questionNo)
            if (exact != null) candidates += LocalQuestionMatch(exact, MATCH_EXACT)
        } else if (questionNo != null) {
            candidates += questionDao.findByQuestionNo(questionNo, 3)
                .map { LocalQuestionMatch(it, MATCH_WEAK) }
        }
        val normalized = normalizeQuery(query)
        if (normalized.isNotBlank()) {
            candidates += questionDao.search(normalized.take(80), 5)
                .map { LocalQuestionMatch(it, MATCH_TEXT) }
        }
        return candidates.distinctBy { it.question.id }.take(5)
    }

    private fun parseYearAndNo(query: String): Pair<Int?, Int?> {
        val year = Regex("(20\\d{2}|19\\d{2}|\\b\\d{2}\\b)\\s*年?").find(query)?.value
            ?.filter { it.isDigit() }?.toIntOrNull()?.let { if (it < 100) 2000 + it else it }
        val no = Regex("第?\\s*(\\d{1,2}|一|二|三|四|五|六|七|八|九|十)\\s*题").find(query)
            ?.groupValues?.getOrNull(1)?.let { chineseNo(it) }
        return year to no
    }

    private fun chineseNo(value: String): Int? = when (value) {
        "一" -> 1; "二" -> 2; "三" -> 3; "四" -> 4; "五" -> 5
        "六" -> 6; "七" -> 7; "八" -> 8; "九" -> 9; "十" -> 10
        else -> value.toIntOrNull()
    }

    private fun normalizeQuery(value: String): String =
        value.replace("第一题", "第1题")
            .replace("第二题", "第2题")
            .replace("第三题", "第3题")
            .replace("第四题", "第4题")
            .replace("第五题", "第5题")

    private fun localContext(matches: List<LocalQuestionMatch>): String =
        if (matches.isEmpty()) "未命中本地题库。"
        else matches.joinToString("\n\n") { match ->
            val item = match.question
            val matchNote = when (match.kind) {
                MATCH_EXACT -> "匹配类型：强匹配（年份和题号均确认）。"
                MATCH_WEAK -> "匹配类型：弱匹配（只识别到题号，年份未确认）。请谨慎引用，不能把它当成确定原题。"
                else -> "匹配类型：文本相似匹配。"
            }
            "【${item.title}】\n$matchNote\n原题：${item.problemText}\n知识点：${item.knowledgePoints}\n${item.answerMarkdown.take(2500)}"
        }

    private fun titleFrom(question: String, match: QuestionEntity?): String =
        match?.title ?: question.lineSequence().firstOrNull()?.take(30)?.ifBlank { "数学题解析" } ?: "数学题解析"

    private fun summarizeLocalMatches(matches: List<LocalQuestionMatch>): String =
        when {
            matches.isEmpty() -> "未命中本地题库"
            matches.any { it.kind == MATCH_EXACT } -> "本地题库强匹配"
            matches.any { it.kind == MATCH_WEAK } -> "本地题库弱匹配 · 年份未确认"
            else -> "本地题库文本相似匹配"
        }

    private fun scheduleReview(item: LearningAssetEntity, qualityInput: Int, now: Long): ReviewSchedule {
        val quality = qualityInput.coerceIn(0, 5)
        val currentEase = item.reviewEaseFactor.takeIf { it >= 1.3 } ?: 2.5
        if (quality < 3) {
            val ease = max(1.3, currentEase - 0.2)
            return ReviewSchedule(
                mastery = 0,
                reviewDueAt = now + TEN_MINUTES_MS,
                reviewRepetitions = 0,
                reviewIntervalDays = 0,
                reviewEaseFactor = ease,
                reviewLapses = item.reviewLapses + 1
            )
        }

        val repetitions = item.reviewRepetitions + 1
        val easeDelta = 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)
        val ease = max(1.3, currentEase + easeDelta)
        val intervalDays = when {
            quality == 3 -> max(1, (item.reviewIntervalDays * 1.2).roundToInt())
            repetitions == 1 -> 1
            repetitions == 2 -> 3
            else -> max(1, (item.reviewIntervalDays * ease).roundToInt())
        }
        return ReviewSchedule(
            mastery = if (quality >= 5) 100 else 60,
            reviewDueAt = now + intervalDays * DAY_MS,
            reviewRepetitions = repetitions,
            reviewIntervalDays = intervalDays,
            reviewEaseFactor = ease,
            reviewLapses = item.reviewLapses
        )
    }

    private fun normalizeAnswerQuestionSection(answer: String, sourceQuestion: String): String {
        val question = cleanQuestionText(sourceQuestion)
        if (question.isBlank()) return answer
        val fixedQuestionSection = "## 题目识别\n\n$question"
        val questionSections = questionSectionRegex().findAll(answer)
            .mapNotNull { it.groupValues.getOrNull(2)?.trim() }
            .toList()
        val answerWithoutQuestion = removeQuestionSections(answer).trim()
        val withQuestion = "$fixedQuestionSection\n\n$answerWithoutQuestion"
        val movedIntro = questionSections
            .firstOrNull { it.isNotBlank() && cleanQuestionText(it) != question && looksLikeQuestionIntro(it) }
            ?: return withQuestion
        val knowledge = sectionContent(withQuestion, "涉及知识点")
        val addition = "本题定位：$movedIntro"
        return if (knowledge == null) {
            withQuestion.replace(fixedQuestionSection, "$fixedQuestionSection\n\n## 涉及知识点\n\n$addition")
        } else {
            replaceSection(withQuestion, "涉及知识点", "$addition\n\n$knowledge")
        }
    }

    private fun sectionContent(markdown: String, title: String): String? {
        val match = sectionRegex(title).find(markdown) ?: return null
        return match.groupValues.getOrNull(1)?.trim()
    }

    private fun replaceSection(markdown: String, title: String, replacement: String): String =
        sectionRegex(title).find(markdown)?.let { match ->
            markdown.replaceRange(match.range, "\n## $title\n\n${replacement.trim()}\n\n")
        } ?: markdown

    private fun sectionRegex(title: String): Regex =
        Regex("(?s)(?:^|\\n)#{1,4}\\s*$title\\s*\\n(.*?)(?=\\n#{1,4}\\s+|\\z)")

    private fun questionSectionRegex(): Regex =
        Regex("(?s)(?:^|\\n)#{1,4}\\s*(题目识别|完整题目|题目|原题|题干)\\s*[:：]?\\s*\\n(.*?)(?=\\n#{1,4}\\s+|\\z)")

    private fun removeQuestionSections(markdown: String): String =
        questionSectionRegex().replace(markdown, "\n").trim()

    private fun looksLikeQuestionIntro(value: String): Boolean {
        val text = value.trim()
        if (text.length < 12) return false
        val markers = listOf("这是一道", "本题", "主要考查", "考查", "题型", "要求判断", "要求证明", "给出了", "关于")
        return markers.any { text.contains(it) }
    }

    private fun cleanQuestionText(value: String): String =
        value.lineSequence()
            .map { it.trim() }
            .filterNot { line ->
                line.isBlank() ||
                    line == "```" ||
                    line.startsWith("```") ||
                    Regex("""^#{1,6}\s*(题目识别|完整题目|题目|原题|题干)\s*[:：]?\s*$""").matches(line) ||
                    Regex("""^(题目识别|完整题目|原题|题干)\s*[:：]\s*$""").matches(line) ||
                    line.startsWith("以下是") ||
                    line.startsWith("图片中的题目")
            }
            .map { line ->
                line
                    .replace(Regex("""^#{1,6}\s*"""), "")
                    .replace(Regex("""^(题目识别|完整题目|原题|题干)\s*[:：]\s*"""), "")
            }
            .joinToString("\n")
            .trim()

    private fun friendlyModelError(error: Throwable): String {
        val message = error.message.orEmpty()
        return when {
            message.contains("timeout", ignoreCase = true) -> "网络超时，请检查网络或稍后重试。"
            message.contains("Unable to resolve host", ignoreCase = true) -> "网络不可用或 API 地址无法访问。"
            message.contains("401") || message.contains("unauthorized", ignoreCase = true) -> "API Key 无效或没有权限。"
            message.contains("403") || message.contains("disabled", ignoreCase = true) -> "模型不可用或账号没有调用权限。"
            message.contains("404") -> "API 地址或模型名称可能填写错误。"
            message.contains("429") -> "请求过快或额度不足。"
            message.contains("图片读取失败") ||
                message.contains("图片文件过大") ||
                message.contains("图片解码失败") ||
                message.contains("图片压缩后仍然过大") -> message
            message.contains("image", ignoreCase = true) || message.contains("图片") -> "当前视觉模型可能不支持图片输入。"
            message.isNotBlank() -> message.take(240)
            else -> "未知错误。"
        }
    }
}

private fun com.libo14.kaoyanmathagent.data.ApiProfile.withFallbackKey(mainKey: String) =
    if (apiKey.isBlank()) copy(apiKey = mainKey) else this
