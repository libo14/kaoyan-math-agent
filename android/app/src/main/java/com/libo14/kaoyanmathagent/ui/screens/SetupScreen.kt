package com.libo14.kaoyanmathagent.ui.screens

import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.libo14.kaoyanmathagent.data.ApiProfile
import com.libo14.kaoyanmathagent.data.AppSettings
import com.libo14.kaoyanmathagent.ui.components.Ink
import com.libo14.kaoyanmathagent.ui.components.Muted
import com.libo14.kaoyanmathagent.ui.components.OutlineAction
import com.libo14.kaoyanmathagent.ui.components.SurfaceCard
import com.libo14.kaoyanmathagent.ui.components.ThinField

@Composable
fun SetupScreen(settings: AppSettings, onSave: (AppSettings) -> Unit) {
    var apiKey by remember { mutableStateOf(settings.main.apiKey) }
    var baseUrl by remember { mutableStateOf(settings.main.baseUrl) }
    var model by remember { mutableStateOf(settings.main.model) }
    SurfaceCard {
        Text("配置主 API", fontFamily = FontFamily.Serif, fontSize = 30.sp, color = Ink)
        Spacer(Modifier.height(24.dp))
        ThinField("API Key", apiKey, { apiKey = it }, "sk-...")
        ThinField("API 地址", baseUrl, { baseUrl = it }, "https://api.deepseek.com/v1")
        ThinField("模型名称", model, { model = it }, "deepseek-chat")
        Spacer(Modifier.height(8.dp))
        Text("主 API 用于解题、追问和复习卡；视觉识别可稍后在设置中单独配置。", color = Muted, fontSize = 13.sp)
        Spacer(Modifier.height(28.dp))
        OutlineAction("保存并开始", Modifier.fillMaxWidth()) {
            onSave(settings.copy(main = ApiProfile(apiKey.trim(), baseUrl.trim(), model.trim())))
        }
    }
}
