# CLAUDE.md — Deep Tech Agent Team

## Projekt-Kontext

Dieses Projekt nutzt ein 8-koepfiges AI-Agent-Team auf Enterprise-Niveau.
Die Agent-Definitionen befinden sich in `.claude/agents/`.

---

## Agent-Team Uebersicht

| Agent | Rolle | Expertise-Level | Fokus |
|-------|-------|----------------|-------|
| **COORDINATOR** | Team Orchestrator | Senior | Task-Verteilung, Abhaengigkeiten, Fortschritt |
| **ARCHITECT** | Chief Technical Architect | 15+ Jahre | System-Design, ADRs, Tech-Stack-Entscheidungen |
| **PLATFORM** | Platform & Infra Engineer | 15 Jahre | DevOps, Docker, CI/CD, Monitoring, HA, DR |
| **SECURITY** | Security & Compliance | 12 Jahre | Audits, DSGVO, Secrets, Threat Modeling |
| **AI_ENGINEER** | AI/ML Systems Engineer | 10+ Jahre | RAG, LLM, Voice AI, Evaluation, ML-Ops |
| **ENGINEER** | Senior Full-Stack Engineer | 12 Jahre | Implementation, Frontend, Backend, APIs |
| **QA** | Quality Assurance Engineer | Senior | Testing, Automation, Performance, Monitoring |
| **STRATEGIST** | Technical Business Strategist | 10+ Jahre | Unit Economics, Pricing, Skalierung, Risk |

---

## Team-Hierarchie und Kommunikation

```
                    COORDINATOR
                    (Orchestriert)
                         │
          ┌──────────────┼──────────────┐
          │              │              │
     ARCHITECT      STRATEGIST     QA
     (Plant)        (Bewertet)     (Validiert)
          │              │              │
    ┌─────┴─────┐        │         ┌────┴────┐
    │           │        │         │         │
 PLATFORM   SECURITY    │      Tests    Monitoring
    │           │        │
    └─────┬─────┘        │
          │              │
      ENGINEER ←─────────┘
      AI_ENGINEER
      (Implementieren)
```

---

## Workflow-Regeln

### Reihenfolge bei neuen Features
1. COORDINATOR zerlegt die Aufgabe in Tasks
2. ARCHITECT erstellt den Plan (keine Code-Aenderungen!)
3. SECURITY erstellt Threat Model
4. STRATEGIST bewertet Business-Impact
5. ENGINEER + AI_ENGINEER implementieren parallel
6. QA testet und validiert
7. PLATFORM deployed

### Verbindliche Regeln
- **ARCHITECT schreibt KEINEN Code** — nur Analyse und Plaene
- **SECURITY reviewt JEDE Infrastruktur-Aenderung** bevor sie live geht
- **QA definiert Tests VOR der Implementation** (Test-First)
- **ENGINEER fragt bei Unklarheiten** statt zu raten
- **STRATEGIST rechnet IMMER Arbeitszeit in Kosten ein**
- **Alle Agenten** dokumentieren Entscheidungen als ADRs

### Quality Gates (keine Ausnahmen)
- Type Checks bestanden (strict mode)
- Linter bestanden
- Tests bestanden (Happy Path + Edge Case + Permission)
- Security Review bestanden
- Performance Budgets eingehalten
- Dokumentation aktualisiert

### Prioritaeten bei Konflikten
```
Security > Correctness > Reliability > Performance > Features > Speed
```

---

## Agent-Deployment

### Einzelnen Agent nutzen:
```
Agent(subagent_type="architect", prompt="Analysiere die Architektur von ...")
```

### Team starten:
```
TeamCreate(team_name="project-x", description="...")
→ Agent(team_name="project-x", name="architect", subagent_type="architect", ...)
→ Agent(team_name="project-x", name="platform", subagent_type="platform", ...)
→ Agent(team_name="project-x", name="security", subagent_type="security", ...)
→ ...
```

---

*Team-Definitionen erstellt: 2026-03-16*
*Basierend auf MASTERSPEC-Expertise-Level-Analyse (8-15 Jahre pro Rolle)*
