package com.libo14.kaoyanmathagent.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.libo14.kaoyanmathagent.data.ApiProfile
import com.libo14.kaoyanmathagent.ui.AppUiState
import com.libo14.kaoyanmathagent.ui.AppViewModel
import com.libo14.kaoyanmathagent.ui.components.Ink
import com.libo14.kaoyanmathagent.ui.components.Muted
import com.libo14.kaoyanmathagent.ui.components.OutlineAction
import com.libo14.kaoyanmathagent.ui.components.SurfaceCard
import com.libo14.kaoyanmathagent.ui.components.ThinField

@Composable
fun SettingsScreen(state: AppUiState, actions: AppViewModel, openImport: () -> Unit) {
    var mainKey by remember(state.settings) { mutableStateOf(state.settings.main.apiKey) }
    var mainUrl by remember(state.settings) { mutableStateOf(state.settings.main.baseUrl) }
    var mainModel by remember(state.settings) { mutableStateOf(state.settings.main.model) }
    var separate by remember(state.settings) { mutableStateOf(state.settings.useSeparateVision) }
    var visionKey by remember(state.settings) { mutableStateOf(state.settings.vision.apiKey) }
    var visionUrl by remember(state.settings) { mutableStateOf(state.settings.vision.baseUrl) }
    var visionModel by remember(state.settings) { mutableStateOf(state.settings.vision.model) }
    LazyColumn(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item {
            SurfaceCard {
                Text("主 API", fontFamily = FontFamily.Serif, fontSize = 24.sp)
                ThinField("API Key", mainKey, { mainKey = it }, "sk-...")
                ThinField("API 地址", mainUrl, { mainUrl = it }, "https://api.deepseek.com/v1")
                ThinField("模型名称", mainModel, { mainModel = it }, "deepseek-chat")
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("单独配置视觉识别", modifier = Modifier.weight(1f), color = Ink)
                    Switch(checked = separate, onCheckedChange = { separate = it })
                }
                if (separate) {
                    ThinField("视觉 API Key", visionKey, { visionKey = it }, "留空则使用主 API Key")
                    ThinField("视觉 API 地址", visionUrl, { visionUrl = it }, "https://api.siliconflow.cn/v1")
                    ThinField("视觉模型", visionModel, { visionModel = it }, "Qwen/Qwen2.5-VL-32B-Instruct")
                }
                OutlineAction("保存设置", Modifier.fillMaxWidth()) {
                    actions.saveSettings(
                        state.settings.copy(
                            main = ApiProfile(mainKey, mainUrl, mainModel),
                            useSeparateVision = separate,
                            vision = ApiProfile(visionKey, visionUrl, visionModel)
                        )
                    )
                }
            }
        }
        item {
            SurfaceCard {
                Text("题库导入", fontFamily = FontFamily.Serif, fontSize = 24.sp)
                Text("支持 .md / .txt / .json / .jsonl。导入后会写入本地数据库。", color = Muted)
                Spacer(Modifier.height(12.dp))
                OutlineAction("选择文件导入", Modifier.fillMaxWidth(), onClick = openImport)
            }
        }
    }
}
