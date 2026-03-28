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

<!-- gitnexus:start -->
# GitNexus MCP

This project is indexed by GitNexus as **Balage  AINW** (2575 symbols, 5944 relationships, 193 execution flows).

GitNexus provides a knowledge graph over this codebase — call chains, blast radius, execution flows, and semantic search.

## Always Start Here

For any task involving code understanding, debugging, impact analysis, or refactoring, you must:

1. **Read `gitnexus://repo/{name}/context`** — codebase overview + check index freshness
2. **Match your task to a skill below** and **read that skill file**
3. **Follow the skill's workflow and checklist**

> If step 1 warns the index is stale, run `npx gitnexus analyze` in the terminal first.

## Skills

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/refactoring/SKILL.md` |

## Tools Reference

| Tool | What it gives you |
|------|-------------------|
| `query` | Process-grouped code intelligence — execution flows related to a concept |
| `context` | 360-degree symbol view — categorized refs, processes it participates in |
| `impact` | Symbol blast radius — what breaks at depth 1/2/3 with confidence |
| `detect_changes` | Git-diff impact — what do your current changes affect |
| `rename` | Multi-file coordinated rename with confidence-tagged edits |
| `cypher` | Raw graph queries (read `gitnexus://repo/{name}/schema` first) |
| `list_repos` | Discover indexed repos |

## Resources Reference

Lightweight reads (~100-500 tokens) for navigation:

| Resource | Content |
|----------|---------|
| `gitnexus://repo/{name}/context` | Stats, staleness check |
| `gitnexus://repo/{name}/clusters` | All functional areas with cohesion scores |
| `gitnexus://repo/{name}/cluster/{clusterName}` | Area members |
| `gitnexus://repo/{name}/processes` | All execution flows |
| `gitnexus://repo/{name}/process/{processName}` | Step-by-step trace |
| `gitnexus://repo/{name}/schema` | Graph schema for Cypher |

## Graph Schema

**Nodes:** File, Function, Class, Interface, Method, Community, Process
**Edges (via CodeRelation.type):** CALLS, IMPORTS, EXTENDS, IMPLEMENTS, DEFINES, MEMBER_OF, STEP_IN_PROCESS

```cypher
MATCH (caller)-[:CodeRelation {type: 'CALLS'}]->(f:Function {name: "myFunc"})
RETURN caller.name, caller.filePath
```

<!-- gitnexus:end -->
