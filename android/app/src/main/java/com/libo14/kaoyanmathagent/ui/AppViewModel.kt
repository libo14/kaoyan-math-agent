package com.libo14.kaoyanmathagent.ui

import android.app.Application
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.libo14.kaoyanmathagent.data.AppDatabase
import com.libo14.kaoyanmathagent.data.AppSettings
import com.libo14.kaoyanmathagent.data.ApiProfile
import com.libo14.kaoyanmathagent.data.LearningAssetEntity
import com.libo14.kaoyanmathagent.data.SettingsStore
import com.libo14.kaoyanmathagent.importer.QuestionImporter
import com.libo14.kaoyanmathagent.llm.OpenAiCompatibleClient
import com.libo14.kaoyanmathagent.orchestrator.FollowUpResult
import com.libo14.kaoyanmathagent.orchestrator.SolveResult
import com.libo14.kaoyanmathagent.orchestrator.SolveProgress
import com.libo14.kaoyanmathagent.orchestrator.TutorOrchestrator
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class Tab { Study, Hub, Settings }
enum class AppScreen { Study, Processing, Reader, Hub, Settings }
enum class ComposerMode { Solve, FollowUp, Edit }
enum class ReaderSource { Result, FollowUp, Asset }

data class AppUiState(
    val settings: AppSettings = AppSettings(),
    val tab: Tab = Tab.Study,
    val screen: AppScreen = AppScreen.Study,
    val readerSource: ReaderSource? = null,
    val input: String = "",
    val imageUri: Uri? = null,
    val composerExpanded: Boolean = true,
    val composerMode: ComposerMode = ComposerMode.Solve,
    val loading: Boolean = false,
    val status: String = "",
    val showProcessingRoute: Boolean = false,
    val processingPreview: String = "",
    val errorMessage: String? = null,
    val currentResult: SolveResult? = null,
    val currentFollowUp: FollowUpResult? = null,
    val currentThreadBundle: LearningAssetEntity? = null,
    val hubStage: String = "foundation",
    val hubFilter: String = "due",
    val hubItems: List<LearningAssetEntity> = emptyList(),
    val selectedAsset: LearningAssetEntity? = null,
    val hubTotalCount: Int = 0,
    val hubFavoriteCount: Int = 0,
    val hubDueCount: Int = 0,
    val questionCount: Int = 0
)

class AppViewModel(application: Application) : AndroidViewModel(application) {
    private val db = AppDatabase.get(application)
    private val settingsStore = SettingsStore(application)
    private val importer = QuestionImporter(application)
    private val orchestrator = TutorOrchestrator(
        db.questionDao(),
        db.learningAssetDao(),
        db.threadDao(),
        OpenAiCompatibleClient(application)
    )
    private val _state = MutableStateFlow(AppUiState(settings = settingsStore.load()))
    val state: StateFlow<AppUiState> = _state
    private var workJob: Job? = null
    private var workToken: Int = 0

    init {
        viewModelScope.launch(Dispatchers.IO) {
            seedIfNeeded()
            refresh()
        }
    }

    fun setTab(tab: Tab) {
        _state.update {
            it.copy(
                tab = tab,
                screen = when (tab) {
                    Tab.Study -> AppScreen.Study
                    Tab.Hub -> AppScreen.Hub
                    Tab.Settings -> AppScreen.Settings
                },
                selectedAsset = if (tab == Tab.Hub) it.selectedAsset else null,
                readerSource = null,
                showProcessingRoute = false
            )
        }
        refresh()
    }

    fun updateInput(value: String) = _state.update { it.copy(input = value) }
    fun setImage(uri: Uri?) = _state.update {
        it.copy(
            imageUri = uri,
            composerExpanded = true,
            composerMode = ComposerMode.Solve,
            status = if (uri == null) "" else "待识别 · 已选择图片",
            showProcessingRoute = false,
            processingPreview = "",
            errorMessage = null
        )
    }
    fun setHubStage(stage: String) {
        _state.update { it.copy(hubStage = stage, selectedAsset = null) }
        refresh()
    }
    fun setHubFilter(filter: String) {
        _state.update { it.copy(hubFilter = filter, selectedAsset = null) }
        refresh()
    }
    fun openAsset(item: LearningAssetEntity) = _state.update {
        it.copy(
            selectedAsset = item,
            screen = AppScreen.Reader,
            readerSource = ReaderSource.Asset,
            showProcessingRoute = false,
            errorMessage = null
        )
    }

