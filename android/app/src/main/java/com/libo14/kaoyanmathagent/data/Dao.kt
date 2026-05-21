package com.libo14.kaoyanmathagent.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

@Dao
interface QuestionDao {
    @Query("select count(*) from questions")
    suspend fun count(): Int

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(items: List<QuestionEntity>)

    @Query(
        """
        select * from questions
        where searchText like '%' || :query || '%'
           or title like '%' || :query || '%'
           or knowledgePoints like '%' || :query || '%'
        order by year desc, questionNo asc
        limit :limit
        """
    )
    suspend fun search(query: String, limit: Int = 5): List<QuestionEntity>

    @Query(
        """
        select * from questions
        where year = :year
          and questionNo = :questionNo
        order by year desc, questionNo asc
        limit 1
        """
    )
    suspend fun findByYearAndNo(year: Int?, questionNo: Int?): QuestionEntity?

    @Query(
        """
        select * from questions
        where questionNo = :questionNo
        order by year desc, questionNo asc
        limit :limit
        """
    )
    suspend fun findByQuestionNo(questionNo: Int, limit: Int = 3): List<QuestionEntity>
}

@Dao
interface LearningAssetDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(item: LearningAssetEntity)

    @Query("select * from learning_assets where id = :id limit 1")
    suspend fun findById(id: String): LearningAssetEntity?

    @Query("select * from learning_assets where sourceThreadId = :sourceThreadId and type = 'thread_bundle' order by updatedAt desc limit 1")
    suspend fun findThreadBundle(sourceThreadId: String): LearningAssetEntity?

    @Query("select * from learning_assets order by updatedAt desc")
    suspend fun all(): List<LearningAssetEntity>

    @Query("select * from learning_assets where stage = :stage order by reviewDueAt asc, updatedAt desc")
    suspend fun byStageAll(stage: String): List<LearningAssetEntity>

    @Query("select * from learning_assets where stage = :stage and favorite = 1 order by updatedAt desc")
    suspend fun favoritesByStage(stage: String): List<LearningAssetEntity>

    @Query("select * from learning_assets where stage = :stage and type = :type order by updatedAt desc")
    suspend fun byStageAndType(stage: String, type: String): List<LearningAssetEntity>

    @Query("select * from learning_assets where stage = :stage and reviewDueAt <= :now order by reviewDueAt asc, updatedAt desc")
    suspend fun dueByStage(stage: String, now: Long): List<LearningAssetEntity>

    @Query("select count(*) from learning_assets where stage = :stage")
    suspend fun countByStage(stage: String): Int

    @Query("select count(*) from learning_assets where stage = :stage and favorite = 1")
    suspend fun countFavoritesByStage(stage: String): Int

    @Query("select count(*) from learning_assets where stage = :stage and reviewDueAt <= :now")
    suspend fun countDueByStage(stage: String, now: Long): Int

    @Query("update learning_assets set stage = :stage, updatedAt = :updatedAt where id = :id")
    suspend fun updateStage(id: String, stage: String, updatedAt: Long = System.currentTimeMillis())

    @Query("update learning_assets set favorite = :favorite, updatedAt = :updatedAt where id = :id")
    suspend fun updateFavorite(id: String, favorite: Boolean, updatedAt: Long = System.currentTimeMillis())

    @Query(
        """
        update learning_assets
        set mastery = :mastery,
            reviewDueAt = :reviewDueAt,
            reviewRepetitions = :reviewRepetitions,
            reviewIntervalDays = :reviewIntervalDays,
            reviewEaseFactor = :reviewEaseFactor,
            reviewLastAt = :reviewLastAt,
            reviewLapses = :reviewLapses,
            updatedAt = :updatedAt
        where id = :id
        """
    )
    suspend fun updateReviewState(
        id: String,
        mastery: Int,
        reviewDueAt: Long,
        reviewRepetitions: Int,
        reviewIntervalDays: Int,
        reviewEaseFactor: Double,
        reviewLastAt: Long,
        reviewLapses: Int,
        updatedAt: Long = System.currentTimeMillis()
    )

    @Query(
        """
        select * from learning_assets
        where title like '%' || :query || '%'
           or content like '%' || :query || '%'
           or knowledgePoints like '%' || :query || '%'
        order by updatedAt desc
        """
    )
    suspend fun search(query: String): List<LearningAssetEntity>

    @Query("select * from learning_assets where stage = :stage order by reviewDueAt asc, updatedAt desc limit :limit")
    suspend fun byStage(stage: String, limit: Int = 20): List<LearningAssetEntity>
}

@Dao
interface ThreadDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(item: ThreadEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun addMessage(item: ThreadMessageEntity)

    @Query("select * from threads where id = :id limit 1")
    suspend fun findById(id: String): ThreadEntity?

    @Query("select * from threads order by updatedAt desc limit :limit")
    suspend fun recent(limit: Int = 20): List<ThreadEntity>

    @Query("select * from thread_messages where threadId = :threadId order by createdAt asc")
    suspend fun messages(threadId: String): List<ThreadMessageEntity>
}
