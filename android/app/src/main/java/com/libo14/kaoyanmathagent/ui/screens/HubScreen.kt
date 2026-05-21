package com.libo14.kaoyanmathagent.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.libo14.kaoyanmathagent.data.LearningAssetEntity
import com.libo14.kaoyanmathagent.ui.AppUiState
import com.libo14.kaoyanmathagent.ui.AppViewModel
import com.libo14.kaoyanmathagent.ui.components.Card
import com.libo14.kaoyanmathagent.ui.components.Chip
import com.libo14.kaoyanmathagent.ui.components.Ink
import com.libo14.kaoyanmathagent.ui.components.Line
import com.libo14.kaoyanmathagent.ui.components.Muted
import com.libo14.kaoyanmathagent.ui.components.Soft
import com.libo14.kaoyanmathagent.ui.components.SurfaceCard
import com.libo14.kaoyanmathagent.ui.render.markdownPreview

@Composable
fun HubScreen(state: AppUiState, actions: AppViewModel) {
    LazyColumn(
        verticalArrangement = Arrangement.spacedBy(14.dp),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 16.dp)
    ) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("中枢", fontFamily = FontFamily.Serif, fontSize = 28.sp, color = Ink, modifier = Modifier.weight(1f))
                Chip(if (state.hubStage == "foundation") "基础阶段" else "强化阶段")
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                StatPill("资料", state.hubTotalCount, Modifier.weight(1f))
                StatPill("收藏", state.hubFavoriteCount, Modifier.weight(1f))
                StatPill("待复习", state.hubDueCount, Modifier.weight(1f))
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                FilterChip(selected = state.hubStage == "foundation", onClick = { actions.setHubStage("foundation") }, label = { Text("基础") })
                FilterChip(selected = state.hubStage == "intensive", onClick = { actions.setHubStage("intensive") }, label = { Text("强化") })
            }
        }
        item {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                item { HubFilterChip("今日复习", "due", state, actions) }
                item { HubFilterChip("收藏", "favorite", state, actions) }
                item { HubFilterChip("追问合集", "thread_bundle", state, actions) }
                item { HubFilterChip("复习卡", "review_card", state, actions) }
                item { HubFilterChip("题目", "question", state, actions) }
                item { HubFilterChip("全部", "all", state, actions) }
            }
        }
        if (state.hubItems.isEmpty()) {
            item {
                SurfaceCard {
                    Text(hubFilterTitle(state.hubFilter), fontFamily = FontFamily.Serif, fontSize = 24.sp)
                    Spacer(Modifier.padding(top = 10.dp))
                    Text("解析题目后点击收藏、复习卡、加入基础或加入强化，即可在这里复习。", color = Muted, lineHeight = 21.sp)
                }
            }
        } else {
            items(items = state.hubItems, key = { it.id }) { item ->
                AssetRow(
                    item = item,
                    onClick = { actions.openAsset(item) },
                    onReview = { quality -> actions.reviewAsset(item.id, quality) }
                )
            }
        }
        item {
            SurfaceCard {
                Text("学习概况", fontFamily = FontFamily.Serif, fontSize = 24.sp)
                Spacer(Modifier.padding(top = 10.dp))
                Text("本地题库：${state.questionCount} 题", color = Ink)
                Text("当前列表：${state.hubItems.size} 条", color = Ink)
                Text("下一步建议：优先复习低掌握度题目，再围绕薄弱知识点追问。", color = Muted)
            }
        }
    }
}

@Composable
private fun HubFilterChip(label: String, filter: String, state: AppUiState, actions: AppViewModel) {
    FilterChip(
        selected = state.hubFilter == filter,
        onClick = { actions.setHubFilter(filter) },
        label = { Text(label) }
    )
}

@Composable
private fun StatPill(label: String, count: Int, modifier: Modifier = Modifier) {
    Column(
        modifier
            .background(Soft, RoundedCornerShape(16.dp))
            .border(1.dp, Line.copy(alpha = 0.7f), RoundedCornerShape(16.dp))
            .padding(vertical = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(count.toString(), color = Ink, fontSize = 20.sp, fontFamily = FontFamily.Serif)
        Text(label, color = Muted, fontSize = 12.sp)
    }
}

@Composable
private fun AssetRow(item: LearningAssetEntity, onClick: () -> Unit, onReview: (Int) -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .background(Card, RoundedCornerShape(18.dp))
            .border(1.dp, Line.copy(alpha = 0.75f), RoundedCornerShape(18.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 14.dp)
    ) {
        Text(item.title, color = Ink, fontSize = 16.sp, fontWeight = FontWeight.Medium, maxLines = 2)
        Spacer(Modifier.padding(top = 5.dp))
        Text(
            "${stageLabel(item.stage)} · ${assetTypeLabel(item.type)} · ${reviewStatusText(item)}${if (item.favorite) " · 已收藏" else ""}",
            color = Muted,
            fontSize = 12.sp
        )
        val preview = markdownPreview(item.content, 80)
        if (preview.isNotBlank()) {
            Spacer(Modifier.padding(top = 8.dp))
            Text(preview, color = Muted, fontSize = 13.sp, lineHeight = 19.sp, maxLines = 2)
        }
        if (item.reviewDueAt <= System.currentTimeMillis()) {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                TextButton(onClick = { onReview(1) }) { Text("忘了", color = Ink, fontSize = 13.sp) }
                TextButton(onClick = { onReview(3) }) { Text("模糊", color = Ink, fontSize = 13.sp) }
                TextButton(onClick = { onReview(5) }) { Text("掌握", color = Ink, fontSize = 13.sp) }
            }
        }
    }
}

private fun hubFilterTitle(filter: String): String = when (filter) {
    "due" -> "今日复习"
    "favorite" -> "收藏资料"
    "thread_bundle" -> "追问合集"
    "review_card" -> "复习卡"
    "question" -> "题目解析"
    else -> "全部资料"
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

private fun reviewStatusText(item: LearningAssetEntity): String {
    val due = if (item.reviewDueAt <= System.currentTimeMillis()) "今日复习" else "下次 ${daysUntilReview(item.reviewDueAt)}天"
    val mastery = when {
        item.mastery >= 90 -> "已掌握"
        item.mastery >= 50 -> "待巩固"
        else -> "薄弱"
    }
    return "$due · $mastery"
}

private fun daysUntilReview(dueAt: Long): Int {
    val diff = (dueAt - System.currentTimeMillis()).coerceAtLeast(0L)
    return ((diff + 86_399_999L) / 86_400_000L).toInt()
}