    fun closeReader() {
        val snapshot = state.value
        _state.update {
            when (snapshot.readerSource) {
                ReaderSource.Asset -> it.copy(
                    screen = AppScreen.Hub,
                    tab = Tab.Hub,
                    selectedAsset = null,
                    readerSource = null,
                    showProcessingRoute = false
                )
                ReaderSource.FollowUp -> it.copy(
                    screen = AppScreen.Reader,
                    tab = Tab.Study,
                    readerSource = ReaderSource.Result,
                    currentFollowUp = null,
                    showProcessingRoute = false
                )
                else -> it.copy(
                    screen = AppScreen.Study,
                    tab = Tab.Study,
                    selectedAsset = null,
                    readerSource = null,
                    currentFollowUp = null,
                    composerExpanded = false,
                    showProcessingRoute = false
                )
            }
        }
    }

    fun closeAsset() = closeReader()

    fun cancelActiveWork() {
        workToken += 1
        workJob?.cancel()
        _state.update {
            it.copy(
                loading = false,
                showProcessingRoute = false,
                screen = AppScreen.Study,
                tab = Tab.Study,
                composerExpanded = true,
                status = "已返回，可继续编辑题目",
                errorMessage = null
            )
        }
    }

    fun saveSettings(settings: AppSettings) {
        settingsStore.save(settings)
        _state.update { it.copy(settings = settings, status = "配置已保存") }
    }

    fun continueFollowUp() {
        _state.update {
            it.copy(
                composerExpanded = true,
                composerMode = ComposerMode.FollowUp,
                screen = AppScreen.Study,
                tab = Tab.Study,
                readerSource = null,
                input = "",
                imageUri = null,
                status = "继续追问",
                showProcessingRoute = false,
                errorMessage = null
            )
        }
    }

    fun editCurrentQuestion() {
        val current = state.value.currentResult ?: return
        _state.update {
            it.copy(
                composerExpanded = true,
                composerMode = ComposerMode.Edit,
                screen = AppScreen.Study,
                tab = Tab.Study,
                readerSource = null,
                input = current.questionText,
                imageUri = null,
                status = "可修改题目后重新解析",
                showProcessingRoute = false,
                errorMessage = null
            )
        }
    }

    fun collapseComposer() {
        if (state.value.currentResult != null) {
            _state.update {
                it.copy(
                    composerExpanded = false,
                    input = "",
                    imageUri = null,
                    screen = AppScreen.Reader,
                    tab = Tab.Study,
                    readerSource = ReaderSource.Result,
                    showProcessingRoute = false,
                    errorMessage = null
                )
            }
        }
    }

    fun startNewQuestion() {
        _state.update {
            it.copy(
                input = "",
                imageUri = null,
                composerExpanded = true,
                composerMode = ComposerMode.Solve,
                currentResult = null,
                currentThreadBundle = null,
                selectedAsset = null,
                screen = AppScreen.Study,
                tab = Tab.Study,
                readerSource = null,
                currentFollowUp = null,
                status = "",
                showProcessingRoute = false,
                processingPreview = "",
                errorMessage = null
            )
        }
    }

    fun solve() {
        val s = state.value
        if (s.input.isBlank() && s.imageUri == null) return
        launchWork(
            message = if (s.imageUri == null) "检索本地题库" else "识别题目中",
            showProcessingRoute = true,
            initialPreview = ""
        ) { isCurrent ->
            val result = orchestrator.solve(s.settings, s.input, s.imageUri) { progress: SolveProgress ->
                if (isCurrent()) {
                    _state.update {
                        it.copy(
                            status = progress.stage,
                            processingPreview = progress.questionPreview ?: it.processingPreview
                        )
                    }
                }
            }
            if (!isCurrent()) return@launchWork
            _state.update { it.copy(status = "渲染公式") }
            val finalStatus = if (result.route == "local_plus_model") "解析完成 · 本地 + 模型" else "解析完成 · 模型"
            _state.update {
                it.copy(
                    currentResult = result,
                    currentThreadBundle = null,
                    input = "",
                    imageUri = null,
                    composerExpanded = false,
                    composerMode = ComposerMode.FollowUp,
                    screen = AppScreen.Reader,
                    tab = Tab.Study,
                    readerSource = ReaderSource.Result,
                    status = finalStatus,
                    showProcessingRoute = false,
                    processingPreview = "",
                    errorMessage = null
                )
            }
        }
    }

