package de.igslandstuhl.database.api.curriculum;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;

/** Read-only access to global subject availability by grade. */
final class SubjectGradeActivationRepository {
    private SubjectGradeActivationRepository() {}

    static boolean schemaAvailable(Connection c) throws SQLException {
        try (var s = c.prepareStatement("SELECT 1 FROM sqlite_master WHERE type='table' AND name='subject_grade_activation'")) {
            try (var r = s.executeQuery()) { return r.next(); }
        }
    }

    static boolean isActive(Connection c, int subject, int grade) throws SQLException {
        if (!schemaAvailable(c)) return false;
        try (var s = c.prepareStatement("SELECT 1 FROM subject_grade_activation WHERE subject=? AND grade=?")) {
            s.setInt(1, subject); s.setInt(2, grade);
            try (var r = s.executeQuery()) { return r.next(); }
        }
    }

    static List<Integer> activeGrades(Connection c, int subject) throws SQLException {
        List<Integer> grades = new ArrayList<>();
        if (!schemaAvailable(c)) return grades;
        try (var s = c.prepareStatement("SELECT grade FROM subject_grade_activation WHERE subject=? ORDER BY grade")) {
            s.setInt(1, subject);
            try (var r = s.executeQuery()) { while (r.next()) grades.add(r.getInt(1)); }
        }
        return List.copyOf(grades);
    }

    static List<Integer> activeSubjectIds(Connection c, int grade) throws SQLException {
        List<Integer> subjects = new ArrayList<>();
        if (!schemaAvailable(c)) return subjects;
        try (var s = c.prepareStatement("SELECT subject FROM subject_grade_activation WHERE grade=? ORDER BY subject")) {
            s.setInt(1, grade);
            try (var r = s.executeQuery()) { while (r.next()) subjects.add(r.getInt(1)); }
        }
        return List.copyOf(subjects);
    }
}
