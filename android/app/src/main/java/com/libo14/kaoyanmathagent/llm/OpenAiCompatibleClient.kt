package com.libo14.kaoyanmathagent.llm

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import android.util.Base64
import com.libo14.kaoyanmathagent.data.ApiProfile
import kotlinx.coroutines.suspendCancellableCoroutine
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

data class ChatMessage(val role: String, val content: String)

private const val MAX_IMAGE_SIDE = 1600
private const val JPEG_QUALITY = 85
private const val MIN_JPEG_QUALITY = 65
private const val MAX_SOURCE_IMAGE_BYTES = 24L * 1024L * 1024L
private const val MAX_COMPRESSED_IMAGE_BYTES = 5L * 1024L * 1024L

class OpenAiCompatibleClient(private val context: Context) {
    private val http = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .build()

    suspend fun chat(
        profile: ApiProfile,
        messages: List<ChatMessage>,
        temperature: Double = 0.2,
        maxTokens: Int = 4000
    ): String {
        val payload = JSONObject()
            .put("model", profile.model)
            .put("temperature", temperature)
            .put("max_tokens", maxTokens)
            .put("messages", JSONArray(messages.map { JSONObject().put("role", it.role).put("content", it.content) }))
        return post(profile, payload)
    }

    suspend fun recognizeImage(profile: ApiProfile, imageUri: Uri, userHint: String): String {
        val dataUrl = compressedImageDataUrl(imageUri)

        val content = JSONArray()
            .put(JSONObject().put("type", "text").put("text", Prompts.imageRecognition(userHint)))
            .put(JSONObject().put("type", "image_url").put("image_url", JSONObject().put("url", dataUrl)))
        val payload = JSONObject()
            .put("model", profile.model)
            .put("temperature", 0.0)
            .put("max_tokens", 1600)
            .put("messages", JSONArray().put(JSONObject().put("role", "user").put("content", content)))
        return post(profile, payload)
    }

    private suspend fun post(profile: ApiProfile, payload: JSONObject): String {
        require(profile.apiKey.isNotBlank()) { "请先配置 API Key" }
        val url = normalizeChatUrl(profile.baseUrl)
        val request = Request.Builder()
            .url(url)
            .addHeader("Authorization", "Bearer ${profile.apiKey}")
            .addHeader("Content-Type", "application/json")
            .post(payload.toString().toRequestBody("application/json".toMediaType()))
            .build()
        return http.newCall(request).awaitContent()
    }

    private fun normalizeChatUrl(baseUrl: String): String {
        val trimmed = baseUrl.trim().trimEnd('/')
        return if (trimmed.endsWith("/chat/completions")) trimmed else "$trimmed/chat/completions"
    }

    private fun compressedImageDataUrl(imageUri: Uri): String {
        validateSourceImageSize(imageUri)
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        context.contentResolver.openInputStream(imageUri)?.use { input ->
            BitmapFactory.decodeStream(input, null, bounds)
        } ?: throw IllegalArgumentException("图片读取失败，请重新选择或拍摄题目。")

        val width = bounds.outWidth
        val height = bounds.outHeight
        if (width <= 0 || height <= 0) {
            throw IllegalArgumentException("图片解码失败，请换一张清晰截图或重新拍照。")
        }

        val decodeOptions = BitmapFactory.Options().apply {
            inSampleSize = sampleSizeFor(width, height, MAX_IMAGE_SIDE)
            inPreferredConfig = Bitmap.Config.ARGB_8888
        }
        val decoded = context.contentResolver.openInputStream(imageUri)?.use { input ->
            BitmapFactory.decodeStream(input, null, decodeOptions)
        } ?: throw IllegalArgumentException("图片解码失败，请换一张清晰截图或重新拍照。")

        val oriented = rotateBitmap(decoded, imageRotationDegrees(imageUri))
        val scaled = scaleBitmap(oriented, MAX_IMAGE_SIDE)
        if (oriented !== decoded) decoded.recycle()
        if (scaled !== oriented) oriented.recycle()

        val bytes = compressJpeg(scaled)
        scaled.recycle()
        val encoded = Base64.encodeToString(bytes, Base64.NO_WRAP)
        return "data:image/jpeg;base64,$encoded"
    }

    private fun validateSourceImageSize(imageUri: Uri) {
        val length = context.contentResolver.openAssetFileDescriptor(imageUri, "r")?.use { it.length } ?: -1L
        if (length > MAX_SOURCE_IMAGE_BYTES) {
            throw IllegalArgumentException("图片文件过大，请裁剪题目区域后再上传。")
        }
    }

    private fun sampleSizeFor(width: Int, height: Int, maxSide: Int): Int {
        var sample = 1
        var sampledWidth = width
        var sampledHeight = height
        while (sampledWidth / 2 >= maxSide || sampledHeight / 2 >= maxSide) {
            sample *= 2
            sampledWidth /= 2
            sampledHeight /= 2
        }
        return sample
    }

    private fun imageRotationDegrees(imageUri: Uri): Float =
        runCatching {
            context.contentResolver.openInputStream(imageUri)?.use { input ->
                when (ExifInterface(input).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
                    ExifInterface.ORIENTATION_ROTATE_90 -> 90f
                    ExifInterface.ORIENTATION_ROTATE_180 -> 180f
                    ExifInterface.ORIENTATION_ROTATE_270 -> 270f
                    else -> 0f
                }
            } ?: 0f
        }.getOrDefault(0f)

    private fun rotateBitmap(bitmap: Bitmap, degrees: Float): Bitmap {
        if (degrees == 0f) return bitmap
        val matrix = Matrix().apply { postRotate(degrees) }
        return Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
    }

