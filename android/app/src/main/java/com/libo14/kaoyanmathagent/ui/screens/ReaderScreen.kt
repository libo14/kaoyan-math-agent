package com.libo14.kaoyanmathagent.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.libo14.kaoyanmathagent.data.LearningAssetEntity
import com.libo14.kaoyanmathagent.orchestrator.FollowUpResult
import com.libo14.kaoyanmathagent.orchestrator.SolveResult
import com.libo14.kaoyanmathagent.ui.AppUiState
import com.libo14.kaoyanmathagent.ui.AppViewModel
import com.libo14.kaoyanmathagent.ui.ReaderSource
import com.libo14.kaoyanmathagent.ui.components.Card
import com.libo14.kaoyanmathagent.ui.components.Chip
import com.libo14.kaoyanmathagent.ui.components.Ink
import com.libo14.kaoyanmathagent.ui.components.Line
import com.libo14.kaoyanmathagent.ui.components.Muted
import com.libo14.kaoyanmathagent.ui.components.Paper
import com.libo14.kaoyanmathagent.ui.components.ReadingAction
import com.libo14.kaoyanmathagent.ui.render.AnswerSection
import com.libo14.kaoyanmathagent.ui.render.ArticleWebView
import com.libo14.kaoyanmathagent.ui.render.ArticleWebViewController
import com.libo14.kaoyanmathagent.ui.render.parseStructuredAnswer
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.roundToInt

@Composable
fun ReaderScreen(
    state: AppUiState,
    actions: AppViewModel,
    openGallery: () -> Unit
) {
    if (state.readerSource == ReaderSource.FollowUp) {
        FollowUpReaderScreen(state, actions)
        return
    }
    val content = readerContent(state) ?: return
    val webViewController = remember { ArticleWebViewController() }
    val sections = remember(content.markdown) { parseStructuredAnswer(content.markdown) }
    var quickRailExpanded by remember { mutableStateOf(false) }
    Column(
        Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .navigationBarsPadding()
            .background(Paper)
            .padding(horizontal = 14.dp, vertical = 10.dp)
    ) {
        ReaderTopBar(state, content.title, actions)
        Spacer(Modifier.height(10.dp))
        ReaderActions(state, actions, openGallery)
        Spacer(Modifier.height(10.dp))
        if (content.meta.isNotBlank()) {
            Column(
                Modifier
                    .fillMaxWidth()
                    .background(Card, RoundedCornerShape(20.dp))
                    .border(1.dp, Line, RoundedCornerShape(20.dp))
                    .padding(14.dp)
            ) {
                Text(content.title, color = Ink, fontSize = 18.sp, fontWeight = FontWeight.Medium, lineHeight = 25.sp)
                Spacer(Modifier.height(6.dp))
                Text(content.meta, color = Muted, fontSize = 12.sp, lineHeight = 18.sp)
            }
            Spacer(Modifier.height(10.dp))
        }
        Box(
            Modifier
                .fillMaxWidth()
                .weight(1f)
                .background(Card, RoundedCornerShape(24.dp))
                .border(1.dp, Line, RoundedCornerShape(24.dp))
                .padding(horizontal = 16.dp, vertical = 14.dp)
        ) {
            ArticleWebView(
                markdown = content.markdown,
                structured = sections.isNotEmpty(),
                controller = webViewController
            )
            ReaderQuickRail(
                expanded = quickRailExpanded,
                sections = sections,
                state = state,
                actions = actions,
                onToggle = { quickRailExpanded = !quickRailExpanded },
                onDismiss = { quickRailExpanded = false },
                onJump = { section ->
                    webViewController.jumpTo(section.anchor)
                    quickRailExpanded = false
                }
            )
        }
    }
}

