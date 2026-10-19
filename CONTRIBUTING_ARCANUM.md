# Arcanum – Mitarbeit an der gemeinsamen Entwicklung

Arcanum ist die gemeinsame Lern- und Verwaltungsanwendung von Learn-Monitor.
Sie verbindet den Core (die zentrale Anwendung) mit spezialisierten Plugins für
Oberfläche, Ergebnisse, Berechtigungen und Anwesenheit.

## Die fünf Code-Repositories

| Repository | Aufgabe |
|---|---|
| `Learn-Monitor/student-database` | Core: Webanwendung, Datenmodell, Sessions, Curriculum und zentrale APIs |
| `Learn-Monitor/arcanum-overlay` | Arcanum-spezifische Oberfläche und UI-Erweiterungen |
| `Learn-Monitor/results-plugin` | Ergebnisse, Bewertungen, Münzen und Schatzkammer |
| `Learn-Monitor/permission-manager` | Rollen, Berechtigungen und Zugriffsschutz |
| `synchronierer/attendance-plugin` | Anwesenheit und zugehörige Lehrkraft-Funktionen |

Core und Attendance sind unterschiedliche Verantwortungsbereiche. Eine
Attendance-Oberflächenänderung kann deshalb im Core liegen, wenn sie dort in
der zentralen Anwendung umgesetzt wird. Entscheidend ist das tatsächlich
geänderte Repository, nicht nur das fachliche Thema.

## Branch- und PR-Regel

In allen fünf Repositories ist `arcanum-2026` der gemeinsame
Integrationsbranch (Zielzweig für geprüfte Beiträge).

Der normale Ablauf lautet:

```text
arcanum-2026 → persönlicher Arbeitsbranch → Pull Request → arcanum-2026
→ DEV-Test und Build → DEMO-Abnahme → GitHub-Sicherung → ausdrücklich
freigegebene PROD-Promotion
```

Eigene Branches werden immer vom aktuellen `arcanum-2026` abgeleitet, nicht
automatisch von `main`. Direkte Änderungen am gemeinsamen Integrationsbranch
sind nicht vorgesehen. Ein Pull Request (PR, ein prüfbarer
Änderungsvorschlag) beschreibt Zweck, betroffene Dateien, Tests und bekannte
Risiken.

`main` bleibt der jeweilige Default-Branch und wird nicht eigenmächtig mit
Arcanum zusammengeführt. Ältere Feature-, Fix-, Security- und Releasebranches
bleiben aus Bestandsschutz erhalten.

## Qualität und Sicherheit

- Tests und relevante Dokumentation gehören zum PR.
- Entwicklung, Builds und automatisierte Prüfungen erfolgen ausschließlich auf
  DEV.
- DEMO dient der Integration und fachlichen/browserseitigen Abnahme.
- PROD wird nur nach ausdrücklicher Freigabe geändert.
- Keine echten Schüler- oder Lehrkräftedaten, Passwörter, Tokens, Schlüssel
  oder sonstigen Secrets in Code, Tests, Logs oder PRs.
- Dokumentationsänderungen dürfen keine Produktlogik verändern.
- Ein akzeptierter Stand wird als unveränderlicher Golden-State-Pin
  (eindeutiger freigegebener Commit) dokumentiert; ein Branch-HEAD kann danach
  weitere geprüfte Beiträge enthalten.

Vor einem PR bitte mindestens Branch, Ausgangscommit, Arbeitsbaum,
`git diff --check` und die für das Repository dokumentierten Tests prüfen.

## Historische Stände

Bestehende Branches und Forks sind Arbeits- oder historische Referenzen. Sie
werden nicht gelöscht und nicht überschrieben. Ungeprüfte Fremdänderungen
werden weder blind übernommen noch durch Force-Push beseitigt.
