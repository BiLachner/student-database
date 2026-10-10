package de.igslandstuhl.database.api.curriculum;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;

/** Admin catalog and global subject-grade activation domain operations. */
public final class SubjectManagementService {
    private final Curriculum curriculum;

    public SubjectManagementService(Curriculum curriculum) {
        this.curriculum = Objects.requireNonNull(curriculum);
    }

    public List<Map<String, Object>> catalog(Curriculum.Actor actor) throws SQLException {
        requireAdmin(actor);
        return curriculum.transaction(c -> {
            List<Map<String, Object>> result = new ArrayList<>();
            for (Map<String, Object> row : Curriculum.rows(c,
                    "SELECT s.id,s.name,s.subject_code,t.mode,t.assignment_group,t.wpf "
                    + "FROM subjects s LEFT JOIN curriculum_subject_types t ON t.subject=s.id ORDER BY s.id")) {
                int subject = Curriculum.integer(row, "id");
                Map<String, Object> entry = new LinkedHashMap<>();
                entry.put("id", subject);
                entry.put("name", row.get("name"));
                entry.put("subjectCode", row.get("subject_code"));
                entry.put("mode", row.get("mode") == null ? "UNSPECIFIED" : String.valueOf(row.get("mode")));
                entry.put("assignmentGroup", row.get("assignment_group"));
                entry.put("wpf", isWpf(row));
                entry.put("activeGrades", SubjectGradeActivationRepository.activeGrades(c, subject));
                result.add(entry);
            }
            return result;
        });
    }

    public Map<String, Object> replaceActivations(Curriculum.Actor actor, int subject, List<Integer> grades) throws SQLException {
        requireAdmin(actor);
        validateGradeList(grades);
        return curriculum.transaction(c -> {
            Curriculum.require(c, "SELECT id FROM subjects WHERE id=?", subject);
            SolSubjectPolicy.validateGlobalActivation(c, subject, grades);
            SubjectGradeActivationRepository.replace(c, subject, grades);
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("subjectId", subject);
            result.put("activeGrades", SubjectGradeActivationRepository.activeGrades(c, subject));
            return result;
        });
    }

    static void validateGradeList(List<Integer> grades) {
        if (grades == null) throw Curriculum.error(400, "invalid_input", "grades must be a list.");
        if (grades.stream().anyMatch(Objects::isNull))
            throw Curriculum.error(400, "invalid_input", "grades must contain integers.");
        if (grades.stream().anyMatch(grade -> grade < 1 || grade > 13))
            throw Curriculum.error(400, "invalid_grade", "grade must be between 1 and 13.");
        if (grades.stream().distinct().count() != grades.size())
            throw Curriculum.error(400, "duplicate_grade", "grades must not contain duplicates.");
    }

    private static void requireAdmin(Curriculum.Actor actor) {
        if (actor == null) throw Curriculum.error(401, "unauthorized", "Please sign in.");
        Curriculum.admin(actor);
    }

    private static boolean isWpf(Map<String, Object> row) {
        Object wpf = row.get("wpf");
        if (wpf instanceof Number number && number.intValue() != 0) return true;
        return "INDIVIDUAL".equals(row.get("mode"))
                && "WPF".equals(String.valueOf(row.get("assignment_group")).strip().toUpperCase(Locale.ROOT));
    }
}