@Composable
private fun ReaderTopBar(state: AppUiState, title: String, actions: AppViewModel) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        TextButton(onClick = actions::closeReader, contentPadding = PaddingValues(horizontal = 0.dp, vertical = 4.dp)) {
            Text("返回", color = Ink)
        }
        Spacer(Modifier.width(8.dp))
        Column(Modifier.weight(1f)) {
            Text(
                when (state.readerSource) {
                    ReaderSource.Asset -> "资料详情"
                    ReaderSource.FollowUp -> "追问结果"
                    else -> "解析结果"
                },
                fontFamily = FontFamily.Serif,
                fontSize = 25.sp,
                color = Ink
            )
            Text(title.take(32), color = Muted, fontSize = 12.sp, maxLines = 1)
        }
        Chip(state.status.ifBlank { if (state.readerSource == ReaderSource.Asset) "中枢资料" else "阅读模式" })
    }
}

@Composable
private fun FollowUpReaderScreen(state: AppUiState, actions: AppViewModel) {
    val followUp = state.currentFollowUp ?: return
    var contextExpanded by remember { mutableStateOf(false) }
    val answerStructured = remember(followUp.followUpAnswer) {
        parseStructuredAnswer(followUp.followUpAnswer).isNotEmpty()
    }
    Column(
        Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .navigationBarsPadding()
            .background(Paper)
            .padding(horizontal = 14.dp, vertical = 10.dp)
    ) {
        ReaderTopBar(state, safeReaderTitle(followUp.originalQuestion), actions)
        Spacer(Modifier.height(10.dp))
        LazyRow {
            item { ReadingAction("继续追问") { actions.continueFollowUp() } }
            item { ReadingAction(threadBundleActionLabel(state)) { actions.saveCurrentThreadBundle("foundation") } }
            item { ReadingAction("返回原解析") { actions.closeReader() } }
        }
        Spacer(Modifier.height(8.dp))
        FollowUpContextToggle(
            expanded = contextExpanded,
            onToggle = { contextExpanded = !contextExpanded }
        )
        if (contextExpanded) {
            Spacer(Modifier.height(8.dp))
            FollowUpOriginalContext(
                question = followUp.originalQuestion,
                answer = followUp.originalAnswer
            )
        }
        Spacer(Modifier.height(10.dp))
        FollowUpQuestionBlock(followUp.userQuestion)
        Spacer(Modifier.height(10.dp))
        FollowUpAnswerBlock(
            answer = followUp.followUpAnswer,
            structured = answerStructured,
            modifier = Modifier.weight(1f)
        )
    }
}

@Composable
private fun FollowUpContextToggle(
    expanded: Boolean,
    onToggle: () -> Unit
) {
    Row(
        Modifier
            .fillMaxWidth()
            .height(42.dp)
            .background(Card.copy(alpha = 0.52f), RoundedCornerShape(12.dp))
            .border(1.dp, Line.copy(alpha = 0.62f), RoundedCornerShape(12.dp))
            .clickable(onClick = onToggle)
            .padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(if (expanded) "▼" else "▶", color = Muted, fontSize = 12.sp)
        Spacer(Modifier.width(8.dp))
        Text("原题与原答案", color = Ink, fontSize = 14.sp, modifier = Modifier.weight(1f))
        Text(if (expanded) "收起" else "展开", color = Muted, fontSize = 13.sp)
    }
}

@Composable
private fun FollowUpOriginalContext(
    question: String,
    answer: String
) {
    Column(
        Modifier
            .fillMaxWidth()
            .background(Card.copy(alpha = 0.78f), RoundedCornerShape(16.dp))
            .border(1.dp, Line.copy(alpha = 0.72f), RoundedCornerShape(16.dp))
            .padding(horizontal = 14.dp, vertical = 12.dp)
    ) {
        Text("原题", color = Ink, fontFamily = FontFamily.Serif, fontSize = 18.sp)
        Spacer(Modifier.height(6.dp))
        Text(
            question.ifBlank { "暂无原题记录" },
            color = Ink,
            fontSize = 15.sp,
            lineHeight = 23.sp
        )
        Spacer(Modifier.height(12.dp))
        Text("原答案", color = Ink, fontFamily = FontFamily.Serif, fontSize = 18.sp)
        Spacer(Modifier.height(6.dp))
        Box(Modifier.fillMaxWidth().height(230.dp)) {
            ArticleWebView(
                markdown = answer.ifBlank { "暂无原答案记录" },
                modifier = Modifier.fillMaxSize(),
                structured = parseStructuredAnswer(answer).isNotEmpty(),
                hiddenUntilRendered = true
            )
        }
    }
}

