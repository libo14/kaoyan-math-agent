package com.libo14.kaoyanmathagent.ui.screens

import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.libo14.kaoyanmathagent.ui.AppUiState
import com.libo14.kaoyanmathagent.ui.AppViewModel
import com.libo14.kaoyanmathagent.ui.ComposerMode
import com.libo14.kaoyanmathagent.ui.components.Card
import com.libo14.kaoyanmathagent.ui.components.Ink
import com.libo14.kaoyanmathagent.ui.components.Line
import com.libo14.kaoyanmathagent.ui.components.Muted
import com.libo14.kaoyanmathagent.ui.components.Paper
import com.libo14.kaoyanmathagent.ui.components.SurfaceCard
import com.libo14.kaoyanmathagent.ui.components.Soft
import com.libo14.kaoyanmathagent.ui.render.ArticleWebView

private val processingSteps = listOf("识别题目", "检索本地题库", "组织解题思路", "生成完整解析", "渲染公式")
private val processingHints = listOf(
    "正在把关键条件整理成解题入口。",
    "正在匹配本地同类题与知识点。",
    "正在生成完整过程和易错提醒。",
    "正在准备适合复习的结构化答案。"
)

@Composable
fun ProcessingScreen(state: AppUiState, actions: AppViewModel) {
    val error = state.errorMessage
    val activeIndex = processingStepIndex(state.status)
    val progress by animateFloatAsState(
        targetValue = activeIndex.toFloat(),
        animationSpec = tween(durationMillis = 420),
        label = "route-progress"
    )
    val infinite = rememberInfiniteTransition(label = "processing-loop")
    val pulse by infinite.animateFloat(
        initialValue = 0.88f,
        targetValue = 1.16f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1150),
            repeatMode = RepeatMode.Reverse
        ),
        label = "active-dot-pulse"
    )
    val hintPhase by infinite.animateFloat(
        initialValue = 0f,
        targetValue = 3.99f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 14000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "hint-phase"
    )
    val hint = processingHints[hintPhase.toInt().coerceIn(processingHints.indices)]

    Column(
        Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .navigationBarsPadding()
            .background(Paper)
            .padding(horizontal = 22.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Spacer(Modifier.height(18.dp))
        Text("研 数 导 学", fontFamily = FontFamily.Serif, fontSize = 32.sp, color = Ink)
        Spacer(Modifier.height(8.dp))
        Crossfade(
            targetState = if (error == null) processingSubtitle(state.status) else "解析遇到问题",
            label = "processing-subtitle"
        ) { subtitle ->
            Text(subtitle, color = Muted, fontSize = 14.sp)
        }
        Box(
            Modifier
                .weight(1f)
                .fillMaxWidth(),
            contentAlignment = Alignment.Center
        ) {
            SurfaceCard(padding = androidx.compose.foundation.layout.PaddingValues(horizontal = 24.dp, vertical = 24.dp)) {
                Text("解析生成中", fontFamily = FontFamily.Serif, fontSize = 25.sp, color = Ink)
                Spacer(Modifier.height(4.dp))
                Text("我正在沿着解题路线处理这道题。", color = Muted, fontSize = 14.sp)
                Spacer(Modifier.height(24.dp))
                processingSteps.forEachIndexed { index, title ->
                    ProcessingRouteStep(
                        title = title,
                        completed = index < progress.toInt(),
                        active = index == activeIndex,
                        showLine = index < processingSteps.lastIndex,
                        pulse = pulse
                    )
                }
                Spacer(Modifier.height(18.dp))
                ProcessingPreviewCard(state.processingPreview)
                Spacer(Modifier.height(18.dp))
                if (error == null) {
                    Crossfade(targetState = hint, label = "processing-hint") { text ->
                        Text(text, color = Muted, fontSize = 13.sp, lineHeight = 19.sp)
                    }
                } else {
                    ProcessingErrorCard(
                        message = error,
                        onBack = actions::cancelActiveWork,
                        onRetry = {
                            if (state.composerMode == ComposerMode.FollowUp) {
                                actions.followUp()
                            } else {
                                actions.solve()
                            }
                        }
                    )
                }
            }
        }
    }
}

