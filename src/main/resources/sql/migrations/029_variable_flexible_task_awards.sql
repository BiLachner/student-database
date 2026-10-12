ALTER TABLE flexible_tasks
    ADD COLUMN variable_tokens INTEGER NOT NULL DEFAULT 0
    CHECK(variable_tokens IN (0, 1));

ALTER TABLE completed_flexible_tasks
    ADD COLUMN awarded_tokens INTEGER
    CHECK(awarded_tokens IS NULL OR awarded_tokens BETWEEN 0 AND 105);
