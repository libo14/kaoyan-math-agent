package com.libo14.kaoyanmathagent.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [
        QuestionEntity::class,
        LearningAssetEntity::class,
        ThreadEntity::class,
        ThreadMessageEntity::class
    ],
    version = 3,
    exportSchema = true
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun questionDao(): QuestionDao
    abstract fun learningAssetDao(): LearningAssetDao
    abstract fun threadDao(): ThreadDao

    companion object {
        @Volatile private var instance: AppDatabase? = null

        private val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(database: SupportSQLiteDatabase) {
                database.execSQL("ALTER TABLE learning_assets ADD COLUMN reviewRepetitions INTEGER NOT NULL DEFAULT 0")
                database.execSQL("ALTER TABLE learning_assets ADD COLUMN reviewIntervalDays INTEGER NOT NULL DEFAULT 0")
                database.execSQL("ALTER TABLE learning_assets ADD COLUMN reviewEaseFactor REAL NOT NULL DEFAULT 2.5")
                database.execSQL("ALTER TABLE learning_assets ADD COLUMN reviewLastAt INTEGER")
                database.execSQL("ALTER TABLE learning_assets ADD COLUMN reviewLapses INTEGER NOT NULL DEFAULT 0")
            }
        }

        private val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(database: SupportSQLiteDatabase) {
                database.execSQL("ALTER TABLE learning_assets ADD COLUMN sourceThreadId TEXT")
            }
        }

        fun get(context: Context): AppDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "kaoyan_math_agent.db"
                )
                    .addMigrations(MIGRATION_1_2, MIGRATION_2_3)
                    .build()
                    .also { instance = it }
            }
    }
}
