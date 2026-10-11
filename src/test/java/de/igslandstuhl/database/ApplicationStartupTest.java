package de.igslandstuhl.database;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.junit.jupiter.api.Test;

import de.igslandstuhl.database.server.sql.SQLiteConnection;

class ApplicationStartupTest {
    @Test
    void repeatedNormalStartupPreservesCourseGroupMembers() throws Exception {
        Path directory = Files.createTempDirectory("student-database-startup-");
        Path database = directory.resolve("startup");
        try (SQLiteConnection connection = new SQLiteConnection(database.toString())) {
            connection.createTables();
            connection.writeTransaction(c -> {
                try (var statement = c.prepareStatement("INSERT OR IGNORE INTO subjects(name) VALUES (?)")) {
                    for (String subject : List.of("Deutsch", "Englisch", "Mathematik", "Naturwissenschaften", "Gesellschaftslehre")) {
                        statement.setString(1, subject);
                        statement.addBatch();
                    }
                    statement.executeBatch();
                }
                return null;
            });
            Application.initializeDatabase(connection);
            connection.writeTransaction(c -> {
                try (var statement = c.prepareStatement(
                        "INSERT INTO course_group_members(course_group,student) VALUES(?,?)")) {
                    statement.setInt(1, 900001);
                    statement.setInt(2, 900002);
                    statement.executeUpdate();
                }
                return null;
            });
            List<String> expected = members(connection);
            for (int startup = 0; startup < 3; startup++) {
                Application.initializeDatabase(connection);
                assertEquals(expected, members(connection), "startup #" + (startup + 1));
            }
        } finally {
            Files.deleteIfExists(Path.of(database + ".db"));
            Files.deleteIfExists(directory);
        }
    }

    private static List<String> members(SQLiteConnection connection) throws Exception {
        try (var statement = connection.getSQLConnection().prepareStatement(
                "SELECT course_group || ':' || student FROM course_group_members ORDER BY course_group,student");
             var rows = statement.executeQuery()) {
            var result = new java.util.ArrayList<String>();
            while (rows.next()) result.add(rows.getString(1));
            return result;
        }
    }
}
