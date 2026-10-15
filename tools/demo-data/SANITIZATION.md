# PROD-basierte DEMO-Bereinigung

`sanitize_prod_to_demo.py` erzeugt später eine neue, abgeschottete SQLite-
Arbeitskopie. Es liest die PROD-Quelle nur lesend und schreibt niemals in
aktive PROD- oder DEMO-Pfade. Die Kopie entsteht mit der SQLite Online Backup
API (konsistente Momentaufnahme, auch bei WAL-Betrieb), nicht durch Kopieren
der Hauptdatei. Im aktuellen Auftrag wurde ausschließlich die synthetische
Selbsttest-Fixture verwendet.

## Fachliche Referenz

PROD ist die einzige fachliche Quelle. Die kontrollierte Positivliste umfasst
Schuljahre, Halbjahre, Fächer, Aktivierungen je Jahrgang, `wpf`, `mode`,
Zuordnungen, Kursgruppen, Freigaben, zentrale und flexible Themen/Etappen,
`stage_number`, Niveau und Münzwerte. Unbekannte Tabellen oder Spalten
blockieren. Eine externe Tabellen-Policy führt jede Tabelle explizit mit
`retain`, `clear`, `synthetic_identity` oder `synthetic_performance`. Damit
werden auch Attendance, Berechtigungen/Rollen, Räume, Spezialaufgaben und
historische Tabellen klassifiziert; ein nicht klassifizierter 59-Tabellen-
Stand wird blockiert. Sensible Tabellen müssen zusätzlich markiert sein und
dürfen nicht mit `retain` behandelt werden. Subject-Policy und Aktivierungszeilen werden vor und
nach der Transformation als fachliche Werte verglichen; alte DEMO-
Entscheidungen werden nicht verwendet.

Die bekannte Schemaabweichung bei `curriculum_subject_types` wird ausdrücklich
behandelt: beide geprüften Eingangsformen sind zulässig, die isolierte Ausgabe
wird auf `wpf NOT NULL DEFAULT 0 CHECK(wpf IN (0,1))` und
`mode NOT NULL DEFAULT 'REGULAR' CHECK(mode IN ('REGULAR','INDIVIDUAL'))`
normalisiert. Migration 029 wird nicht verändert; `variable_tokens`,
`awarded_tokens` und deren zulässige `NULL`-Semantik bleiben erhalten.

## Personen, Verläufe und Klassen

Personenfelder werden ausschließlich aus einer geschützten, synthetischen
Kontozuordnung außerhalb von Git befüllt. Die Kontodatei muss genehmigte
DEMO-Herkunft ausweisen; PROD-/Default-Marker, unsichere Namensräume und
E-Mail-Adressen außerhalb `demo.*@example.invalid` blockieren. PROD-Passwörter, Hashes, Sessions,
Tokens, Recovery-Daten und Schlüssel werden nie übernommen. Fehlende oder
mehrdeutige Kontozuordnungen blockieren; es gibt keine stillschweigende
Passwort- oder Rollenannahme.

Alle individuellen Leistungs-, Completion-, Anwesenheits-, GN-, Hilfe-,
Partnersuche-, Experiment- und Graduierungsdaten werden entfernt und mit
deterministischen synthetischen Beispielen neu erzeugt. Akademisches Niveau
(`tasks.niveau`) und persönliche Graduierung bleiben getrennte Konzepte.

Die Umbenennung erfolgt zweistufig mit temporären Labels und danach per
`classes.id`. Dadurch werden weder Klassen-IDs noch Beziehungen verändert:

```text
5a -> 5c, 5b -> 5a, 5c -> 5d, 5d -> 5b
6a -> 6b, 6b -> 6c, 6c -> 6d, 6d -> 6a
```

Nachher werden alle acht Zuordnungen, Eindeutigkeit, ID-Erhalt und
Fremdschlüssel geprüft.

## DEV-Prüfung

```sh
mkdir -p /srv/arcanum/dev/tmp
python3 tools/demo-data/sanitize_prod_to_demo.py --self-test
python3 tools/demo-data/sanitize_prod_to_demo.py --source <staged-source.db> \
  --provenance <positive-list.json> --table-policy <table-policy.json> --dry-run
python3 tools/demo-data/sanitize_prod_to_demo.py --source <staged-source.db> \
  --output /srv/arcanum/dev/validation/<new-stage>/database.db \
  --provenance <positive-list.json> --table-policy <table-policy.json> \
  --accounts <protected-accounts.json> --stage-root /srv/arcanum/dev/validation
```

