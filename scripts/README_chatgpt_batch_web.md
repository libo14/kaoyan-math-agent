# ChatGPT 网页版批量生成真题解析

这个脚本会打开 Windows Chrome，通过你自己的 ChatGPT 登录态批量处理试卷文件：

```text
试卷文件夹
  2023考研数学一真题.pdf
  2022考研数学二真题.pdf
  2021考研数学三真题.pdf
```

脚本会按文件名识别年份和科目，把文件上传到 ChatGPT 网页版，然后使用 `prompts/chatgpt_batch_exam_prompt.md` 里的提示词生成 Markdown，最后保存到：

```text
data/chatgpt_outputs/
```

## 第一次运行

在项目根目录双击或运行：

```bat
run-chatgpt-batch.bat "D:\你的真题文件夹"
```

第一次会打开一个独立 Chrome 窗口。如果 ChatGPT 要求登录，请在这个窗口里手动登录。登录完成后脚本会继续执行。

## 命令行运行

```bat
node scripts\chatgpt_batch_web.js --input "D:\你的真题文件夹" --output "data\chatgpt_outputs"
```

可选参数：

```text
--delay 8000          每份试卷之间等待多少毫秒
--timeout 1200000     单份试卷最长等待时间，默认 20 分钟
--start-index 5       从第 6 个文件开始续跑
--profile 路径        指定 Chrome 登录缓存目录
```

## 注意事项

- 脚本不会绕过 ChatGPT 的登录、验证码、风控或使用限制。
- 如果网页要求继续生成、验证身份、重新登录，脚本可能暂停或超时，需要你手动处理后重新运行。
- 已生成的 `.md` 文件不会重复覆盖，重新运行会自动跳过。
- ChatGPT 网页版按钮和页面结构可能变化，如果脚本突然找不到上传按钮或发送按钮，需要调整选择器。

## 导入项目数据库

生成 `.md` 后，可以把对应文件交给现有题库导入流程，拆成逐题目录后运行：

```bat
python scripts\build_question_bank.py --input data\raw --output data\processed
```
