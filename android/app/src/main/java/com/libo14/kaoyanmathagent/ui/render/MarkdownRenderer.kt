package com.libo14.kaoyanmathagent.ui.render

import android.view.MotionEvent
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.libo14.kaoyanmathagent.ui.components.Card
import com.libo14.kaoyanmathagent.ui.components.Ink
import com.libo14.kaoyanmathagent.ui.components.Line
import com.libo14.kaoyanmathagent.ui.components.Muted

object MarkdownRenderCache {
    private val html = mutableStateMapOf<String, String>()
    private val ready = mutableSetOf<String>()

    fun key(markdown: String, compact: Boolean, structured: Boolean): String =
        "${compact}_${structured}_${markdown.hashCode()}"

    fun htmlFor(markdown: String, compact: Boolean, structured: Boolean): String {
        val key = key(markdown, compact, structured)
        return html.getOrPut(key) { markdownToHtml(markdown, compact, structured) }
    }

    fun markReady(key: String) {
        ready += key
    }

    fun isReady(key: String): Boolean = key in ready
}

data class AnswerSection(
    val title: String,
    val content: String,
    val anchor: String
)

class ArticleWebViewController {
    private var webView: WebView? = null

    internal fun bind(view: WebView) {
        webView = view
    }

    fun jumpTo(anchor: String) {
        webView?.evaluateJavascript(
            """
            (function() {
              var target = document.getElementById(${anchor.quoteJs()});
              if (target) target.scrollIntoView({behavior: 'smooth', block: 'start'});
            })();
            """.trimIndent(),
            null
        )
    }
}

@Composable
fun ArticleWebView(
    markdown: String,
    modifier: Modifier = Modifier.fillMaxSize(),
    allowInternalScroll: Boolean = true,
    compact: Boolean = false,
    structured: Boolean = false,
    controller: ArticleWebViewController? = null,
    hiddenUntilRendered: Boolean = true,
    placeholder: @Composable (() -> Unit)? = { RenderPlaceholder() }
) {
    val renderKey = remember(markdown, compact, structured) { MarkdownRenderCache.key(markdown, compact, structured) }
    var ready by remember(renderKey) { mutableStateOf(MarkdownRenderCache.isReady(renderKey)) }
    val latestReady = rememberUpdatedState {
        MarkdownRenderCache.markReady(renderKey)
        ready = true
    }

    LaunchedEffect(renderKey) {
        ready = MarkdownRenderCache.isReady(renderKey)
    }

    Box(modifier) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { context ->
                WebView(context).apply {
                    controller?.bind(this)
                    settings.javaScriptEnabled = true
                    settings.domStorageEnabled = true
                    settings.allowFileAccess = true
                    settings.allowContentAccess = true
                    addJavascriptInterface(
                        object {
                            @JavascriptInterface
                            fun ready() {
                                post { latestReady.value() }
                            }
                        },
                        "KaoyanRender"
                    )
                    webViewClient = object : WebViewClient() {
                        override fun onPageFinished(view: WebView, url: String?) {
                            view.evaluateJavascript(
                                """
                                (function() {
                                  var notified = false;
                                  function done() {
                                    if (notified) return;
                                    notified = true;
                                    setTimeout(function() {
                                      if (window.KaoyanRender) window.KaoyanRender.ready();
                                    }, 120);
                                  }
                                  if (window.MathJax && MathJax.startup && MathJax.startup.promise) {
                                    MathJax.startup.promise.then(done).catch(done);
                                    setTimeout(done, 2400);
                                  } else {
                                    setTimeout(done, 420);
                                  }
                                })();
                                """.trimIndent(),
                                null
                            )
                        }
                    }
                    isVerticalScrollBarEnabled = allowInternalScroll
                    overScrollMode = if (allowInternalScroll) {
                        android.view.View.OVER_SCROLL_IF_CONTENT_SCROLLS
                    } else {
                        android.view.View.OVER_SCROLL_NEVER
                    }
                    if (allowInternalScroll) {
                        setOnTouchListener { view, event ->
                            when (event.actionMasked) {
                                MotionEvent.ACTION_DOWN, MotionEvent.ACTION_MOVE -> view.parent?.requestDisallowInterceptTouchEvent(true)
                                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> view.parent?.requestDisallowInterceptTouchEvent(false)
                            }
                            false
                        }
                    }
                    setBackgroundColor(android.graphics.Color.TRANSPARENT)
                }
            },
            update = { webView ->
                controller?.bind(webView)
                webView.alpha = if (hiddenUntilRendered && !ready) 0f else 1f
                if (webView.tag != renderKey) {
                    webView.tag = renderKey
                    if (!MarkdownRenderCache.isReady(renderKey)) ready = false
                    webView.loadDataWithBaseURL(
                        "file:///android_asset/",
                        MarkdownRenderCache.htmlFor(markdown, compact, structured),
                        "text/html",
                        "utf-8",
                        null
                    )
                }
            }
        )
        AnimatedVisibility(visible = hiddenUntilRendered && !ready) {
            placeholder?.invoke()
        }
    }
}

