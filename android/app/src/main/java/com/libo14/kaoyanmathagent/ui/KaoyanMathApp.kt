package com.libo14.kaoyanmathagent.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.libo14.kaoyanmathagent.ui.components.BottomNav
import com.libo14.kaoyanmathagent.ui.components.Ink
import com.libo14.kaoyanmathagent.ui.components.Muted
import com.libo14.kaoyanmathagent.ui.components.Paper
import com.libo14.kaoyanmathagent.ui.screens.HubScreen
import com.libo14.kaoyanmathagent.ui.screens.ProcessingScreen
import com.libo14.kaoyanmathagent.ui.screens.ReaderScreen
import com.libo14.kaoyanmathagent.ui.screens.SettingsScreen
import com.libo14.kaoyanmathagent.ui.screens.SetupScreen
import com.libo14.kaoyanmathagent.ui.screens.StudyScreen

@Composable
fun KaoyanMathApp(
    state: AppUiState,
    actions: AppViewModel,
    openCamera: () -> Unit,
    openGallery: () -> Unit,
    openImport: () -> Unit
) {
    MaterialTheme {
        BackHandler(enabled = state.screen == AppScreen.Processing) {
            actions.cancelActiveWork()
        }
        BackHandler(enabled = state.screen == AppScreen.Reader && !state.loading) {
            actions.closeReader()
        }
        Box(
            Modifier
                .fillMaxSize()
                .background(Paper),
            contentAlignment = Alignment.Center
        ) {
            if (!state.settings.configured) {
                SetupShell(state, actions)
            } else {
                when (state.screen) {
                    AppScreen.Processing -> ProcessingScreen(state, actions)
                    AppScreen.Reader -> ReaderScreen(state, actions, openGallery)
                    else -> AppScaffold(state, actions, openCamera, openGallery, openImport)
                }
            }
        }
    }
}

@Composable
private fun SetupShell(state: AppUiState, actions: AppViewModel) {
    Column(
        Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .navigationBarsPadding()
            .padding(horizontal = 22.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Spacer(Modifier.height(44.dp))
        Text("研 数 导 学", fontFamily = FontFamily.Serif, fontSize = 38.sp, color = Ink)
        Spacer(Modifier.height(46.dp))
        SetupScreen(state.settings, actions::saveSettings)
    }
}

@Composable
private fun AppScaffold(
    state: AppUiState,
    actions: AppViewModel,
    openCamera: () -> Unit,
    openGallery: () -> Unit,
    openImport: () -> Unit
) {
    Column(
        Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .navigationBarsPadding()
            .padding(horizontal = 18.dp)
            .background(Paper),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        if (state.tab == Tab.Study) {
            Spacer(Modifier.height(18.dp))
            Text("研 数 导 学", fontFamily = FontFamily.Serif, fontSize = 34.sp, color = Ink)
            Spacer(Modifier.height(8.dp))
            Text(
                if (state.composerMode == ComposerMode.FollowUp) "围绕当前题目继续追问。" else "先识题，再讲透。",
                color = Muted,
                fontSize = 14.sp
            )
            Spacer(Modifier.height(26.dp))
        } else {
            Spacer(Modifier.height(12.dp))
        }
        Box(Modifier.weight(1f).fillMaxWidth()) {
            when (state.tab) {
                Tab.Study -> StudyScreen(state, actions, openCamera, openGallery)
                Tab.Hub -> HubScreen(state, actions)
                Tab.Settings -> SettingsScreen(state, actions, openImport)
            }
        }
        BottomNav(state.tab, actions::setTab)
    }
}
