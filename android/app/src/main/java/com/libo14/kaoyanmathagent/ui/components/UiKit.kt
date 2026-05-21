package com.libo14.kaoyanmathagent.ui.components

import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.libo14.kaoyanmathagent.ui.Tab

val Paper = Color(0xFFF7F4EC)
val Ink = Color(0xFF22201D)
val Muted = Color(0xFF8B867C)
val Line = Color(0xFFD9D1C4)
val Card = Color(0xFFFFFCF6)
val Soft = Color(0xFFFBF8F1)

@Composable
fun SurfaceCard(
    modifier: Modifier = Modifier,
    padding: PaddingValues = PaddingValues(20.dp),
    content: @Composable ColumnScope.() -> Unit
) {
    Column(
        modifier
            .fillMaxWidth()
            .background(Card, RoundedCornerShape(22.dp))
            .border(1.dp, Line, RoundedCornerShape(22.dp))
            .padding(padding),
        content = content
    )
}

@Composable
fun Chip(text: String, modifier: Modifier = Modifier) {
    Box(
        modifier
            .background(Color(0xFFF1ECE2), RoundedCornerShape(50))
            .padding(horizontal = 12.dp, vertical = 7.dp)
    ) {
        Text(text, color = Color(0xFF6C655B), fontSize = 12.sp, maxLines = 1)
    }
}

@Composable
fun OutlineAction(text: String, modifier: Modifier = Modifier, enabled: Boolean = true, onClick: () -> Unit) {
    OutlinedButton(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.height(50.dp),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = Ink)
    ) {
        Text(text, fontSize = 17.sp)
    }
}

@Composable
fun SmallButton(text: String, onClick: () -> Unit) {
    OutlinedButton(
        onClick = onClick,
        contentPadding = PaddingValues(horizontal = 13.dp, vertical = 7.dp),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = Ink)
    ) {
        Text(text, fontSize = 13.sp)
    }
}

@Composable
fun ReadingAction(text: String, onClick: () -> Unit) {
    TextButton(onClick = onClick, contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp)) {
        Text(text, color = Ink, fontSize = 13.sp)
    }
}

@Composable
fun ThinField(label: String, value: String, onValue: (String) -> Unit, placeholder: String) {
    Text(label, fontWeight = FontWeight.Medium, color = Ink)
    OutlinedTextField(
        value = value,
        onValueChange = onValue,
        placeholder = { Text(placeholder, color = Muted) },
        modifier = Modifier.fillMaxWidth(),
        singleLine = true
    )
    Spacer(Modifier.height(12.dp))
}

@Composable
fun FilledSendButton(text: String, enabled: Boolean, onClick: () -> Unit) {
    OutlinedButton(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier
            .fillMaxWidth()
            .height(58.dp),
        shape = RoundedCornerShape(10.dp),
        colors = ButtonDefaults.outlinedButtonColors(
            containerColor = if (enabled) Ink else Color(0xFFE5DED2),
            contentColor = if (enabled) Card else Muted,
            disabledContainerColor = Color(0xFFE5DED2),
            disabledContentColor = Muted
        )
    ) {
        Text(text, fontFamily = FontFamily.Serif, fontSize = 22.sp)
    }
}

@Composable
fun SelectedImageThumbnail(uri: Uri?, onRemove: () -> Unit, modifier: Modifier = Modifier) {
    if (uri == null) return
    Box(
        modifier
            .width(88.dp)
            .height(66.dp)
    ) {
        AndroidView(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .width(78.dp)
                .height(58.dp)
                .clip(RoundedCornerShape(11.dp))
                .background(Soft, RoundedCornerShape(12.dp))
                .border(1.dp, Line, RoundedCornerShape(12.dp)),
            factory = { context ->
                android.widget.ImageView(context).apply {
                    scaleType = android.widget.ImageView.ScaleType.CENTER_CROP
                    setBackgroundColor(android.graphics.Color.TRANSPARENT)
                }
            },
            update = { imageView -> imageView.setImageURI(uri) }
        )
        Box(
            Modifier
                .align(Alignment.TopEnd)
                .size(22.dp)
                .background(Color(0xFFEDE7DC), CircleShape)
                .border(1.dp, Line, CircleShape)
                .clickable(onClick = onRemove),
            contentAlignment = Alignment.Center
        ) {
            Text("x", color = Ink, fontSize = 15.sp)
        }
    }
}

@Composable
fun CameraAttachButton(onCamera: () -> Unit, onGallery: () -> Unit, modifier: Modifier = Modifier) {
    var showPicker by remember { mutableStateOf(false) }
    Box(
        modifier
            .size(62.dp)
            .background(Card, RoundedCornerShape(16.dp))
            .border(1.dp, Line, RoundedCornerShape(16.dp))
            .clickable { showPicker = true },
        contentAlignment = Alignment.Center
    ) {
        CameraGlyph()
    }
    if (showPicker) {
        AlertDialog(
            onDismissRequest = { showPicker = false },
            containerColor = Card,
            title = { Text("选择题目图片", fontFamily = FontFamily.Serif, color = Ink) },
            text = { Text("拍照识题，或从相册选择已有图片。", color = Muted) },
            confirmButton = {
                TextButton(onClick = {
                    showPicker = false
                    onCamera()
                }) { Text("拍照", color = Ink) }
            },
            dismissButton = {
                TextButton(onClick = {
                    showPicker = false
                    onGallery()
                }) { Text("相册", color = Ink) }
            }
        )
    }
}

@Composable
fun CameraGlyph() {
    Box(Modifier.width(30.dp).height(24.dp), contentAlignment = Alignment.Center) {
        Box(
            Modifier
                .align(Alignment.TopCenter)
                .offset(y = (-1).dp)
                .width(12.dp)
                .height(5.dp)
                .background(Card, RoundedCornerShape(2.dp))
                .border(1.dp, Ink.copy(alpha = 0.85f), RoundedCornerShape(2.dp))
        )
        Box(
            Modifier
                .align(Alignment.BottomCenter)
                .width(28.dp)
                .height(20.dp)
                .border(1.6.dp, Ink.copy(alpha = 0.9f), RoundedCornerShape(5.dp)),
            contentAlignment = Alignment.Center
        ) {
            Box(Modifier.size(8.dp).border(1.4.dp, Ink.copy(alpha = 0.9f), CircleShape))
        }
    }
}

@Composable
fun BottomNav(current: Tab, onTab: (Tab) -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .background(Soft)
            .padding(vertical = 10.dp),
        horizontalArrangement = Arrangement.SpaceAround
    ) {
        NavItem("学习", Tab.Study, current, onTab)
        NavItem("中枢", Tab.Hub, current, onTab)
        NavItem("设置", Tab.Settings, current, onTab)
    }
}

@Composable
private fun NavItem(label: String, tab: Tab, current: Tab, onTab: (Tab) -> Unit) {
    Column(
        Modifier
            .width(78.dp)
            .clickable { onTab(tab) },
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(label, color = Ink, fontSize = 14.sp)
        Spacer(Modifier.height(5.dp))
        Box(
            Modifier
                .height(2.dp)
                .width(if (current == tab) 44.dp else 0.dp)
                .background(Ink)
        )
    }
}

@Composable
fun CenterEmpty(text: String, modifier: Modifier = Modifier) {
    Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text(text, color = Muted, fontSize = 14.sp)
    }
}
