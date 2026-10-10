package de.igslandstuhl.database.api.curriculum;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.Path;
import java.sql.PreparedStatement;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import de.igslandstuhl.database.server.sql.SQLiteConnection;

class SubjectManagementServiceTest {
    @TempDir Path directory;
    SQLiteConnection database;
    SubjectManagementService service;
    Curriculum.Actor admin = new Curriculum.Actor(true, 0);

    @BeforeEach
    void setup() throws Exception {
        database = new SQLiteConnection(directory.resolve("subject-management").toString());
        database.createTables();
        database.writeTransaction(c -> {
            insert(c, "INSERT INTO subjects(id,name) VALUES(1,'Deutsch'),(2,'Englisch'),(3,'Mathematik'),(4,'Naturwissenschaften'),(5,'Gesellschaftslehre')");
            insert(c, "INSERT INTO subjects(id,name) VALUES(10,'WPF Französisch'),(11,'Sport'),(12,'Ethik')");
            insert(c, "INSERT INTO curriculum_subject_types(subject,wpf,mode,assignment_group) VALUES(10,1,'INDIVIDUAL','WPF'),(12,0,'INDIVIDUAL','RELIGION_ETHIK')");
            return null;
        });
        database.migrateTables();
        service = new SubjectManagementService(new Curriculum(database));
    }

    @AfterEach
    void close() throws Exception {
        database.close();
    }

    @Test
    void catalogIncludesStableIdentityTypeAndSortedGlobalGradesWithoutPii() throws Exception {
        List<Map<String, Object>> catalog = service.catalog(admin);
        Map<String, Object> german = catalog.stream().filter(row -> ((Number) row.get("id")).intValue() == 1).findFirst().orElseThrow();
        assertEquals("Deutsch", german.get("name"));
        assertEquals("DE", german.get("subjectCode"));
        assertEquals("UNSPECIFIED", german.get("mode"));
        assertEquals(List.of(5, 6), german.get("activeGrades"));
        assertFalse(german.containsKey("email"));

        Map<String, Object> wpf = catalog.stream().filter(row -> ((Number) row.get("id")).intValue() == 10).findFirst().orElseThrow();
        assertEquals("INDIVIDUAL", wpf.get("mode"));
        assertEquals("WPF", wpf.get("assignmentGroup"));
        assertEquals(true, wpf.get("wpf"));
        assertEquals(List.of(6), wpf.get("activeGrades"));
    }

    @Test
    void replacementIsAtomicAndAppliesTheFullState() throws Exception {
        assertEquals(List.of(5, 6), service.replaceActivations(admin, 1, List.of(6, 5)).get("activeGrades"));
        assertEquals(List.of(6), service.replaceActivations(admin, 1, List.of(6)).get("activeGrades"));
        assertEquals(List.of(), service.replaceActivations(admin, 1, List.of()).get("activeGrades"));

        assertThrows(CurriculumException.class, () -> service.replaceActivations(admin, 10, List.of(5, 6)));
        Map<String, Object> wpf = service.catalog(admin).stream().filter(row -> ((Number) row.get("id")).intValue() == 10).findFirst().orElseThrow();
        assertEquals(List.of(6), wpf.get("activeGrades"));
    }

    @Test
    void religionOtherDuplicateAndInvalidGradeRequestsAreRejected() throws Exception {
        assertThrows(CurriculumException.class, () -> service.replaceActivations(admin, 12, List.of(6)));
        assertThrows(CurriculumException.class, () -> service.replaceActivations(admin, 11, List.of(5)));
        assertThrows(CurriculumException.class, () -> service.replaceActivations(admin, 1, List.of(5, 5)));
        assertThrows(CurriculumException.class, () -> service.replaceActivations(admin, 1, List.of(0)));
        assertThrows(CurriculumException.class, () -> service.replaceActivations(admin, 1, List.of(14)));
        assertThrows(CurriculumException.class, () -> service.replaceActivations(admin, 999, List.of(7)));
    }

    @Test
    void nonSolGradesRemainConfigurable() throws Exception {
        assertEquals(List.of(7), service.replaceActivations(admin, 11, List.of(7)).get("activeGrades"));
    }

    @Test
    void subjectManagementRequiresAdministrator() {
        Curriculum.Actor teacher = new Curriculum.Actor(false, 42);
        assertEquals(403, assertThrows(CurriculumException.class, () -> service.catalog(teacher)).status);
        assertEquals(403, assertThrows(CurriculumException.class, () -> service.replaceActivations(teacher, 1, List.of(5))).status);
        assertEquals(401, assertThrows(CurriculumException.class, () -> service.catalog(null)).status);
    }

    private static void insert(java.sql.Connection c, String sql) throws java.sql.SQLException {
        try (PreparedStatement statement = c.prepareStatement(sql)) { statement.executeUpdate(); }
    }
}
