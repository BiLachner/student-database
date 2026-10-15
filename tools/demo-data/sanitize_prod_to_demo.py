#!/usr/bin/env python3
"""Fail-closed PROD snapshot -> synthetic DEMO database transformer.

It never reads or writes the live PROD/DEMO paths.  The self-test creates its
own synthetic database and is the only mode used on DEV in this task.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sqlite3
import sys
import tempfile
from pathlib import Path

BLOCKED = 20
STAGED_ROOT = Path("/srv/arcanum/dev/validation")
FORBIDDEN = ("/srv/arcanum/prod", "/srv/arcanum/demo")

KNOWN_TABLES = {
    "admins", "archived_subjects", "archived_teachers", "classes",
    "completed_flexible_tasks", "completed_individual_tasks",
    "completed_unscheduled_tasks", "course_group_flexible_task_releases",
    "course_group_flexible_topic_releases", "course_group_members",
    "course_group_task_releases", "course_group_topic_releases", "course_groups",
    "curriculum_class_teachers", "curriculum_class_tutors",
    "curriculum_completion_transfers", "curriculum_enrolled_students",
    "curriculum_grade_subjects", "curriculum_grade_teachers",
    "curriculum_individual_assignments", "curriculum_subject_types",
    "curriculum_task_releases", "curriculum_topic_releases",
    "flexible_task_releases", "flexible_task_topics", "flexible_tasks",
    "flexible_topic_releases", "flexible_topics", "individual_tasks",
    "school_years", "semesters", "student_active_curriculum_stages",
    "student_curriculum_contexts", "student_curriculum_stage_assessments",
    "student_graduation_history", "student_subject_requests", "student_topics",
    "students", "subjects", "subject_grade_activation", "tasks", "taskstats",
    "teacher_classes", "teacher_subjects", "teachers", "topics",
    "unscheduled_tasks", "course_group_unique_indexes_migration_marker",
}

KNOWN_COLUMNS = {
    "admins": {"username", "password_hash"},
    "archived_subjects": {"subject", "archived_at"},
    "archived_teachers": {"teacher", "archived_at"},
    "classes": {"id", "label", "grade", "active"},
    "completed_flexible_tasks": {"student", "flexible_task", "last_updated", "awarded_tokens"},
    "completed_individual_tasks": {"student", "individual_task", "last_updated"},
    "completed_unscheduled_tasks": {"student", "unscheduled_task", "last_updated"},
    "course_group_members": {"course_group", "student"},
    "course_group_topic_releases": {"course_group", "topic", "active"},
    "course_group_task_releases": {"course_group", "task", "active"},
    "course_group_flexible_topic_releases": {"course_group", "flexible_topic", "active"},
    "course_group_flexible_task_releases": {"course_group", "flexible_task", "active"},
    "course_groups": {"id", "subject", "grade", "semester", "teacher", "assignment_group", "name", "active"},
    "curriculum_class_teachers": {"semester", "class", "subject", "teacher"},
    "curriculum_class_tutors": {"semester", "class", "teacher", "tutor_slot"},
    "curriculum_completion_transfers": {"student", "source_task", "target_task", "transferred_at"},
    "curriculum_enrolled_students": {"student", "semester", "grade"},
    "curriculum_grade_subjects": {"grade", "semester", "subject"},
    "curriculum_grade_teachers": {"semester", "grade", "subject", "teacher"},
    "curriculum_individual_assignments": {"student", "semester", "assignment_group", "subject"},
    "curriculum_subject_types": {"subject", "wpf", "mode", "assignment_group"},
    "curriculum_task_releases": {"teacher", "class", "subject", "semester", "task", "active"},
    "curriculum_topic_releases": {"teacher", "class", "subject", "semester", "topic", "active"},
    "flexible_task_releases": {"teacher", "class", "subject", "semester", "flexible_task", "active"},
    "flexible_task_topics": {"flexible_task", "flexible_topic"},
    "flexible_tasks": {"id", "owner_teacher", "subject", "class", "semester", "grade", "name", "tokens", "variable_tokens", "course_group"},
    "flexible_topic_releases": {"teacher", "class", "subject", "semester", "flexible_topic", "active"},
    "flexible_topics": {"id", "owner_teacher", "subject", "class", "semester", "grade", "course_group", "name"},
    "individual_tasks": {"id", "name", "tokens", "subject_id"},
    "school_years": {"id", "label", "week_count", "current_week", "start_date", "end_date", "current_semester"},
    "semesters": {"id", "label", "position", "school_year", "archived"},
    "student_active_curriculum_stages": {"student", "subject", "semester", "central_task", "flexible_task", "last_updated"},
    "student_curriculum_contexts": {"student", "subject", "semester", "teacher", "class", "grade", "course_group"},
    "student_curriculum_stage_assessments": {"student", "subject", "semester", "stage_type", "stage_id", "status", "last_updated"},
    "student_graduation_history": {"id", "student", "old_graduation_level", "new_graduation_level", "changed_at", "teacher", "semester"},
    "student_subject_requests": {"student", "subject", "semester", "request_type", "last_updated"},
    "student_topics": {"student_id", "subject_id", "topic_id"},
    "students": {"id", "first_name", "last_name", "email", "password", "class", "graduation_level", "active"},
    "subjects": {"id", "name", "subject_code"},
    "course_group_unique_indexes_migration_marker": {"id"},
    "subject_grade_activation": {"subject", "grade"},
    "tasks": {"id", "topic", "name", "niveau", "stage_number", "tokens"},
    "taskstats": {"student", "task", "status", "last_updated"},
    "teacher_classes": {"teacher_id", "class_id"},
    "teacher_subjects": {"teacher_id", "subject_id"},
    "teachers": {"id", "first_name", "last_name", "email", "password"},
    "topics": {"id", "name", "subject", "grade", "resource", "number", "semester"},
    "unscheduled_tasks": {"id", "name", "class", "subject", "max_tokens"},
}

PERFORMANCE_TABLES = {
    "completed_flexible_tasks", "completed_individual_tasks",
    "completed_unscheduled_tasks", "curriculum_completion_transfers",
    "student_active_curriculum_stages", "student_curriculum_stage_assessments",
    "student_graduation_history", "student_subject_requests", "student_topics",
    "taskstats",
}

CLASS_RENAME = {
    (5, "5a"): "5c", (5, "5b"): "5a", (5, "5c"): "5d", (5, "5d"): "5b",
    (6, "6a"): "6b", (6, "6b"): "6c", (6, "6c"): "6d", (6, "6d"): "6a",
}

REVIEWED_TEXT_FIELDS = {
    "classes.label", "school_years.label", "semesters.label", "subjects.name",
    "subjects.subject_code", "topics.name", "tasks.name", "flexible_topics.name",
    "flexible_tasks.name", "individual_tasks.name", "unscheduled_tasks.name",
    "course_groups.name", "curriculum_subject_types.mode",
    "curriculum_subject_types.assignment_group", "curriculum_individual_assignments.assignment_group",
    "student_curriculum_stage_assessments.stage_type", "student_curriculum_stage_assessments.status",
    "student_subject_requests.request_type",
}


class BlockedError(RuntimeError):
    pass


def block(message: str) -> None:
    raise BlockedError(message)


def safe_path(path: Path, *, output: bool = False) -> Path:
    path = path.expanduser().absolute()
    resolved = Path(os.path.realpath(path))
    text = str(resolved)
    if any(text == root or text.startswith(root + "/") for root in FORBIDDEN):
        block("live PROD/DEMO paths are refused")
    if output and not str(resolved).startswith(str(STAGED_ROOT) + "/"):
        block("output must be below the controlled DEV validation root")
    if path.is_symlink() or (path.exists() and resolved != path):
        block("symlinked paths are refused")
    return path


def read_json(path: Path) -> dict:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        block(f"cannot read controlled manifest: {exc}")
    if not isinstance(data, dict):
        block("controlled manifest must be a JSON object")
    return data


def check_provenance(data: dict) -> None:
    if data.get("kind") != "arcanum-sanitized-positive-list-v1":
        block("missing or invalid sanitized positive-list provenance")
    if data.get("source_environment") != "prod":
        block("source environment is not explicitly PROD")
    if data.get("raw_database_active") is not False:
        block("raw PROD database must never be marked as an active DEMO database")
    if not data.get("schema_commit") or not data.get("reviewed_tables"):
        block("provenance lacks schema commit or reviewed table list")
    if set(data.get("reviewed_text_fields", [])) != REVIEWED_TEXT_FIELDS:
        block("provenance lacks the exact reviewed text-field policy")


def connect(path: Path, read_only: bool) -> sqlite3.Connection:
    if read_only:
        db = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    else:
        db = sqlite3.connect(path)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    return db


def table_names(db: sqlite3.Connection) -> set[str]:
    return {r[0] for r in db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    )}


def require_schema(db: sqlite3.Connection) -> None:
    names = table_names(db)
    unknown = sorted(names - KNOWN_TABLES)
    missing = sorted({"classes", "students", "teachers", "subjects", "semesters",
                      "topics", "tasks", "student_curriculum_contexts",
                      "flexible_tasks", "completed_flexible_tasks"} - names)
    if unknown:
        block("unreviewed tables present: " + ",".join(unknown))
    if missing:
        block("required tables missing: " + ",".join(missing))
    for table in sorted(names):
        columns = {r[1] for r in db.execute(f'PRAGMA table_info("{table}")')}
        unknown_columns = sorted(columns - KNOWN_COLUMNS.get(table, set()))
        if unknown_columns:
            block(f"{table} has unreviewed columns: {','.join(unknown_columns)}")
    for table, required in {
        "students": {"id", "first_name", "last_name", "email", "password", "class"},
        "teachers": {"id", "first_name", "last_name", "email", "password"},
        "classes": {"id", "label", "grade"},
        "flexible_tasks": {"variable_tokens"},
        "completed_flexible_tasks": {"awarded_tokens"},
    }.items():
        columns = {r[1] for r in db.execute(f'PRAGMA table_info("{table}")')}
        absent = sorted(required - columns)
        if absent:
            block(f"{table} schema is not reviewed; missing: {','.join(absent)}")
    # Migration 029 is part of the active release contract.  Do not silently
    # recreate or drop either column: NULL in awarded_tokens is meaningful.
    for table, column in (("flexible_tasks", "variable_tokens"),
                          ("completed_flexible_tasks", "awarded_tokens")):
        if not any(r[1] == column for r in db.execute(f'PRAGMA table_info("{table}")')):
            block(f"migration 029 is incomplete: {table}.{column} is missing")


def normalize_subject_type_schema(db: sqlite3.Connection) -> None:
    """Make the output match the current application schema.

    PROD snapshots may have the known historical shape (wpf without a
    DEFAULT and mode without a CHECK).  Values are still taken exclusively
    from PROD; only the DDL is normalized in the isolated output copy.
    """
    sql = db.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='curriculum_subject_types'"
    ).fetchone()[0] or ""
    columns = {r[1]: r for r in db.execute("PRAGMA table_info('curriculum_subject_types')")}
    if not {"subject", "wpf", "mode", "assignment_group"}.issubset(columns):
        block("curriculum_subject_types does not match either reviewed schema")
    rows = db.execute(
        "SELECT subject,wpf,mode,assignment_group FROM curriculum_subject_types"
    ).fetchall()
    if any(row[1] not in (0, 1) or row[2] not in ("REGULAR", "INDIVIDUAL") for row in rows):
        block("curriculum_subject_types contains an invalid PROD value")
    compact = re.sub(r"\s+", "", sql).upper()
    has_default = "WPFINTEGERNOTNULLDEFAULT0" in compact
    has_check = "CHECK(MODEIN('REGULAR','INDIVIDUAL'))" in compact
    if has_default and has_check:
        return
    db.execute("""CREATE TABLE curriculum_subject_types__canonical (
        subject INTEGER PRIMARY KEY REFERENCES subjects(id),
        wpf INTEGER NOT NULL DEFAULT 0 CHECK(wpf IN (0,1)),
        mode TEXT NOT NULL DEFAULT 'REGULAR' CHECK(mode IN ('REGULAR','INDIVIDUAL')),
        assignment_group TEXT
    )""")
    db.executemany(
        "INSERT INTO curriculum_subject_types__canonical(subject,wpf,mode,assignment_group) VALUES(?,?,?,?)",
        [tuple(row) for row in rows],
    )
    db.execute("DROP TABLE curriculum_subject_types")
    db.execute("ALTER TABLE curriculum_subject_types__canonical RENAME TO curriculum_subject_types")


def inventory(db: sqlite3.Connection) -> dict:
    """Return a non-sensitive, deterministic stock summary for dry-run/audit."""
    result = {"tables": sorted(table_names(db)), "counts": {}}
    for table in sorted(table_names(db)):
        result["counts"][table] = db.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]
    result["subjects"] = [
        {"id": row[0], "name": row[1], "active_grades": [r[0] for r in db.execute(
            "SELECT grade FROM subject_grade_activation WHERE subject=? ORDER BY grade", (row[0],)
        )] if "subject_grade_activation" in table_names(db) else []}
        for row in db.execute("SELECT id,name FROM subjects ORDER BY id")
    ]
    result["subject_types"] = [dict(row) for row in db.execute(
        "SELECT subject,wpf,mode,assignment_group FROM curriculum_subject_types ORDER BY subject"
    )]
    result["classes"] = [dict(row) for row in db.execute(
        "SELECT id,grade,label,active FROM classes ORDER BY id"
    )]
    result["curriculum"] = {
        "topics": result["counts"].get("topics", 0),
        "tasks": result["counts"].get("tasks", 0),
        "flexible_topics": result["counts"].get("flexible_topics", 0),
        "flexible_tasks": result["counts"].get("flexible_tasks", 0),
    }
    return result


def fachliche_referenz(db: sqlite3.Connection) -> dict:
    """Capture only PROD-governed, non-personal policy rows for comparison."""
    return {
        "subjects": [tuple(row) for row in db.execute(
            "SELECT id,name,subject_code FROM subjects ORDER BY id"
        )],
        "activations": [tuple(row) for row in db.execute(
            "SELECT subject,grade FROM subject_grade_activation ORDER BY subject,grade"
        )],
        "subject_types": [tuple(row) for row in db.execute(
            "SELECT subject,wpf,mode,assignment_group FROM curriculum_subject_types ORDER BY subject"
        )],
    }


def check_text_boundary(db: sqlite3.Connection) -> None:
    if db.execute("SELECT 1 FROM topics WHERE resource IS NOT NULL AND trim(resource) <> '' LIMIT 1").fetchone():
        block("topics.resource contains unreviewed free text or files")


def account_map(data: dict, table: str, ids: list[int]) -> dict[int, dict]:
    raw = data.get(table)
    if not isinstance(raw, dict):
        block(f"synthetic account map has no {table} map")
    result = {}
    for identifier in ids:
        entry = raw.get(str(identifier))
        if not isinstance(entry, dict):
            block(f"missing synthetic {table} account mapping")
        needed = ("username", "password_hash") if table == "admins" else ("first_name", "last_name", "email", "password")
        if any(not isinstance(entry.get(key), str) or not entry[key].strip() for key in needed):
            block(f"incomplete synthetic {table} account mapping")
        result[identifier] = entry
    return result


def rename_classes(db: sqlite3.Connection) -> None:
    rows = db.execute("SELECT id,grade,label FROM classes ORDER BY id").fetchall()
    changes = [(r["id"], r["grade"], r["label"], CLASS_RENAME[(r["grade"], r["label"])])
               for r in rows if (r["grade"], r["label"]) in CLASS_RENAME]
    if len({(grade, new) for _, grade, _, new in changes}) != len(changes):
        block("class rename target collision")
    if not changes:
        block("expected grade 5/6 class set was not found")
    for class_id, _, _, _ in changes:
        db.execute("UPDATE classes SET label=? WHERE id=?", (f"__ARCA_TMP_{class_id}__", class_id))
    for class_id, _, _, new in changes:
        db.execute("UPDATE classes SET label=? WHERE id=?", (new, class_id))
    if db.execute("SELECT 1 FROM classes GROUP BY grade,label HAVING COUNT(*) > 1 LIMIT 1").fetchone():
        block("class labels are not unique after transformation")
    for class_id, grade, _, new in changes:
        current = db.execute("SELECT grade,label FROM classes WHERE id=?", (class_id,)).fetchone()
        if tuple(current) != (grade, new):
            block("class ID/label transformation verification failed")


def clear_performance(db: sqlite3.Connection) -> None:
    for table in PERFORMANCE_TABLES:
        if table in table_names(db):
            db.execute(f'DELETE FROM "{table}"')


def create_synthetic_progress(db: sqlite3.Connection) -> None:
    students = db.execute("SELECT id FROM students WHERE active=1 ORDER BY id").fetchall()
    contexts = db.execute("SELECT student,subject,semester FROM student_curriculum_contexts ORDER BY student,subject").fetchall()
    task_by_subject = {}
    for row in db.execute("SELECT tasks.id, topics.subject FROM tasks JOIN topics ON topics.id=tasks.topic ORDER BY topics.subject,tasks.stage_number,tasks.id"):
        task_by_subject.setdefault(row[1], []).append(row[0])
    flexible = {r["subject"]: (r["id"], r["tokens"]) for r in db.execute("SELECT id,subject,tokens FROM flexible_tasks ORDER BY id")}
    for index, student in enumerate(students):
        sid = student[0]
        for ctx in [r for r in contexts if r["student"] == sid]:
            tasks = task_by_subject.get(ctx["subject"], [])
            if not tasks:
                continue
            if index % 3 != 0:
                db.execute("INSERT INTO taskstats(student,task,status) VALUES(?,?,2)", (sid, tasks[0]))
            else:
                db.execute("INSERT INTO student_active_curriculum_stages(student,subject,semester,central_task) VALUES(?,?,?,?)", (sid, ctx["subject"], ctx["semester"], tasks[min(1, len(tasks) - 1)]))
                request = ("HELP", "PARTNER", "EXPERIMENT", "EXAM")[index % 4]
                db.execute("INSERT INTO student_subject_requests(student,subject,semester,request_type) VALUES(?,?,?,?)", (sid, ctx["subject"], ctx["semester"], request))
                status = ("FAILED_ONCE", "FAILED_TWICE", "LOCKED")[index % 3]
                db.execute("INSERT INTO student_curriculum_stage_assessments(student,subject,semester,stage_type,stage_id,status) VALUES(?,?,?,?,?,?)", (sid, ctx["subject"], ctx["semester"], "CENTRAL", tasks[0], status))
        if flexible and index % 2 == 0:
            _, (task, maximum) = next(iter(flexible.items()))
            award = min(maximum, 1 + (index % 4))
            db.execute("INSERT INTO completed_flexible_tasks(student,flexible_task,awarded_tokens) VALUES(?,?,?)", (sid, task, award))
        db.execute("UPDATE students SET graduation_level=? WHERE id=?", (index % 3, sid))


def validate_output(db: sqlite3.Connection, source_ids: dict[str, set[int]], reference: dict) -> None:
    if db.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
        block("SQLite integrity_check failed")
    if db.execute("SELECT 1 FROM pragma_foreign_key_check LIMIT 1").fetchone():
        block("foreign_key_check failed")
    for table, ids in source_ids.items():
        found = {r[0] for r in db.execute(f'SELECT id FROM "{table}"')}
        if found != ids:
            block(f"identity IDs changed in {table}")
    if fachliche_referenz(db) != reference:
        block("PROD fachliche subject/activation/mode reference changed")
    if db.execute("SELECT 1 FROM students WHERE email NOT LIKE 'demo.%@example.invalid' LIMIT 1").fetchone():
        block("non-synthetic student login remains")
    if db.execute("SELECT 1 FROM teachers WHERE email NOT LIKE 'demo.%@example.invalid' LIMIT 1").fetchone():
        block("non-synthetic teacher login remains")
    if db.execute("SELECT 1 FROM classes GROUP BY grade,label HAVING COUNT(*) > 1 LIMIT 1").fetchone():
        block("duplicate class labels remain")
    if db.execute("SELECT 1 FROM completed_flexible_tasks WHERE awarded_tokens IS NOT NULL AND (awarded_tokens < 0 OR awarded_tokens > 105) LIMIT 1").fetchone():
        block("variable flexible award exceeds task maximum")


def transform(source: Path, output: Path, provenance: Path, accounts: Path) -> None:
    check_provenance(read_json(provenance))
    if not source.is_file() or source.is_symlink():
        block("staged source database is missing or symlinked")
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        block("output already exists; use a new immutable staging directory")
    with connect(source, True) as source_db:
        require_schema(source_db)
        check_text_boundary(source_db)
        source_ids = {table: {r[0] for r in source_db.execute(f'SELECT id FROM "{table}"')} for table in ("students", "teachers")}
        source_ids["classes"] = {r[0] for r in source_db.execute("SELECT id FROM classes")}
        reference = fachliche_referenz(source_db)
        shutil.copyfile(source, output)
    with connect(output, False) as db:
        require_schema(db)
        normalize_subject_type_schema(db)
        account_data = read_json(accounts)
        student_map = account_map(account_data, "students", sorted(source_ids["students"]))
        teacher_map = account_map(account_data, "teachers", sorted(source_ids["teachers"]))
        for sid, row in student_map.items():
            db.execute("UPDATE students SET first_name=?,last_name=?,email=?,password=? WHERE id=?", (row["first_name"], row["last_name"], row["email"], row["password"], sid))
        for tid, row in teacher_map.items():
            db.execute("UPDATE teachers SET first_name=?,last_name=?,email=?,password=? WHERE id=?", (row["first_name"], row["last_name"], row["email"], row["password"], tid))
        if "admins" in table_names(db):
            admin_ids = [r[0] for r in db.execute("SELECT rowid FROM admins")]
            admin_map = account_map(account_data, "admins", admin_ids)
            for rowid, row in admin_map.items():
                db.execute("UPDATE admins SET username=?,password_hash=? WHERE rowid=?", (row["username"], row["password_hash"], rowid))
        rename_classes(db)
        clear_performance(db)
        create_synthetic_progress(db)
        validate_output(db, source_ids, reference)
        db.commit()


def make_fixture(root: Path, *, legacy_subject_type_schema: bool = False) -> tuple[Path, Path, Path]:
    source, accounts, provenance = root / "source.db", root / "accounts.json", root / "provenance.json"
    db = sqlite3.connect(source)
    db.executescript("""
      PRAGMA foreign_keys=ON;
      CREATE TABLE classes(id INTEGER PRIMARY KEY,label TEXT NOT NULL,grade INTEGER NOT NULL,active INTEGER NOT NULL DEFAULT 1,UNIQUE(label,grade));
      CREATE TABLE students(id INTEGER PRIMARY KEY,first_name TEXT NOT NULL,last_name TEXT NOT NULL,email TEXT NOT NULL,password TEXT NOT NULL,class INTEGER NOT NULL,graduation_level INTEGER NOT NULL,active INTEGER NOT NULL DEFAULT 1,FOREIGN KEY(class) REFERENCES classes(id));
      CREATE TABLE teachers(id INTEGER PRIMARY KEY,first_name TEXT NOT NULL,last_name TEXT NOT NULL,email TEXT NOT NULL,password TEXT NOT NULL);
      CREATE TABLE admins(username TEXT PRIMARY KEY,password_hash TEXT NOT NULL);
      CREATE TABLE subjects(id INTEGER PRIMARY KEY,name TEXT NOT NULL,subject_code TEXT);
      CREATE TABLE school_years(id INTEGER PRIMARY KEY,label TEXT NOT NULL,week_count INTEGER NOT NULL,current_week INTEGER NOT NULL,start_date TEXT,end_date TEXT,current_semester INTEGER);
      CREATE TABLE semesters(id INTEGER PRIMARY KEY,label TEXT NOT NULL,position INTEGER NOT NULL,school_year INTEGER NOT NULL,archived INTEGER NOT NULL DEFAULT 0,FOREIGN KEY(school_year) REFERENCES school_years(id));
      CREATE TABLE topics(id INTEGER PRIMARY KEY,name TEXT NOT NULL,subject INTEGER NOT NULL,grade INTEGER NOT NULL,resource TEXT,number INTEGER NOT NULL,semester INTEGER,FOREIGN KEY(subject) REFERENCES subjects(id),FOREIGN KEY(semester) REFERENCES semesters(id));
      CREATE TABLE tasks(id INTEGER PRIMARY KEY,topic INTEGER NOT NULL,name TEXT NOT NULL,niveau INTEGER NOT NULL,stage_number INTEGER NOT NULL,tokens INTEGER NOT NULL,FOREIGN KEY(topic) REFERENCES topics(id));
      CREATE TABLE flexible_tasks(id INTEGER PRIMARY KEY,owner_teacher INTEGER NOT NULL,subject INTEGER NOT NULL,class INTEGER NOT NULL,semester INTEGER NOT NULL,grade INTEGER NOT NULL,name TEXT NOT NULL,tokens INTEGER NOT NULL,variable_tokens INTEGER NOT NULL DEFAULT 0,FOREIGN KEY(owner_teacher) REFERENCES teachers(id),FOREIGN KEY(subject) REFERENCES subjects(id),FOREIGN KEY(class) REFERENCES classes(id),FOREIGN KEY(semester) REFERENCES semesters(id));
      CREATE TABLE completed_flexible_tasks(student INTEGER NOT NULL,flexible_task INTEGER NOT NULL,awarded_tokens INTEGER,PRIMARY KEY(student,flexible_task),FOREIGN KEY(student) REFERENCES students(id),FOREIGN KEY(flexible_task) REFERENCES flexible_tasks(id));
      CREATE TABLE taskstats(student INTEGER NOT NULL,task INTEGER NOT NULL,status INTEGER NOT NULL,PRIMARY KEY(student,task),FOREIGN KEY(student) REFERENCES students(id),FOREIGN KEY(task) REFERENCES tasks(id));
      CREATE TABLE student_curriculum_contexts(student INTEGER NOT NULL,subject INTEGER NOT NULL,semester INTEGER NOT NULL,teacher INTEGER NOT NULL,class INTEGER NOT NULL,grade INTEGER NOT NULL,PRIMARY KEY(student,subject,semester),FOREIGN KEY(student) REFERENCES students(id));
      CREATE TABLE student_active_curriculum_stages(student INTEGER NOT NULL,subject INTEGER NOT NULL,semester INTEGER NOT NULL,central_task INTEGER,flexible_task INTEGER,PRIMARY KEY(student,subject),FOREIGN KEY(student) REFERENCES students(id),FOREIGN KEY(central_task) REFERENCES tasks(id));
      CREATE TABLE student_subject_requests(student INTEGER NOT NULL,subject INTEGER NOT NULL,semester INTEGER NOT NULL,request_type TEXT NOT NULL);
      CREATE TABLE student_curriculum_stage_assessments(student INTEGER NOT NULL,subject INTEGER NOT NULL,semester INTEGER NOT NULL,stage_type TEXT NOT NULL,stage_id INTEGER NOT NULL,status TEXT NOT NULL);
      CREATE TABLE subject_grade_activation(subject INTEGER NOT NULL,grade INTEGER NOT NULL,PRIMARY KEY(subject,grade));
      CREATE TABLE curriculum_subject_types(subject INTEGER PRIMARY KEY,wpf INTEGER NOT NULL%s,mode TEXT NOT NULL%s,assignment_group TEXT);
      CREATE TABLE course_group_unique_indexes_migration_marker(id INTEGER PRIMARY KEY);
    """ % ("" if legacy_subject_type_schema else " DEFAULT 0 CHECK(wpf IN (0,1))", "" if legacy_subject_type_schema else " DEFAULT 'REGULAR' CHECK(mode IN ('REGULAR','INDIVIDUAL'))"))
    db.executemany("INSERT INTO classes VALUES(?,?,?,1)", [(10,"5a",5),(11,"5b",5),(12,"5c",5),(13,"5d",5),(20,"6a",6),(21,"6b",6),(22,"6c",6),(23,"6d",6)])
    db.executemany("INSERT INTO teachers VALUES(?,?,?,?,?)", [(1,"Prod","Teacher","prod.t1@example","prod-hash"),(2,"Prod","Teacher2","prod.t2@example","prod-hash")])
    db.executemany("INSERT INTO students VALUES(?,?,?,?,?,?,?,1)", [(101,"Prod","Student","prod.s1@example","prod-hash",10,1),(102,"Prod","Student2","prod.s2@example","prod-hash",20,1)])
    db.execute("INSERT INTO admins VALUES('prod-admin','prod-hash')")
    db.executemany("INSERT INTO subjects VALUES(?,?,?)", [
        (1, "Mathematik", "MATH"), (2, "Altes Demo-Fach", "OLD"),
        (3, "WPF Technik", "WPF-TECH"), (4, "Religion/Ethik", "REL"),
    ])
    db.executemany("INSERT INTO subject_grade_activation VALUES(?,?)", [(1,5), (3,6)])
    db.executemany("INSERT INTO curriculum_subject_types VALUES(?,?,?,?)", [
        (1,0,"REGULAR",None), (2,0,"REGULAR",None),
        (3,1,"INDIVIDUAL","WPF"), (4,1,"INDIVIDUAL","RELIGION_ETHIK"),
    ])
    db.execute("INSERT INTO school_years VALUES(1,'2026/27',39,1,NULL,NULL,1)")
    db.execute("INSERT INTO semesters VALUES(1,'2026_27_HJ1',1,1,0)")
    db.execute("INSERT INTO topics VALUES(1,'Zahlen',1,5,NULL,1,1)")
    db.execute("INSERT INTO tasks VALUES(1,1,'5 M 1.1.1 Zahlen',1,1,4)")
    db.execute("INSERT INTO flexible_tasks VALUES(1,1,1,20,1,6,'Übung',5,1)")
    db.executemany("INSERT INTO student_curriculum_contexts VALUES(?,?,?,?,?,?)", [(101,1,1,1,10,5),(102,1,1,1,20,6)])
    db.execute("INSERT INTO taskstats VALUES(101,1,2)")
    db.commit(); db.close()
    accounts.write_text(json.dumps({"students":{"101":{"first_name":"Mara","last_name":"Muster","email":"demo.student.101@example.invalid","password":"SYNTHETIC_HASH_101"},"102":{"first_name":"Noah","last_name":"Nachweis","email":"demo.student.102@example.invalid","password":"SYNTHETIC_HASH_102"}},"teachers":{"1":{"first_name":"Leni","last_name":"Lehrerin","email":"demo.teacher.1@example.invalid","password":"SYNTHETIC_HASH_T1"},"2":{"first_name":"Toni","last_name":"Tutor","email":"demo.teacher.2@example.invalid","password":"SYNTHETIC_HASH_T2"}},"admins":{"1":{"username":"demo.admin","password_hash":"SYNTHETIC_HASH_A1"}}}, ensure_ascii=False), encoding="utf-8")
    provenance.write_text(json.dumps({"kind":"arcanum-sanitized-positive-list-v1","source_environment":"prod","raw_database_active":False,"schema_commit":"synthetic-test","reviewed_tables":sorted(KNOWN_TABLES),"reviewed_text_fields":sorted(REVIEWED_TEXT_FIELDS)}), encoding="utf-8")
    return source, accounts, provenance


def self_test() -> None:
    with tempfile.TemporaryDirectory(prefix="demo-sanitize-", dir="/srv/arcanum/dev/tmp") as directory:
        root = Path(directory); source, accounts, provenance = make_fixture(root)
        output = root / "out" / "database.db"; output.parent.mkdir()
        transform(source, output, provenance, accounts)
        with connect(output, True) as db:
            expected_classes = {10:"5c", 11:"5a", 12:"5d", 13:"5b", 20:"6b", 21:"6c", 22:"6d", 23:"6a"}
            assert dict(db.execute("SELECT id,label FROM classes")) == expected_classes
            assert {r[0] for r in db.execute("SELECT id FROM classes")} == set(expected_classes)
            assert db.execute("SELECT COUNT(*) FROM taskstats").fetchone()[0] >= 1
            assert db.execute("SELECT COUNT(*) FROM students WHERE email LIKE 'demo.%@example.invalid'").fetchone()[0] == 2
            assert db.execute("SELECT sql FROM sqlite_master WHERE name='curriculum_subject_types'").fetchone()[0].upper().find("DEFAULT 0") >= 0
            assert db.execute("SELECT grade FROM subject_grade_activation").fetchone()[0] == 5
            assert db.execute("SELECT COUNT(*) FROM completed_flexible_tasks").fetchone()[0] == 1
            assert dict(db.execute("SELECT subject,mode FROM curriculum_subject_types")) == {1:"REGULAR",2:"REGULAR",3:"INDIVIDUAL",4:"INDIVIDUAL"}
            assert db.execute("SELECT COUNT(*) FROM subject_grade_activation WHERE subject=3 AND grade=6").fetchone()[0] == 1
            assert db.execute("SELECT COUNT(*) FROM subject_grade_activation WHERE subject=4").fetchone()[0] == 0
            assert db.execute("SELECT 1 FROM students WHERE password LIKE '%prod%' OR email LIKE '%prod%' LIMIT 1").fetchone() is None
            assert db.execute("SELECT 1 FROM teachers WHERE password LIKE '%prod%' OR email LIKE '%prod%' LIMIT 1").fetchone() is None
            first_inventory = inventory(db)
        legacy_root = root / "legacy-schema"
        legacy_root.mkdir()
        legacy_source, legacy_accounts, legacy_provenance = make_fixture(legacy_root, legacy_subject_type_schema=True)
        legacy_output = legacy_root / "out.db"
        transform(legacy_source, legacy_output, legacy_provenance, legacy_accounts)
        with connect(legacy_output, True) as db:
            ddl = db.execute("SELECT sql FROM sqlite_master WHERE name='curriculum_subject_types'").fetchone()[0].upper()
            assert "DEFAULT 0" in ddl and "CHECK(WPF IN (0,1))" in ddl
        repeat_root = root / "repeat"
        repeat_root.mkdir()
        repeat_source, repeat_accounts, repeat_provenance = make_fixture(repeat_root)
        repeat_output = repeat_root / "out.db"
        repeat_output_2 = repeat_root / "out-2.db"
        transform(repeat_source, repeat_output, repeat_provenance, repeat_accounts)
        transform(repeat_source, repeat_output_2, repeat_provenance, repeat_accounts)
        with connect(repeat_output, True) as one, connect(repeat_output_2, True) as two:
            assert inventory(one) == inventory(two) == first_inventory
        blocked_root = root / "blocked"
        blocked_root.mkdir()
        bad_source, bad_accounts, bad_provenance = make_fixture(blocked_root)
        with sqlite3.connect(bad_source) as bad_db:
            bad_db.execute("CREATE TABLE unreviewed_person_data(value TEXT)")
            bad_db.commit()
        try:
            transform(bad_source, blocked_root / "out.db", bad_provenance, bad_accounts)
        except BlockedError:
            pass
        else:
            raise AssertionError("unknown table did not block")
        free_text_root = root / "free-text"
        free_text_root.mkdir()
        text_source, text_accounts, text_provenance = make_fixture(free_text_root)
        with sqlite3.connect(text_source) as text_db:
            text_db.execute("UPDATE topics SET resource='unreviewed person note'")
            text_db.commit()
        try:
            transform(text_source, free_text_root / "out.db", text_provenance, text_accounts)
        except BlockedError:
            pass
        else:
            raise AssertionError("unreviewed free text did not block")
        try:
            safe_path(Path("/srv/arcanum/demo/shared/database.db"))
        except BlockedError:
            pass
        else:
            raise AssertionError("live DEMO path did not block")
    print("SELF_TEST_PASS synthetic-only")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source")
    parser.add_argument("--output")
    parser.add_argument("--provenance")
    parser.add_argument("--accounts")
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--dry-run", action="store_true", help="validate source and print a non-sensitive inventory")
    args = parser.parse_args()
    try:
        if args.self_test:
            self_test(); return 0
        required = (args.source, args.provenance) if args.dry_run else (args.source, args.output, args.provenance, args.accounts)
        if not all(required):
            block("source and provenance are required for dry-run; output and accounts are additionally required for transform")
        source = safe_path(Path(args.source))
        provenance = safe_path(Path(args.provenance))
        accounts = safe_path(Path(args.accounts))
        if args.dry_run:
            check_provenance(read_json(provenance))
            with connect(source, True) as db:
                require_schema(db)
                check_text_boundary(db)
                print(json.dumps(inventory(db), ensure_ascii=False, sort_keys=True))
            return 0
        transform(source, safe_path(Path(args.output), output=True), provenance, accounts)
        print("SANITIZE_PASS synthetic output created; identity values withheld")
        return 0
    except BlockedError as exc:
        print("BLOCKED: " + str(exc), file=sys.stderr)
        return BLOCKED


if __name__ == "__main__":
    raise SystemExit(main())