    fun followUp() {
        val s = state.value
        if (s.input.isBlank()) return
        launchWork(
            message = "组织追问思路",
            showProcessingRoute = true,
            initialPreview = s.currentResult?.questionText.orEmpty()
        ) { isCurrent ->
            val result = orchestrator.followUp(s.settings, s.currentResult, s.input)
            val bundle = orchestrator.threadBundle(result.threadId)
            if (!isCurrent()) return@launchWork
            _state.update {
                it.copy(
                    currentFollowUp = result,
                    currentThreadBundle = bundle,
                    input = "",
                    imageUri = null,
                    composerExpanded = false,
                    composerMode = ComposerMode.FollowUp,
                    screen = AppScreen.Reader,
                    tab = Tab.Study,
                    readerSource = ReaderSource.FollowUp,
                    status = if (bundle != null) "追问完成 · 已追加到收藏" else "追问完成",
                    showProcessingRoute = false,
                    errorMessage = null
                )
            }
            if (bundle != null) refresh()
        }
    }

    fun saveCurrentThreadBundle(stage: String = "foundation") {
        val result = state.value.currentResult ?: return
        launchWork("正在收藏整段追问...") { isCurrent ->
            val bundle = orchestrator.saveThreadBundle(result, stage)
            if (!isCurrent()) return@launchWork
            _state.update {
                it.copy(
                    currentThreadBundle = bundle,
                    status = "已收藏整段 · 后续追问自动追加"
                )
            }
            refresh()
        }
    }

    fun saveCurrent(stage: String, type: String) {
        val result = state.value.currentResult ?: return
        launchWork("正在保存...") { isCurrent ->
            val savedType = if (type == "favorite") "question" else type
            val favorite = type == "favorite"
            orchestrator.saveAsset(result, type = savedType, stage = stage, favorite = favorite)
            if (!isCurrent()) return@launchWork
            refresh()
            _state.update {
                it.copy(
                    status = if (favorite) {
                        "已收藏到中枢"
                    } else {
                        "已保存到${if (stage == "foundation") "基础" else "强化"}"
                    }
                )
            }
        }
    }

    fun updateSelectedAssetStage(stage: String) {
        val item = state.value.selectedAsset ?: return
        launchWork("正在更新阶段...") { isCurrent ->
            val updated = orchestrator.updateAssetStage(item.id, stage)
            if (!isCurrent()) return@launchWork
            refresh()
            _state.update {
                it.copy(
                    selectedAsset = updated,
                    status = "已加入${if (stage == "foundation") "基础" else "强化"}"
                )
            }
        }
    }

    fun toggleSelectedAssetFavorite() {
        val item = state.value.selectedAsset ?: return
        launchWork(if (item.favorite) "正在取消收藏..." else "正在收藏...") { isCurrent ->
            val updated = orchestrator.updateAssetFavorite(item.id, !item.favorite)
            if (!isCurrent()) return@launchWork
            refresh()
            _state.update {
                it.copy(
                    selectedAsset = updated,
                    status = if (updated?.favorite == true) "已收藏" else "已取消收藏"
                )
            }
        }
    }

    fun reviewAsset(id: String, quality: Int) {
        launchWork("正在更新复习队列...") { isCurrent ->
            val updated = orchestrator.reviewAsset(id, quality)
            if (!isCurrent()) return@launchWork
            refresh()
            _state.update {
                it.copy(
                    selectedAsset = if (it.selectedAsset?.id == id) updated else it.selectedAsset,
                    status = when (quality) {
                        1 -> "已安排稍后再复习"
                        3 -> "已安排明日巩固"
                        else -> "已延后下次复习"
                    }
                )
            }
        }
    }