@Composable
fun RenderPlaceholder(text: String = "正在整理公式排版") {
    val infinite = rememberInfiniteTransition(label = "render-placeholder-loop")
    val pulse by infinite.animateFloat(
        initialValue = 0.88f,
        targetValue = 1.12f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1100),
            repeatMode = RepeatMode.Reverse
        ),
        label = "render-placeholder-pulse"
    )
    Column(
        Modifier
            .fillMaxSize()
            .background(Card)
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Box(
            Modifier
                .size(28.dp)
                .scale(pulse)
                .background(Ink.copy(alpha = 0.08f), CircleShape)
                .border(1.dp, Ink.copy(alpha = 0.42f), CircleShape),
            contentAlignment = Alignment.Center
        ) {
            Box(Modifier.size(7.dp).background(Ink, CircleShape))
        }
        Spacer(Modifier.height(14.dp))
        Text(text, color = Ink, fontFamily = FontFamily.Serif, fontSize = 18.sp)
        Spacer(Modifier.height(6.dp))
        Text("完成后会一次性打开内容。", color = Muted, fontSize = 13.sp)
    }
}

fun markdownPreview(markdown: String, maxLength: Int = 120): String =
    normalizeMathMarkdown(markdown)
        .replace(Regex("""[#*_`>$\[\]\\{}]"""), "")
        .lineSequence()
        .map { it.trim() }
        .filter { it.isNotBlank() }
        .joinToString(" ")
        .take(maxLength)

fun parseStructuredAnswer(markdown: String): List<AnswerSection> {
    val normalized = normalizeMathMarkdown(markdown)
    val sections = mutableListOf<AnswerSection>()
    var currentTitle: String? = null
    val currentContent = StringBuilder()

    fun flush() {
        val title = currentTitle ?: return
        val content = currentContent.toString().trim()
        if (content.isNotBlank()) {
            sections += AnswerSection(
                title = title,
                content = content,
                anchor = sectionAnchor(title)
            )
        }
        currentContent.clear()
    }

    normalized.lineSequence().forEach { rawLine ->
        val title = headingTitle(rawLine)?.let { structuredTitleFor(it) }
        if (title != null) {
            flush()
            currentTitle = title
        } else if (currentTitle != null) {
            currentContent.append(rawLine).append('\n')
        }
    }
    flush()
    return mergeDuplicateSections(sections)
}

private fun mergeDuplicateSections(sections: List<AnswerSection>): List<AnswerSection> {
    val merged = linkedMapOf<String, AnswerSection>()
    sections.forEach { section ->
        val existing = merged[section.title]
        merged[section.title] = if (existing == null) {
            section
        } else {
            existing.copy(
                content = listOf(existing.content, section.content)
                    .map { it.trim() }
                    .filter { it.isNotBlank() }
                    .distinct()
                    .joinToString("\n\n")
            )
        }
    }
    return merged.values.toList()
}