    private fun scaleBitmap(bitmap: Bitmap, maxSide: Int): Bitmap {
        val longest = maxOf(bitmap.width, bitmap.height)
        if (longest <= maxSide) return bitmap
        val scale = maxSide.toFloat() / longest.toFloat()
        val width = (bitmap.width * scale).toInt().coerceAtLeast(1)
        val height = (bitmap.height * scale).toInt().coerceAtLeast(1)
        return Bitmap.createScaledBitmap(bitmap, width, height, true)
    }

    private fun compressJpeg(bitmap: Bitmap): ByteArray {
        var quality = JPEG_QUALITY
        var bytes: ByteArray
        do {
            val output = ByteArrayOutputStream()
            bitmap.compress(Bitmap.CompressFormat.JPEG, quality, output)
            bytes = output.toByteArray()
            quality -= 10
        } while (bytes.size > MAX_COMPRESSED_IMAGE_BYTES && quality >= MIN_JPEG_QUALITY)
        if (bytes.size > MAX_COMPRESSED_IMAGE_BYTES) {
            throw IllegalArgumentException("图片压缩后仍然过大，请裁剪题目区域后再上传。")
        }
        return bytes
    }

    private suspend fun Call.awaitContent(): String =
        suspendCancellableCoroutine { continuation ->
            continuation.invokeOnCancellation { cancel() }
            enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    if (!continuation.isActive) return
                    continuation.resumeWithException(e)
                }

                override fun onResponse(call: Call, response: Response) {
                    response.use {
                        if (!continuation.isActive) return
                        val body = it.body?.string().orEmpty()
                        if (!it.isSuccessful) {
                            continuation.resumeWithException(IllegalStateException("模型请求失败：HTTP ${it.code} $body"))
                            return
                        }
                        runCatching {
                            val json = JSONObject(body)
                            val content = json.optJSONArray("choices")
                                ?.optJSONObject(0)
                                ?.optJSONObject("message")
                                ?.optString("content")
                                ?.takeIf { content -> content.isNotBlank() }
                                ?: error("模型没有返回可展示的内容")
                            sanitizeModelContent(content)
                        }.fold(
                            onSuccess = { content -> continuation.resume(content) },
                            onFailure = { error -> continuation.resumeWithException(error) }
                        )
                    }
                }
            })
        }
}

object Prompts {
    fun imageRecognition(userHint: String): String = """
        你是考研数学题目识别助手。请把图片中的题目完整转写成可阅读文本。
        要求：
        1. 只输出题目本身，不要解答。
        2. 所有数学表达式都必须使用标准 LaTeX：行内公式用 \( ... \)，独立公式用 \[ ... \]。例如 \(f'(x)\ge 0\)、\(g(x)=f(0)(1-x)+f(1)x\)。
        3. 选择题必须完整识别 A/B/C/D 选项。
        4. 看不清的位置用“疑似”标注，不要编造。
        5. 不要输出“题目识别”“完整题目”“以下是题目”等标签或说明。
        6. 不要使用 Markdown 标题符号 #，不要使用 ※、特殊装饰符、乱码符号；不要把公式写成普通文本。
        7. 第一行必须直接从原题开始，例如“（9）设……”，不要添加任何额外文字。
        8. 用户补充：${userHint.ifBlank { "无" }}
    """.trimIndent()

    fun solveWithLocalContext(question: String, localContext: String): List<ChatMessage> = listOf(
        ChatMessage("system", """
            你是考研数学阅卷级解析老师。请优先利用用户本地题库资料，但不要机械复述。
            你的目标是让学生看懂、会做、会复习。
            输出 Markdown，数学公式必须使用标准 LaTeX：行内公式用 \( ... \)，独立公式用 \[ ... \]。不要使用纯文本形式表达关键公式。
            不要使用 ※、星花装饰、乱码符号。不要把公式写成无法渲染的普通文本。
            固定标题：题目识别、涉及知识点、解题思路、完整解答、最终答案、易错提醒、复习卡片。
            “题目识别”只能完整复述原题题干和选项/小问；该分区正文不要再写任何 Markdown 标题符号 #，不要写“题目识别：”“完整题目：”等标签。
            “涉及知识点”用于说明题型、考点、关键定理、常见变形和本题考查点。
            如果本地资料中的“题目识别”写成了题型介绍，请把这部分归入“涉及知识点”，并在“题目识别”中重新写出原题。
            如果本地检索资料标注为“弱匹配”，只能把它当作候选参考；必须说明年份或原题未确认，不能断言它就是用户要问的题。
        """.trimIndent()),
        ChatMessage("user", """
            【学生问题】
            $question

            【本地检索资料】
            $localContext

            请结合本地资料给出讲解；若本地资料不匹配，请以学生问题为准重新解答。
        """.trimIndent())
    )

    fun followUp(threadQuestion: String, threadAnswer: String, userQuestion: String): List<ChatMessage> = listOf(
        ChatMessage("system", """
            你是考研数学导学老师。现在是追问模式，不要重新检索整套题库。
            围绕当前题目和已有解析回答学生的具体疑问。回答要短、准、能继续学习。
            必要时补充另一种解法、关键考点、易错点或同类题方向。
            可按“直接回答、关键理由、同类题方向、复习提醒”组织；需要标题时只使用二级标题“## 标题”，不要使用 ### 或更深层级标题。
            数学公式必须使用标准 LaTeX：行内公式用 \( ... \)，独立公式用 \[ ... \]。不要使用 ※ 或乱码符号。
        """.trimIndent()),
        ChatMessage("user", """
            【当前题目】
            $threadQuestion

            【已有解析与追问记录】
            $threadAnswer

            【学生追问】
            $userQuestion
        """.trimIndent())
    )
}

private fun sanitizeModelContent(value: String): String =
    value.replace("※", "")
        .replace("\uFFFC", "")
        .replace("\u0000", "")
        .trim()
