-- Destructive B8 cleanup. The product decision is to discard all legacy rows;
-- this migration deliberately contains no legacy-to-canonical backfill.
CREATE TEMP TABLE legacy_schema_cleanup_028_guard (
    valid INTEGER NOT NULL CHECK (valid = 1)
);

INSERT INTO legacy_schema_cleanup_028_guard(valid)
SELECT CASE WHEN
    EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'subject_grade_activation')
    AND EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'curriculum_grade_subjects')
    AND EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'curriculum_individual_assignments')
    AND EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'student_curriculum_contexts')
    AND EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'curriculum_subject_types')
    THEN 1 ELSE 0 END;

DROP TABLE legacy_schema_cleanup_028_guard;

DROP TABLE IF EXISTS curriculum_wpf_assignments;
DROP TABLE IF EXISTS student_subjects;
DROP TABLE IF EXISTS gradesubjects;
