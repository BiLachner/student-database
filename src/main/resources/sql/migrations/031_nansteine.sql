CREATE TABLE curriculum_nansteine (
    id INTEGER PRIMARY KEY,
    owner_teacher INTEGER NOT NULL REFERENCES teachers(id),
    subject INTEGER NOT NULL REFERENCES subjects(id),
    class INTEGER NOT NULL REFERENCES classes(id),
    semester INTEGER NOT NULL REFERENCES semesters(id),
    grade INTEGER NOT NULL,
    course_group INTEGER REFERENCES course_groups(id),
    name TEXT NOT NULL,
    tokens INTEGER NOT NULL CHECK(tokens > 0 AND tokens <= 105),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX uq_curriculum_nansteine_scope_name
    ON curriculum_nansteine(owner_teacher,subject,class,semester,COALESCE(course_group,0),name);
CREATE TABLE curriculum_nanstein_assignments (
    nanstein INTEGER NOT NULL REFERENCES curriculum_nansteine(id),
    student INTEGER NOT NULL REFERENCES students(id),
    assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(nanstein,student)
);
CREATE TABLE curriculum_nanstein_completions (
    nanstein INTEGER NOT NULL,
    student INTEGER NOT NULL,
    teacher INTEGER NOT NULL REFERENCES teachers(id),
    tokens INTEGER NOT NULL CHECK(tokens > 0 AND tokens <= 105),
    completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(nanstein,student),
    FOREIGN KEY(nanstein,student) REFERENCES curriculum_nanstein_assignments(nanstein,student)
);