@Composable
private fun FollowUpQuestionBlock(question: String) {
    Column(
        Modifier
            .fillMaxWidth()
            .background(Card.copy(alpha = 0.7f), RoundedCornerShape(14.dp))
            .border(1.dp, Line.copy(alpha = 0.68f), RoundedCornerShape(14.dp))
            .padding(horizontal = 14.dp, vertical = 11.dp)
    ) {
        Text("我的问题", color = Muted, fontSize = 12.sp)
        Spacer(Modifier.height(5.dp))
        Text(
            question.ifBlank { "本次追问内容未记录" },
            color = Ink,
            fontSize = 16.sp,
            lineHeight = 24.sp
        )
    }
}

@Composable
private fun FollowUpAnswerBlock(
    answer: String,
    structured: Boolean,
    modifier: Modifier = Modifier
) {
    Column(
        modifier
            .fillMaxWidth()
            .background(Card, RoundedCornerShape(18.dp))
            .border(1.dp, Line.copy(alpha = 0.8f), RoundedCornerShape(18.dp))
            .padding(horizontal = 14.dp, vertical = 12.dp)
    ) {
        Text("追问回答", color = Ink, fontFamily = FontFamily.Serif, fontSize = 20.sp)
        Spacer(Modifier.height(8.dp))
        ArticleWebView(
            markdown = answer,
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f),
            structured = structured,
            hiddenUntilRendered = true
        )
    }
}

@Composable
private fun ReaderActions(state: AppUiState, actions: AppViewModel, openGallery: () -> Unit) {
    LazyRow {
        if (state.readerSource == ReaderSource.Asset) {
            item { ReadingAction("继续追问") { actions.continueWithSelectedAsset() } }
            item { ReadingAction("加入基础") { actions.updateSelectedAssetStage("foundation") } }
            item { ReadingAction("加入强化") { actions.updateSelectedAssetStage("intensive") } }
            item { ReadingAction(if (state.selectedAsset?.favorite == true) "取消收藏" else "收藏") { actions.toggleSelectedAssetFavorite() } }
            state.selectedAsset?.let { asset ->
                item { ReadingAction("忘了") { actions.reviewAsset(asset.id, 1) } }
                item { ReadingAction("模糊") { actions.reviewAsset(asset.id, 3) } }
                item { ReadingAction("掌握") { actions.reviewAsset(asset.id, 5) } }
            }
        } else {
            item { ReadingAction("追问") { actions.continueFollowUp() } }
            item { ReadingAction(threadBundleActionLabel(state)) { actions.saveCurrentThreadBundle("foundation") } }
            item { ReadingAction("改题") { actions.editCurrentQuestion() } }
            item {
                ReadingAction("重传") {
                    actions.startNewQuestion()
                    openGallery()
                }
            }
            item { ReadingAction("基础") { actions.saveCurrent("foundation", "question") } }
            item { ReadingAction("强化") { actions.saveCurrent("intensive", "question") } }
            item { ReadingAction("复习卡") { actions.saveCurrent("foundation", "review_card") } }
            item { ReadingAction("收藏") { actions.saveCurrent("foundation", "favorite") } }
        }
    }
}

