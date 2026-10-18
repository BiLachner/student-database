ALTER TABLE student_curriculum_stage_assessments
    ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0
    CHECK (failed_attempts BETWEEN 0 AND 2);