Der Dry-Run benötigt keine Kontodatei und liefert nur eine nicht-sensitive
Bestandsübersicht. Fehlende Argumente enden mit `BLOCKED`, nicht mit einem
Python-Fehler. Jeder echte Lauf schreibt zunächst in ein neues, nicht
verlinktes Stage-Verzeichnis. Das Ziel darf nicht existieren, nicht symlinked
sein und muss unter dem explizit konfigurierten `--stage-root` liegen. Nachher
gelten `integrity_check = ok`,
leerer ungeklärter `foreign_key_check`, Schema-/Migrationsprüfung,
Secret-Prüfung, Fachvergleich und ein identischer zweiter Lauf als Pflicht-
Gates. Bei jedem Fehler wird nur die neu erzeugte, noch nicht aktive
Arbeitskopie einschließlich WAL/SHM entfernt.

## Spätere Server-Stufe: arcanum-server

Diese Schritte sind nur ein Ausführungsplan und wurden hier nicht gestartet:

1. Aktive PROD-Datenbank und Release read-only feststellen; PROD nicht
   schreiben und keine PROD-Datenbank nach DEV kopieren. Den PROD-Pfad nur mit
   `--allow-prod-read-only` und `--source-root /srv/arcanum/prod/shared`
   freigeben.
2. Außerhalb aktiver DEMO-Pfade eine geschützte, konsistente Arbeitskopie per
   SQLite Online Backup API mit restriktiven Dateirechten und Prüfsumme
   anlegen. PROD-Hauptdatei und WAL/SHM-Zustand bleiben unverändert.
3. Positivlisten-Provenienz, Schema 029, bekannte
   `curriculum_subject_types`-Variante und PROD-Bestandsübersicht unabhängig
   prüfen.
4. Vollständige 59-Tabellen-Policy laden und Sanitizer ausführen; Identitäten ersetzen, Klassen permutieren und
   personenbezogene Verläufe synthetisch erzeugen.
   Der geschützte Aufruf verwendet sinngemäß:

   ```sh
   python3 sanitize_prod_to_demo.py \
     --source /srv/arcanum/prod/shared/database.db \
     --source-root /srv/arcanum/prod/shared --allow-prod-read-only \
     --stage-root /srv/arcanum/sanitizer-stage \
     --output /srv/arcanum/sanitizer-stage/<new-run>/database.db \
     --table-policy /srv/arcanum/sanitizer-stage/<new-run>/table-policy.json \
     --provenance /srv/arcanum/sanitizer-stage/<new-run>/provenance.json \
     --accounts /srv/arcanum/sanitizer-stage/<new-run>/accounts.json
   ```
5. Zwei unabhängige Prüfungen durchführen: Fach-SOLL/IST gegen PROD,
   Schema/Secrets, Klassen-IDs und Beziehungen, Curriculum/Münzen/WPF,
   `integrity_check`, FK-Baseline und Login-/Rollenmodell.
6. Bisherigen DEMO-Zustand konsistent sichern, Backup-Hash dokumentieren und
   erst nach vollständigem PASS einen atomaren Datenbankwechsel vorbereiten.
   WAL/SHM-Dateien dürfen dabei nicht von einer alten Datenbank weiterwirken.
7. Rollback durch Rückkehr zur gesicherten bisherigen DEMO-Datenbank
   vorbereiten; bei jedem Fehler keinen Dienstwechsel durchführen.
8. Nach einer ausdrücklich freigegebenen Umschaltung: neuen DEMO-MainPID,
   „WebServer started and ready“, Port 8444, direkten Backendcheck,
   öffentlichen Logincheck, synthetische Admin-/Lehrer-/Tutor-/Schüler-
   Ansichten sowie Curriculum- und Münzprüfungen verifizieren.

Kein Teil dieses Dokuments erteilt eine Freigabe für PROD-Lesen, DB-Wechsel,
Deployment, Dienstneustart oder Ausgabe von Zugangsdaten. Das vorhandene
`realistic_demo_data.py` bleibt unverändert.
