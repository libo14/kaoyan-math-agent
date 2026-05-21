package com.libo14.kaoyanmathagent.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.libo14.kaoyanmathagent.ui.AppUiState
import com.libo14.kaoyanmathagent.ui.AppViewModel
import com.libo14.kaoyanmathagent.ui.ComposerMode
import com.libo14.kaoyanmathagent.ui.components.CameraAttachButton
import com.libo14.kaoyanmathagent.ui.components.Card
import com.libo14.kaoyanmathagent.ui.components.FilledSendButton
import com.libo14.kaoyanmathagent.ui.components.Ink
import com.libo14.kaoyanmathagent.ui.components.Line
import com.libo14.kaoyanmathagent.ui.components.Muted
import com.libo14.kaoyanmathagent.ui.components.SelectedImageThumbnail

@Composable
fun StudyScreen(
    state: AppUiState,
    actions: AppViewModel,
    openCamera: () -> Unit,
    openGallery: () -> Unit
) {
    Box(
        Modifier
            .fillMaxSize()
            .padding(bottom = 10.dp),
        contentAlignment = Alignment.Center
    ) {
        ComposerCard(state, actions, openCamera, openGallery)
    }
}

@Composable
private fun ComposerCard(
    state: AppUiState,
    actions: AppViewModel,
    openCamera: () -> Unit,
    openGallery: () -> Unit
) {
    val isFollowUp = state.composerMode == ComposerMode.FollowUp
    Column(Modifier.fillMaxWidth()) {
        Box(
            Modifier
                .fillMaxWidth()
                .height(360.dp)
                .background(Card, RoundedCornerShape(22.dp))
                .border(1.dp, Line, RoundedCornerShape(22.dp))
                .padding(20.dp)
        ) {
            BasicTextField(
                value = state.input,
                onValueChange = { actions.updateInput(it.take(500)) },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(222.dp),
                textStyle = TextStyle(fontSize = 19.sp, color = Ink, lineHeight = 28.sp),
                maxLines = 8,
                decorationBox = { innerTextField ->
                    Box(Modifier.fillMaxSize()) {
                        if (state.input.isBlank()) {
                            Text(
                                when {
                                    isFollowUp -> "例如：这一步为什么成立？还有别的方法吗？"
                                    else -> "输入题目或你的困惑..."
                                },
                                color = Muted,
                                fontSize = 19.sp
                            )
                        }
                        innerTextField()
                    }
                }
            )
            SelectedImageThumbnail(
                uri = state.imageUri,
                onRemove = { actions.setImage(null) },
                modifier = Modifier.align(Alignment.BottomStart)
            )
            if (!isFollowUp) {
                CameraAttachButton(
                    onCamera = openCamera,
                    onGallery = openGallery,
                    modifier = Modifier.align(Alignment.BottomEnd)
                )
            }
        }
        Spacer(Modifier.height(8.dp))
        Text(
            "${state.input.length.coerceAtMost(500)} / 500",
            color = Muted,
            fontSize = 17.sp,
            modifier = Modifier.align(Alignment.End)
        )
        Spacer(Modifier.height(30.dp))
        FilledSendButton(
            text = if (isFollowUp) "提交追问" else "发送",
            enabled = !state.loading && (state.input.isNotBlank() || state.imageUri != null)
        ) {
            if (isFollowUp) actions.followUp() else actions.solve()
        }
    }
}
