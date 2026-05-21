package com.libo14.kaoyanmathagent.data

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

data class ApiProfile(
    val apiKey: String = "",
    val baseUrl: String = "https://api.deepseek.com/v1",
    val model: String = "deepseek-chat"
)

data class AppSettings(
    val main: ApiProfile = ApiProfile(),
    val useSeparateVision: Boolean = false,
    val vision: ApiProfile = ApiProfile(model = "Qwen/Qwen2.5-VL-32B-Instruct")
) {
    val configured: Boolean get() = main.apiKey.isNotBlank() && main.baseUrl.isNotBlank() && main.model.isNotBlank()
    val visionProfile: ApiProfile get() = if (useSeparateVision) vision else main
}

class SettingsStore(context: Context) {
    private val prefs = runCatching {
        val key = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            "secure_settings",
            key,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }.getOrElse {
        context.getSharedPreferences("settings", Context.MODE_PRIVATE)
    }

    fun load(): AppSettings = AppSettings(
        main = ApiProfile(
            apiKey = prefs.getString("main_api_key", "") ?: "",
            baseUrl = prefs.getString("main_base_url", "https://api.deepseek.com/v1") ?: "https://api.deepseek.com/v1",
            model = prefs.getString("main_model", "deepseek-chat") ?: "deepseek-chat"
        ),
        useSeparateVision = prefs.getBoolean("use_separate_vision", false),
        vision = ApiProfile(
            apiKey = prefs.getString("vision_api_key", "") ?: "",
            baseUrl = prefs.getString("vision_base_url", "https://api.siliconflow.cn/v1") ?: "https://api.siliconflow.cn/v1",
            model = prefs.getString("vision_model", "Qwen/Qwen2.5-VL-32B-Instruct") ?: "Qwen/Qwen2.5-VL-32B-Instruct"
        )
    )

    fun save(settings: AppSettings) {
        prefs.edit()
            .putString("main_api_key", settings.main.apiKey)
            .putString("main_base_url", settings.main.baseUrl)
            .putString("main_model", settings.main.model)
            .putBoolean("use_separate_vision", settings.useSeparateVision)
            .putString("vision_api_key", settings.vision.apiKey)
            .putString("vision_base_url", settings.vision.baseUrl)
            .putString("vision_model", settings.vision.model)
            .apply()
    }
}