@Composable
private fun ProcessingRouteStep(
    title: String,
    completed: Boolean,
    active: Boolean,
    showLine: Boolean,
    pulse: Float
) {
    val dotColor = when {
        completed -> Ink
        active -> Ink
        else -> Line
    }
    Row(Modifier.fillMaxWidth()) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Box(
                Modifier
                    .size(if (active) 20.dp else 18.dp)
                    .scale(if (active) pulse else 1f)
                    .background(dotColor.copy(alpha = if (active) 0.16f else 0.08f), CircleShape)
                    .border(1.dp, dotColor.copy(alpha = if (completed || active) 0.72f else 0.45f), CircleShape),
                contentAlignment = Alignment.Center
            ) {
                if (completed) {
                    Text("✓", color = Ink, fontSize = 11.sp)
                } else if (active) {
                    Box(Modifier.size(6.dp).background(Ink, CircleShape))
                } else {
                    Box(Modifier.size(5.dp).background(Line, CircleShape))
                }
            }
            if (showLine) {
                Box(
                    Modifier
                        .width(1.dp)
                        .height(30.dp)
                        .background(
                            when {
                                completed -> Ink.copy(alpha = 0.28f)
                                active -> Ink.copy(alpha = 0.16f)
                                else -> Line.copy(alpha = 0.75f)
                            }
                        )
                )
            }
        }
        Spacer(Modifier.width(14.dp))
        Column(Modifier.padding(top = 1.dp)) {
            Text(
                title,
                color = if (completed || active) Ink else Muted,
                fontSize = 16.sp,
                fontWeight = if (active) FontWeight.Medium else FontWeight.Normal
            )
            if (active) Text("正在进行", color = Muted, fontSize = 12.sp)
        }
    }
}

@Composable
private fun ProcessingPreviewCard(preview: String) {
    Column(
        Modifier
            .fillMaxWidth()
            .background(Soft, RoundedCornerShape(18.dp))
            .border(1.dp, Line.copy(alpha = 0.75f), RoundedCornerShape(18.dp))
            .padding(16.dp)
    ) {
        Text("题目识别预览", color = Muted, fontSize = 12.sp)
        Spacer(Modifier.height(8.dp))
        Box(
            Modifier
                .fillMaxWidth()
                .height(148.dp)
                .background(Card, RoundedCornerShape(14.dp))
                .border(1.dp, Line.copy(alpha = 0.65f), RoundedCornerShape(14.dp))
                .padding(14.dp),
            contentAlignment = Alignment.CenterStart
        ) {
            if (preview.isBlank()) {
                Text("题目识别完成后显示在这里", color = Muted, fontSize = 13.sp)
            } else {
                ArticleWebView(
                    markdown = preview.trim(),
                    modifier = Modifier.fillMaxSize(),
                    allowInternalScroll = true,
                    compact = true,
                    hiddenUntilRendered = false,
                    placeholder = null
                )
            }
        }
    }
}

@Composable
private fun ProcessingErrorCard(
    message: String,
    onBack: () -> Unit,
    onRetry: () -> Unit
) {
    Column(
        Modifier
            .fillMaxWidth()
            .background(Card, RoundedCornerShape(16.dp))
            .border(1.dp, Line.copy(alpha = 0.78f), RoundedCornerShape(16.dp))
            .padding(horizontal = 14.dp, vertical = 12.dp)
    ) {
        Text("没有完成解析", color = Ink, fontSize = 16.sp, fontWeight = FontWeight.Medium)
        Spacer(Modifier.height(6.dp))
        Text(message, color = Muted, fontSize = 13.sp, lineHeight = 19.sp)
        Spacer(Modifier.height(8.dp))
        Row {
            TextButton(onClick = onBack) {
                Text("返回修改", color = Ink)
            }
            TextButton(onClick = onRetry) {
                Text("重新尝试", color = Ink)
            }
        }
    }
}

private fun processingStepIndex(status: String): Int = when {
    status.contains("识别") || status.contains("待识别") -> 0
    status.contains("检索") -> 1
    status.contains("组织") -> 2
    status.contains("生成") || status.contains("模型") || status.contains("解析中") || status.contains("追问") -> 3
    status.contains("渲染") || status.contains("完成") -> 4
    else -> 0
}

private fun processingSubtitle(status: String): String = when (processingStepIndex(status)) {
    0 -> "正在识别题目…"
    1 -> "正在检索本地题库…"
    2 -> "正在组织解题思路…"
    3 -> "正在生成完整解析…"
    4 -> "正在渲染公式…"
    else -> "正在处理题目…"
}