private fun markdownToHtml(markdown: String, compact: Boolean = false, structured: Boolean = false): String {
    val normalized = normalizeMathMarkdown(markdown)
    val sections = if (structured) parseStructuredAnswer(normalized) else emptyList()
    val body = if (structured && sections.isNotEmpty()) {
        structuredSectionsToHtml(sections)
    } else {
        markdownLinesToHtml(normalized)
    }
    val bodyFontSize = if (compact) 14 else 16
    val bodyLineHeight = if (compact) "1.58" else "1.72"
    val paragraphMargin = if (compact) "3px 0" else "8px 0"
    return """
        <!doctype html>
        <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1"/>
          <script>
            window.MathJax = {
              tex: {
                inlineMath: [['\\(', '\\)'], ['$', '$']],
                displayMath: [['$$', '$$'], ['\\[', '\\]']],
                processEscapes: true,
                packages: {'[+]': ['noerrors', 'noundefined']}
              },
              options: {
                skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code']
              },
              chtml: {
                fontURL: 'file:///android_asset/mathjax/output/chtml/fonts/woff-v2'
              },
              startup: {
                typeset: true
              }
            };
          </script>
          <script defer src="mathjax/tex-chtml-full.js"></script>
          <style>
            body { margin: 0; padding: 0; background: transparent; color: #22201d; font-size: ${bodyFontSize}px; line-height: $bodyLineHeight; font-family: system-ui, -apple-system, sans-serif; }
            h1, h2, h3, h4 { font-family: Georgia, 'Songti SC', serif; font-weight: 400; margin: 18px 0 8px; }
            h1 { font-size: 24px; }
            h2 { font-size: 21px; }
            h3 { font-size: 18px; }
            h4 { font-size: 16px; }
            p { margin: $paragraphMargin; word-break: break-word; }
            li { margin: 6px 0 6px 18px; }
            mjx-container { overflow-x: auto; overflow-y: hidden; max-width: 100%; padding: 2px 0; }
            .math-block { overflow-x: auto; overflow-y: hidden; max-width: 100%; }
            strong { font-weight: 650; }
            .answer-section { border: 1px solid #d9d1c4; border-radius: 18px; background: #fffdf8; margin: 0 0 18px; overflow: hidden; }
            .section-title { display: flex; align-items: center; gap: 8px; padding: 13px 14px 10px; border-bottom: 1px solid rgba(217,209,196,.72); font-family: Georgia, 'Songti SC', serif; font-size: 19px; color: #22201d; }
            .section-index { width: 22px; height: 22px; border-radius: 50%; border: 1px solid #d9d1c4; display: inline-flex; align-items: center; justify-content: center; font-family: system-ui, sans-serif; font-size: 12px; color: #6c655b; background: #fbf8f1; flex: 0 0 auto; }
            .section-body { padding: 14px; }
          </style>
        </head>
        <body>$body</body>
        </html>
    """.trimIndent()
}

private val structuredTitles = listOf(
    "题目识别",
    "涉及知识点",
    "解题思路",
    "完整解答",
    "最终答案",
    "易错提醒",
    "复习卡片"
)

private val structuredTitleAliases = mapOf(
    "题目" to "题目识别",
    "题干识别" to "题目识别",
    "知识点" to "涉及知识点",
    "核心知识点" to "涉及知识点",
    "思路" to "解题思路",
    "完整解析" to "完整解答",
    "答案" to "最终答案",
    "结论" to "最终答案",
    "易错点" to "易错提醒",
    "易错分析" to "易错提醒",
    "最容易错的地方" to "易错提醒",
    "复习总结" to "复习卡片",
    "复习卡" to "复习卡片",
    "复习抓手" to "复习卡片"
)

private fun structuredTitleFor(title: String): String? {
    val direct = structuredTitles.associateBy { canonicalTitle(it) }
    val aliases = structuredTitleAliases.mapKeys { canonicalTitle(it.key) }
    val canonical = canonicalTitle(title)
    return direct[canonical] ?: aliases[canonical]
}

private fun structuredSectionsToHtml(sections: List<AnswerSection>): String =
    sections.joinToString("\n") { section ->
        val index = structuredTitles.indexOf(section.title).takeIf { it >= 0 }?.plus(1)?.toString().orEmpty()
        """
        <section class="answer-section" id="${section.anchor}">
          <div class="section-title"><span class="section-index">$index</span><span>${escapeHtml(section.title)}</span></div>
          <div class="section-body">${markdownLinesToHtml(section.content)}</div>
        </section>
        """.trimIndent()
    }

private fun headingTitle(line: String): String? {
    val trimmed = line.trim()
    val withoutMarkdown = trimmed
        .removePrefix("#")
        .removePrefix("#")
        .removePrefix("#")
        .removePrefix("#")
        .trim()
    return withoutMarkdown
        .removeSuffix("：")
        .removeSuffix(":")
        .trim()
        .takeIf { it.isNotBlank() }
}

private fun canonicalTitle(title: String): String =
    title.replace(Regex("""[\s#：:【】\[\]（）()]"""), "")

