package de.igslandstuhl.database.server.sql;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;

import org.junit.jupiter.api.Test;

/** Migration 029: additive storage for optional flexible-task awards. */
class VariableFlexibleTaskAwardsMigrationTest {
    private static final Path ACTIVATION = Path.of("src/main/resources/sql/migrations/027_subject_grade_activation_and_identity.sql");
    private static final Path CLEANUP = Path.of("src/main/resources/sql/migrations/028_legacy_schema_cleanup.sql");
    private static final Path AWARDS = Path.of("src/main/resources/sql/migrations/029_variable_flexible_task_awards.sql");

    @Test
    void appliesAfter027And028WithoutChangingExistingRows() throws Exception {
        try (Connection c = database()) {
            seedB8Schema(c);
            exec(c, "INSERT INTO flexible_tasks VALUES(9,20,1,30,10,6,'Existing',4,NULL)");
            exec(c, "INSERT INTO completed_flexible_tasks(student,flexible_task) VALUES(40,9)");
            long tasks = scalar(c, "SELECT COUNT(*) FROM flexible_tasks");
            long completions = scalar(c, "SELECT COUNT(*) FROM completed_flexible_tasks");

            apply(c, ACTIVATION);
            apply(c, CLEANUP);
            apply(c, AWARDS);

            assertEquals(tasks, scalar(c, "SELECT COUNT(*) FROM flexible_tasks"));
            assertEquals(completions, scalar(c, "SELECT COUNT(*) FROM completed_flexible_tasks"));
            assertEquals(4, scalar(c, "SELECT tokens FROM flexible_tasks WHERE id=9"));
            assertEquals(0, scalar(c, "SELECT variable_tokens FROM flexible_tasks WHERE id=9"));
            assertNull(value(c, "SELECT awarded_tokens FROM completed_flexible_tasks WHERE student=40 AND flexible_task=9"));
        }
    }

    @Test
    void defaultsAndChecksProtectTheApprovedRanges() throws Exception {
        try (Connection c = database()) {
            seedB8Schema(c);
            apply(c, ACTIVATION);
            apply(c, CLEANUP);
            apply(c, AWARDS);

            exec(c, "INSERT INTO flexible_tasks(id,owner_teacher,subject,class,semester,grade,name,tokens) VALUES(10,20,1,30,10,6,'Default',4)");
            assertEquals(0, scalar(c, "SELECT variable_tokens FROM flexible_tasks WHERE id=10"));
            exec(c, "INSERT INTO flexible_tasks(id,owner_teacher,subject,class,semester,grade,name,tokens,variable_tokens) VALUES(11,20,1,30,10,6,'Fixed',4,0),(12,20,1,30,10,6,'Variable',4,1)");
            exec(c, "INSERT INTO completed_flexible_tasks(student,flexible_task,awarded_tokens) VALUES(40,10,NULL),(41,11,0),(42,12,1),(43,12,105)");
            assertEquals(4, scalar(c, "SELECT COUNT(*) FROM completed_flexible_tasks"));

            assertThrows(SQLException.class, () -> exec(c, "INSERT INTO flexible_tasks(id,owner_teacher,subject,class,semester,grade,name,tokens,variable_tokens) VALUES(13,20,1,30,10,6,'Bad',4,-1)"));
            assertThrows(SQLException.class, () -> exec(c, "INSERT INTO flexible_tasks(id,owner_teacher,subject,class,semester,grade,name,tokens,variable_tokens) VALUES(14,20,1,30,10,6,'Bad',4,2)"));
            assertThrows(SQLException.class, () -> exec(c, "INSERT INTO flexible_tasks(id,owner_teacher,subject,class,semester,grade,name,tokens,variable_tokens) VALUES(15,20,1,30,10,6,'Bad',4,NULL)"));
            assertThrows(SQLException.class, () -> exec(c, "INSERT INTO completed_flexible_tasks(student,flexible_task,awarded_tokens) VALUES(44,12,-1)"));
            assertThrows(SQLException.class, () -> exec(c, "INSERT INTO completed_flexible_tasks(student,flexible_task,awarded_tokens) VALUES(45,12,106)"));
        }
    }