@Composable
private fun ReaderQuickRail(
    expanded: Boolean,
    sections: List<AnswerSection>,
    state: AppUiState,
    actions: AppViewModel,
    onToggle: () -> Unit,
    onDismiss: () -> Unit,
    onJump: (AnswerSection) -> Unit
) {
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val density = LocalDensity.current
        val handleHeightPx = with(density) { 96.dp.toPx() }
        val maxOffsetPx = with(density) { maxHeight.toPx() - handleHeightPx - 24.dp.toPx() }.coerceAtLeast(0f)
        var handleOffsetY by remember { mutableStateOf(0f) }
        val resolvedOffsetY = handleOffsetY.coerceIn(-maxOffsetPx / 2f, maxOffsetPx / 2f)

        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.CenterStart) {
            if (expanded) {
                Box(
                    Modifier
                        .fillMaxSize()
                        .clickable(onClick = onDismiss)
                )
                ReaderQuickPanel(
                    sections = sections,
                    state = state,
                    actions = actions,
                    onJump = onJump,
                    modifier = Modifier
                        .align(Alignment.CenterStart)
                        .offset { IntOffset(28.dp.roundToPx(), resolvedOffsetY.roundToInt()) }
                )
            }
            ReaderFloatingHandle(
                onToggle = onToggle,
                onDrag = { delta ->
                    handleOffsetY = (handleOffsetY + delta).coerceIn(-maxOffsetPx / 2f, maxOffsetPx / 2f)
                },
                modifier = Modifier
                    .align(Alignment.CenterStart)
                    .offset { IntOffset((-7).dp.roundToPx(), resolvedOffsetY.roundToInt()) }
            )
        }
    }
}

@Composable
private fun ReaderQuickPanel(
    sections: List<AnswerSection>,
    state: AppUiState,
    actions: AppViewModel,
    onJump: (AnswerSection) -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier
            .width(184.dp)
            .shadow(10.dp, RoundedCornerShape(18.dp))
            .background(Card.copy(alpha = 0.94f), RoundedCornerShape(18.dp))
            .border(1.dp, Line, RoundedCornerShape(18.dp))
            .padding(horizontal = 14.dp, vertical = 14.dp)
    ) {
        Text("目录", color = Ink, fontFamily = FontFamily.Serif, fontSize = 20.sp)
        Spacer(Modifier.height(8.dp))
        if (sections.isEmpty()) {
            Text("当前资料暂无标准分区", color = Muted, fontSize = 12.sp, lineHeight = 18.sp)
        } else {
            sections.forEach { section ->
                QuickRailItem(section.title) { onJump(section) }
            }
        }
        Spacer(Modifier.height(10.dp))
        Text("操作", color = Muted, fontSize = 12.sp)
        Spacer(Modifier.height(4.dp))
        if (state.readerSource == ReaderSource.Asset) {
            QuickRailItem("继续追问") { actions.continueWithSelectedAsset() }
            QuickRailItem("加入基础") { actions.updateSelectedAssetStage("foundation") }
            QuickRailItem("加入强化") { actions.updateSelectedAssetStage("intensive") }
            QuickRailItem(if (state.selectedAsset?.favorite == true) "取消收藏" else "收藏") {
                actions.toggleSelectedAssetFavorite()
            }
            state.selectedAsset?.let { asset ->
                QuickRailItem("忘了") { actions.reviewAsset(asset.id, 1) }
                QuickRailItem("模糊") { actions.reviewAsset(asset.id, 3) }
                QuickRailItem("掌握") { actions.reviewAsset(asset.id, 5) }
            }
        } else {
            QuickRailItem("追问") { actions.continueFollowUp() }
            QuickRailItem(threadBundleActionLabel(state)) { actions.saveCurrentThreadBundle("foundation") }
            QuickRailItem("加入基础") { actions.saveCurrent("foundation", "question") }
            QuickRailItem("加入强化") { actions.saveCurrent("intensive", "question") }
            QuickRailItem("复习卡") { actions.saveCurrent("foundation", "review_card") }
            QuickRailItem("收藏") { actions.saveCurrent("foundation", "favorite") }
        }
    }
}

@Composable
private fun ReaderFloatingHandle(
    onToggle: () -> Unit,
    onDrag: (Float) -> Unit,
    modifier: Modifier = Modifier
) {
    Box(
        modifier
            .width(38.dp)
            .height(38.dp)
            .shadow(7.dp, CircleShape)
            .background(androidx.compose.ui.graphics.Color(0xFFEBD99A).copy(alpha = 0.58f), CircleShape)
            .border(1.dp, Line.copy(alpha = 0.86f), CircleShape)
            .pointerInput(Unit) {
                detectDragGestures(
                    onDrag = { change, dragAmount ->
                        change.consume()
                        onDrag(dragAmount.y)
                    }
                )
            }
            .clickable(onClick = onToggle),
        contentAlignment = Alignment.Center
    ) {
        Text("⋯", color = Ink.copy(alpha = 0.72f), fontSize = 24.sp)
    }
}

