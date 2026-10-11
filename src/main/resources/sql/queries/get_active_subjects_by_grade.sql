SELECT subjects.*
FROM subjects
INNER JOIN subject_grade_activation
    ON subjects.id = subject_grade_activation.subject
WHERE subject_grade_activation.grade = ?
ORDER BY subjects.name, subjects.id
