# 研数导学 Android

这是当前项目的 Android 原生迁移版本，采用 Kotlin + Jetpack Compose + Room + OkHttp。

## 当前能力

- 首次启动配置主 API。
- 支持 OpenAI-compatible 接口：DeepSeek、硅基流动、Xiaomi MiMo、自定义服务商。
- 设置页可单独配置视觉识别 API。
- 内置 `question_bank.jsonl` 作为本地题库。
- 支持 `.md`、`.txt`、`.json`、`.jsonl` 手动导入。
- 学习页支持文字提问、相机拍题、相册选图、发送解析、围绕当前题目追问。
- 中枢用于基础/强化阶段复习调度。
- 收藏夹保存题目解析、复习卡和学习资产。

## 运行方式

1. 用 Android Studio 打开 `android/` 文件夹。
2. 等待 Gradle 同步。
3. 连接 Android 手机或启动模拟器。
4. 运行 `app`。

当前仓库环境没有安装 JDK / Gradle / Android SDK，因此这里没有提交 APK。Android Studio 同步后即可构建。