private fun sectionAnchor(title: String): String = when (title) {
    "题目识别" -> "section-question"
    "涉及知识点" -> "section-knowledge"
    "解题思路" -> "section-idea"
    "完整解答" -> "section-solution"
    "最终答案" -> "section-answer"
    "易错提醒" -> "section-mistakes"
    "复习卡片" -> "section-card"
    else -> "section-${title.hashCode()}"
}

private fun markdownLinesToHtml(markdown: String): String {
    val html = StringBuilder()
    var inMath = false
    markdown.split("\n").forEach { rawLine ->
        val line = rawLine.trimEnd()
        val trimmed = line.trim()
        when {
            !inMath && (trimmed == "\\[" || trimmed == "$$" || trimmed == "[") -> {
                inMath = true
                html.append("<div class=\"math-block\">$$\n")
            }
            inMath && (trimmed == "\\]" || trimmed == "$$" || trimmed == "]") -> {
                inMath = false
                html.append("\n$$</div>\n")
            }
            inMath -> html.append(escapeHtml(line)).append("\n")
            trimmed.startsWith("\\[") && trimmed.endsWith("\\]") -> {
                html.append("<div class=\"math-block\">$$")
                    .append(escapeHtml(trimmed.removePrefix("\\[").removeSuffix("\\]")))
                    .append("$$</div>\n")
            }
            trimmed.startsWith("[") && trimmed.endsWith("]") && looksLikeMath(trimmed.removePrefix("[").removeSuffix("]")) -> {
                html.append("<div class=\"math-block\">$$")
                    .append(escapeHtml(trimmed.removePrefix("[").removeSuffix("]")))
                    .append("$$</div>\n")
            }
            trimmed.startsWith("$$") && trimmed.endsWith("$$") && trimmed.length > 4 -> {
                html.append("<div class=\"math-block\">")
                    .append(escapeHtml(trimmed))
                    .append("</div>\n")
            }
            line.startsWith("#### ") -> html.append("<h4>${inlineMarkdown(escapeHtml(line.removePrefix("#### ")))}</h4>\n")
            line.startsWith("### ") -> html.append("<h3>${inlineMarkdown(escapeHtml(line.removePrefix("### ")))}</h3>\n")
            line.startsWith("## ") -> html.append("<h2>${inlineMarkdown(escapeHtml(line.removePrefix("## ")))}</h2>\n")
            line.startsWith("# ") -> html.append("<h1>${inlineMarkdown(escapeHtml(line.removePrefix("# ")))}</h1>\n")
            line.startsWith("- ") -> html.append("<li>${inlineMarkdown(escapeHtml(line.removePrefix("- ")))}</li>\n")
            line.isBlank() -> html.append("<br/>\n")
            else -> html.append("<p>${inlineMarkdown(escapeHtml(line))}</p>\n")
        }
    }
    if (inMath) html.append("\n$$</div>\n")
    return html.toString()
}

private fun normalizeMathMarkdown(markdown: String): String {
    var text = markdown
        .replace("※", "")
        .replace("\uFFFC", "")
        .replace("\u0000", "")
        .replace("\\\\(", "\\(")
        .replace("\\\\)", "\\)")
        .replace("\\\\[", "\\[")
        .replace("\\\\]", "\\]")
        .replace("\\，", "，")
        .replace("\\。", "。")
        .replace("\\、", "、")
        .replace("\\；", "；")
        .replace("\\：", "：")
        .replace("\\（", "（")
        .replace("\\）", "）")
        .replace("\\begin{equation}", "\\[")
        .replace("\\end{equation}", "\\]")
        .replace("\\begin{align}", "\\[\\begin{aligned}")
        .replace("\\end{align}", "\\end{aligned}\\]")
    text = Regex("""\\\\([A-Za-z]+)""").replace(text) { "\\${it.groupValues[1]}" }
    return text
}

private fun looksLikeMath(value: String): Boolean {
    val text = value.trim()
    if (text.length < 2) return false
    val markers = listOf("\\", "^", "_", "=", "+", "-", "\\frac", "\\sum", "\\int", "\\lim", "(", ")", "|")
    return markers.any { text.contains(it) }
}

private fun escapeHtml(value: String): String =
    value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")

private fun inlineMarkdown(value: String): String =
    value.replace(Regex("\\*\\*(.+?)\\*\\*"), "<strong>$1</strong>")

private fun String.quoteJs(): String =
    "'${replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n")}'"
