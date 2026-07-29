# High Ground Studio / LearningToLead Architecture

This document describes the software architecture and component design for the `LearningToLead` co-authoring application and test harness.

## System Architecture

```mermaid
graph TD
    A["Draft Files (.md / .txt)"] -->|--import-inbox| B["CLI / GUI Runner (LearningToLeadApp)"]
    B <-->|SQLite Storage| C[("test_e2e.db")]
    
    subgraph "Core Domain Concepts"
        D["Paragraphs (Homer / Charlie)"]
        E["Tags (#test1, #test2)"]
        F["Timeline Events"]
        G["Co-Authoring Options (Gladwell / Discworld)"]
    end

    C --- D
    C --- E
    C --- F
    C --- G
```

## E2E Test Suite Matrix

```mermaid
pie title E2E Test Suite Tier Breakdown
    "Tier 1: Feature Coverage (25)" : 25
    "Tier 2: Boundary & Corner (25)" : 25
    "Tier 3: Cross-Feature (5)" : 5
    "Tier 4: Real-World Scenarios (5)" : 5
    "Edge Cases & Parsing (10)" : 10
```

## Co-Authoring Option Generation & Hot-Swap Flow

```mermaid
sequenceDiagram
    autonumber
    actor User as Author / CLI
    participant App as LearningToLead CLI
    participant DB as SQLite Database

    User->>App: --generate-options --paragraph-id <id>
    App->>DB: Query paragraph text & verify mutable
    DB-->>App: Paragraph (is_mutable=True)
    App->>App: Synthesize Gladwell & Discworld text variations
    App->>DB: Insert options (status='queued')
    App-->>User: Output Option IDs & generated voice texts

    User->>App: --hot-swap --paragraph-id <id> --option-id <opt_id>
    App->>DB: Update all paragraph options status='queued'
    App->>DB: Update selected option status='active'
    App-->>User: Confirm option activated
```