    @Test
    void migrationIsReplaySafeForAlreadyAddedColumns() throws Exception {
        try (Connection c = database()) {
            seedB8Schema(c);
            apply(c, ACTIVATION);
            apply(c, CLEANUP);
            apply(c, AWARDS);
            assertThrows(SQLException.class, () -> apply(c, AWARDS));
        }
    }

    private static Connection database() throws SQLException {
        Connection c = DriverManager.getConnection("jdbc:sqlite::memory:");
        try (Statement s = c.createStatement()) { s.execute("PRAGMA foreign_keys=ON"); }
        return c;
    }

    private static void seedB8Schema(Connection c) throws SQLException {
        exec(c, "CREATE TABLE subjects(id INTEGER PRIMARY KEY,name TEXT NOT NULL)");
        exec(c, "INSERT INTO subjects VALUES(1,'Deutsch'),(2,'Englisch'),(3,'Mathematik'),(4,'Naturwissenschaften'),(5,'Gesellschaftslehre')");
        exec(c, "CREATE TABLE curriculum_subject_types(subject INTEGER,mode TEXT,assignment_group TEXT)");
        exec(c, "CREATE TABLE curriculum_grade_subjects(grade INTEGER,semester INTEGER,subject INTEGER)");
        exec(c, "CREATE TABLE curriculum_individual_assignments(student INTEGER,semester INTEGER,assignment_group TEXT,subject INTEGER)");
        exec(c, "CREATE TABLE student_curriculum_contexts(student INTEGER,subject INTEGER,semester INTEGER,teacher INTEGER,class INTEGER,grade INTEGER,course_group INTEGER)");
        exec(c, "CREATE TABLE curriculum_class_teachers(semester INTEGER,class INTEGER,subject INTEGER,teacher INTEGER)");
        exec(c, "CREATE TABLE curriculum_grade_teachers(semester INTEGER,grade INTEGER,subject INTEGER,teacher INTEGER)");
        exec(c, "CREATE TABLE course_groups(id INTEGER PRIMARY KEY,subject INTEGER,grade INTEGER,semester INTEGER,teacher INTEGER,assignment_group TEXT,name TEXT,active INTEGER)");
        exec(c, "CREATE TABLE course_group_members(course_group INTEGER,student INTEGER,PRIMARY KEY(course_group,student))");
        exec(c, "CREATE TABLE flexible_tasks(id INTEGER PRIMARY KEY,owner_teacher INTEGER,subject INTEGER,class INTEGER,semester INTEGER,grade INTEGER,name TEXT,tokens INTEGER,course_group INTEGER)");
        exec(c, "CREATE TABLE completed_flexible_tasks(student INTEGER,flexible_task INTEGER,last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(student,flexible_task))");
        exec(c, "CREATE TABLE gradesubjects(grade INTEGER,subject INTEGER)");
        exec(c, "CREATE TABLE student_subjects(student INTEGER,subject INTEGER)");
        exec(c, "CREATE TABLE curriculum_wpf_assignments(student INTEGER,semester INTEGER,subject INTEGER)");
    }

    private static void apply(Connection c, Path path) throws Exception {
        for (String statement : SQLiteConnection.splitSqlScript(Files.readString(path))) exec(c, statement);
    }

    private static void exec(Connection c, String sql, Object... args) throws SQLException {
        if (args.length == 0) {
            try (var s = c.createStatement()) { s.executeUpdate(sql); }
            return;
        }
        try (var p = c.prepareStatement(sql)) {
            for (int i = 0; i < args.length; i++) p.setObject(i + 1, args[i]);
            p.executeUpdate();
        }
    }

    private static long scalar(Connection c, String sql) throws SQLException {
        return ((Number) value(c, sql)).longValue();
    }

    private static Object value(Connection c, String sql) throws SQLException {
        try (var p = c.prepareStatement(sql); var r = p.executeQuery()) {
            assertTrue(r.next());
            return r.getObject(1);
        }
    }
}