    fun continueWithSelectedAsset() {
        val item = state.value.selectedAsset ?: return
        val threadId = item.sourceThreadId ?: "asset-${item.id}"
        val result = SolveResult(
            threadId = threadId,
            questionText = listOf(item.title, item.knowledgePoints).filter { it.isNotBlank() }.joinToString("\n\n"),
            answerMarkdown = item.content,
            route = "asset",
            localMatches = emptyList()
        )
        _state.update {
            it.copy(
                tab = Tab.Study,
                screen = AppScreen.Study,
                readerSource = null,
                currentResult = result,
                currentThreadBundle = item.takeIf { it.type == "thread_bundle" },
                composerExpanded = true,
                composerMode = ComposerMode.FollowUp,
                input = "",
                imageUri = null,
                selectedAsset = null,
                status = "围绕资料继续追问",
                showProcessingRoute = false,
                errorMessage = null
            )
        }
    }

    fun importFile(uri: Uri) {
        launchWork("正在导入题库...") { isCurrent ->
            val items = importer.importFromUri(uri)
            db.questionDao().upsertAll(items)
            if (!isCurrent()) return@launchWork
            refresh()
            _state.update { it.copy(status = "已导入 ${items.size} 条资料") }
        }
    }

    private fun launchWork(
        message: String,
        showProcessingRoute: Boolean = false,
        initialPreview: String = "",
        block: suspend (isCurrent: () -> Boolean) -> Unit
    ) {
        workJob?.cancel()
        val token = ++workToken
        val isCurrent = { token == workToken }
        _state.update {
            it.copy(
                loading = true,
                status = message,
                showProcessingRoute = showProcessingRoute,
                screen = if (showProcessingRoute) AppScreen.Processing else it.screen,
                processingPreview = initialPreview,
                errorMessage = null
            )
        }
        workJob = viewModelScope.launch(Dispatchers.IO) {
            try {
                block(isCurrent)
            } catch (_: CancellationException) {
            } catch (error: Throwable) {
                if (isCurrent()) {
                    _state.update {
                        if (showProcessingRoute) {
                            it.copy(
                                status = "${it.status.ifBlank { message }}失败",
                                showProcessingRoute = true,
                                screen = AppScreen.Processing,
                                errorMessage = error.message ?: "操作失败，请稍后重试。"
                            )
                        } else {
                            it.copy(
                                status = "操作失败",
                                showProcessingRoute = false,
                                screen = AppScreen.Study,
                                tab = Tab.Study,
                                composerExpanded = true,
                                errorMessage = error.message ?: "操作失败，请稍后重试。"
                            )
                        }
                    }
                }
            } finally {
                if (isCurrent()) {
                    _state.update { it.copy(loading = false) }
                }
            }
        }
    }

    private suspend fun seedIfNeeded() {
        if (db.questionDao().count() == 0) {
            db.questionDao().upsertAll(importer.loadBundledQuestions())
        }
    }

    private fun refresh() {
        viewModelScope.launch(Dispatchers.IO) {
            val snapshot = state.value
            val count = db.questionDao().count()
            val hub = orchestrator.hub(snapshot.hubStage, snapshot.hubFilter)
            val stats = orchestrator.hubStats(snapshot.hubStage)
            val selected = snapshot.selectedAsset?.let { selected ->
                hub.firstOrNull { it.id == selected.id } ?: selected
            }
            val currentBundle = snapshot.currentThreadBundle?.let { bundle ->
                db.learningAssetDao().findById(bundle.id) ?: bundle
            }
            _state.update {
                it.copy(
                    questionCount = count,
                    hubItems = hub,
                    hubTotalCount = stats.first,
                    hubFavoriteCount = stats.second,
                    hubDueCount = stats.third,
                    selectedAsset = selected,
                    currentThreadBundle = currentBundle
                )
            }
        }
    }
}

fun settingsWithMain(settings: AppSettings, apiKey: String, baseUrl: String, model: String): AppSettings =
    settings.copy(main = ApiProfile(apiKey = apiKey, baseUrl = baseUrl, model = model))