@Composable
private fun QuickRailItem(text: String, onClick: () -> Unit) {
    Box(
        Modifier
            .fillMaxWidth()
            .height(34.dp)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.CenterStart
    ) {
        Text(text, color = Ink, fontSize = 14.sp, maxLines = 1)
    }
}

private data class ReaderContent(
    val title: String,
    val meta: String,
    val markdown: String
)

private fun readerContent(state: AppUiState): ReaderContent? =
    when (state.readerSource) {
        ReaderSource.Asset -> state.selectedAsset?.toReaderContent()
        ReaderSource.FollowUp -> null
        else -> state.currentResult?.toReaderContent()
    }

private fun LearningAssetEntity.toReaderContent(): ReaderContent =
    ReaderContent(
        title = safeReaderTitle(title),
        meta = "${stageLabel(stage)} · ${assetTypeLabel(type)} · ${reviewStatusText(this)} · ${formatDate(updatedAt)}${if (favorite) " · 已收藏" else ""}",
        markdown = content
    )

private fun SolveResult.toReaderContent(): ReaderContent =
    ReaderContent(
        title = safeReaderTitle(questionText),
        meta = if (route == "local_plus_model") {
            listOf("本地题库 + 模型解析", localMatchSummary).filter { it.isNotBlank() }.joinToString(" · ")
        } else {
            "模型解析"
        },
        markdown = answerMarkdown
    )

private fun safeReaderTitle(value: String): String {
    val firstLine = value.lineSequence()
        .map { it.trim() }
        .firstOrNull { it.isNotBlank() }
        .orEmpty()
        .removePrefix("#")
        .trim()
    val number = Regex("""^[（(]?\s*(\d{1,2})\s*[)）.、]?""").find(firstLine)
        ?.groupValues
        ?.getOrNull(1)
        ?.toIntOrNull()
    if (number != null) return "第 ${number} 题"
    val cleaned = firstLine
        .replace(Regex("""\\\((.*?)\\\)"""), "公式")
        .replace(Regex("""\\\[(.*?)\\]"""), "公式")
        .replace(Regex("""\$\$(.*?)\$\$"""), "公式")
        .replace(Regex("""\$(.*?)\$"""), "公式")
        .replace(Regex("""[#*_`>{}\[\]]"""), "")
        .replace(Regex("""\\[A-Za-z]+"""), "公式")
        .replace(Regex("""\s+"""), " ")
        .trim()
    return cleaned.take(36).ifBlank { "数学题解析" }
}

private fun stageLabel(stage: String): String = when (stage) {
    "foundation" -> "基础"
    "intensive" -> "强化"
    else -> "未分阶段"
}

private fun assetTypeLabel(type: String): String = when (type) {
    "knowledge" -> "知识点"
    "question" -> "题目"
    "review_card" -> "复习卡"
    "thread_bundle" -> "追问合集"
    "similar_question" -> "同类题"
    else -> "资料"
}

private fun threadBundleActionLabel(state: AppUiState): String =
    if (state.currentThreadBundle != null) "已收藏整段" else "一键收藏整段"

private fun formatDate(value: Long): String =
    SimpleDateFormat("yyyy/MM/dd HH:mm", Locale.getDefault()).format(Date(value))

private fun reviewStatusText(item: LearningAssetEntity): String {
    val due = if (item.reviewDueAt <= System.currentTimeMillis()) "今日复习" else "下次 ${formatDate(item.reviewDueAt)}"
    val mastery = when {
        item.mastery >= 90 -> "已掌握"
        item.mastery >= 50 -> "待巩固"
        else -> "薄弱"
    }
    return "$due · $mastery · ${item.reviewIntervalDays}天间隔"
}
