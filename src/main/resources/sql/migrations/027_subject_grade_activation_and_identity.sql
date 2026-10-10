ALTER TABLE subjects ADD COLUMN subject_code TEXT;

CREATE UNIQUE INDEX uq_subjects_subject_code
ON subjects(subject_code)
WHERE subject_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS subject_grade_activation (
    subject INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    grade INTEGER NOT NULL CHECK (grade BETWEEN 1 AND 13),
    PRIMARY KEY(subject, grade)
);

CREATE INDEX IF NOT EXISTS idx_subject_grade_activation_grade_subject
ON subject_grade_activation(grade, subject);

CREATE TEMP TABLE subject_grade_activation_027_core_guard (
    valid INTEGER NOT NULL CHECK (valid = 1)
);

INSERT INTO subject_grade_activation_027_core_guard(valid)
SELECT CASE WHEN
    (SELECT COUNT(*) FROM subjects WHERE name = 'Deutsch') = 1
    AND (SELECT COUNT(*) FROM subjects WHERE name = 'Englisch') = 1
    AND (SELECT COUNT(*) FROM subjects WHERE name = 'Mathematik') = 1
    AND (SELECT COUNT(*) FROM subjects WHERE name = 'Naturwissenschaften') = 1
    AND (SELECT COUNT(*) FROM subjects WHERE name = 'Gesellschaftslehre') = 1
    THEN 1 ELSE 0 END;

UPDATE subjects SET subject_code = CASE name
    WHEN 'Deutsch' THEN 'DE'
    WHEN 'Englisch' THEN 'EN'
    WHEN 'Mathematik' THEN 'MATH'
    WHEN 'Naturwissenschaften' THEN 'NAWI'
    WHEN 'Gesellschaftslehre' THEN 'GL'
    ELSE subject_code END
WHERE name IN ('Deutsch', 'Englisch', 'Mathematik', 'Naturwissenschaften', 'Gesellschaftslehre');

INSERT OR IGNORE INTO subject_grade_activation(subject, grade)
SELECT id, grade
FROM subjects
JOIN (SELECT 5 AS grade UNION ALL SELECT 6) grades
WHERE subject_code IN ('DE', 'EN', 'MATH', 'NAWI', 'GL');

INSERT OR IGNORE INTO subject_grade_activation(subject, grade)
SELECT t.subject, 6
FROM curriculum_subject_types t
WHERE t.mode = 'INDIVIDUAL'
  AND t.assignment_group = 'WPF';

DROP TABLE subject_grade_activation_027_core_guard;
