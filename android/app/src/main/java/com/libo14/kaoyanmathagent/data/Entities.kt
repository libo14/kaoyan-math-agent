package com.libo14.kaoyanmathagent.data

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "questions")
data class QuestionEntity(
    @PrimaryKey val id: String,
    val year: Int?,
    val subject: String,
    val questionNo: Int?,
    val type: String,
    val title: String,
    val problemText: String,
    val knowledgePoints: String,
    val answerMarkdown: String,
    val searchText: String,
    val updatedAt: Long = System.currentTimeMillis()
)

@Entity(tableName = "learning_assets")
data class LearningAssetEntity(
    @PrimaryKey val id: String,
    val type: String,
    val stage: String,
    val title: String,
    val content: String,
    val sourceQuestionId: String?,
    val sourceThreadId: String? = null,
    val knowledgePoints: String,
    val mastery: Int,
    val favorite: Boolean,
    val reviewDueAt: Long,
    val reviewRepetitions: Int = 0,
    val reviewIntervalDays: Int = 0,
    val reviewEaseFactor: Double = 2.5,
    val reviewLastAt: Long? = null,
    val reviewLapses: Int = 0,
    val createdAt: Long,
    val updatedAt: Long
)

@Entity(tableName = "threads")
data class ThreadEntity(
    @PrimaryKey val id: String,
    val title: String,
    val questionText: String,
    val answerMarkdown: String,
    val sourceQuestionId: String?,
    val createdAt: Long,
    val updatedAt: Long
)

@Entity(tableName = "thread_messages")
data class ThreadMessageEntity(
    @PrimaryKey val id: String,
    val threadId: String,
    val role: String,
    val content: String,
    val createdAt: Long
)
