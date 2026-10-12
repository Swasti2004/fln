# Contributor Onboarding: FLN Assessment & Remediation Platform

**Contributor:** Swasti  
**Target Repository:** vicharanashala/fln  
**Focus Area:** Assessment Engine, Diagnostic Pipelines, Misconception Modeling & Curriculum Evolution  

---

## 1. What is FLN?

**FLN** stands for **Foundational Literacy and Numeracy**. In primary education (specifically Classes 1–4, covering children aged roughly 5 to 9), foundational numeracy is the cornerstone of all future intellectual and academic growth. A child who cannot reliably compare numbers, understand place value, or grasp basic operations (addition, subtraction, multiplication, and division) will inevitably struggle as the curriculum shifts from "learning to count" to "counting to learn."

In large-scale public school systems, the prevailing problem is the **compounding learning gap**. Traditional classroom models administer standard exams, assign a collective score, and advance every child along with the academic year regardless of their true competence. When a child falls behind at single-digit addition, subsequent lessons on carrying and two-digit arithmetic become incomprehensible. Over time, students develop deep-seated math anxiety and fall into passive disengagement.

The FLN platform exists to fundamentally break this cycle. Rather than acting as a traditional grading portal or an administrative scoreboard, FLN provides **precision diagnostic evaluation and personalized remediation**:
1. It diagnoses exactly where each child sits on a continuous developmental numeracy framework.
2. It generates printable, customized paper worksheets tailored to that child's exact instructional frontier.
3. It ingests physical student work via optical scanning (ICR/AI), diagnoses underlying misconceptions, and guides educators on the specific remedial steps required to bring each learner to foundational mastery.

---

## 2. What do you understand by FLN (as a system)?

FLN is an interconnected, hybrid digital-and-physical educational assessment platform designed for low-resource environments (where students take tests on physical paper, but insights are computed in the cloud). 

### Key Stakeholders & Users
- **Students (Classes 1–4):** The learners whose progress is tracked across foundational levels (1 to 59). They interact with physical printed worksheets with distinct QR codes and individualized questions.
- **Teachers & Volunteers:** The primary ground operators. They generate class worksheets, administer exams, scan or photograph completed papers, review AI evaluation results, and submit manual overrides when handwriting or OCR edge cases arise.
- **School Principals:** School-level monitors who oversee teacher submission compliance, pass/fail trends, and intervention tracking for their institution.
- **Administrative Hierarchy (Block, District, State, Superadmin):** Multi-tier oversight roles that aggregate learning telemetry, track defaulters (teachers who missed exam submission windows), review school performance, and configure global curriculum rules.

### Core Entities & Data Architecture
- **Curriculum & Skill Graph:** A structured progression of numeracy competencies (spanning 93 nodes / levels 1–59) mapped into topics (Number Sense, Operations, Measurement, etc.), prerequisites, and target milestones.
- **Worksheets & Exams:** Periodic test instruments (Baseline, Midline, Endline, and remedial cycles) generated with specific time windows (`timing.examDate`, `printWindow`, `submissionWindow`) and lock states (`locks.locked`).
- **Answer Submissions & Attempt Evidence:** Records of child work. These range from high-level question answers (`AnswerSubmission`) to fine-grained micro-attempts (`AttemptRecord`) capturing hints, representations, and scaffolding levels.
- **Evaluation Reports & Diagnostic Profiles:** The diagnostic engine's output containing scores, question-by-question correctness, detected `rootCauses`, skill gaps, and recommended advancement levels.
- **Misconception Archetypes & Fingerprints:** Machine-learning-driven clustering that groups students by *how* they fail (e.g., place-value confusion vs. digit reversal) rather than merely *how much* they score, enabling group-level targeted remediation.

### High-Level System Flow
```
[Curriculum Graph] ──► [Worksheet Generator] ──► [Printable PDF with QR]
                                                            │
                                                     (Physical Exam)
                                                            ▼
[Diagnostic Feedback] ◄── [Teacher Override] ◄── [OCR / Evaluation Pipeline]
        │
        ├──► [Misconception Fingerprint & Archetype Update]
        └──► [Placement Level Recomputation & Remedial Worksheets]
```

---

## 3. Current State of the Repository — What Has Been Done So Far

The repository is structured as an **npm-workspaces monorepo** consisting of three primary modules:
- `frontend/`: A React 19 single-page application built with Vite and Tailwind CSS.
- `backend/`: A TypeScript Express REST API running on Node.js.
- `ai-services/`: A Python-based optical scanning and evaluation pipeline leveraging Google Gemini and OCR tooling.

### Key Implemented Capabilities
1. **Real Express Backend Architecture (ADR 001):**
   - The backend is the single source of truth (`backend/src/`). The legacy in-browser mock fetch interceptor has been cleanly eliminated.
   - Dual-persistence architecture in `backend/src/db.ts`: MongoDB serves as the primary operational store (when `MONGODB_URI` is provided), with an automated JSON file fallback (`data/db.json`) for zero-dependency local development and testing.
2. **Hardened Role-Based Access Control (RBAC):**
   - Implemented via signed JWTs and `bcrypt` password hashing in `backend/src/auth.ts`.
   - Access to student profiles and operations is strictly scoped by geographic and institutional hierarchy (`canAccessStudent`).
3. **Automated Worksheet & PDF Generation:**
   - Puppeteer-driven rendering converting HTML templates (`frontend/public/worksheets`) into print-ready assessment sheets with unique barcodes and student identifiers.
4. **Diagnostic & Remedial Evaluation Engine:**
   - Multi-stage answer evaluation matching handwritten strings against expected answers using OCR-resilient normalization (`backend/src/answerMatching.ts`).
   - Heuristic and AI-driven error classification (`backend/src/errorClassification.ts`) categorizing slips into `unanswered`, `digit_reversal`, `decimal_place_shift`, and `off_by_one`.
   - Learner archetype clustering (`assignStudentToArchetype`) grouping students into actionable intervention cohorts.

---

## 4. Gaps Observed in the Code

During in-depth analysis of the repository while implementing and testing features, several critical architectural and functional gaps were identified:

### Gap 1: Inability to Capture Real-Time Scaffolding & Pedagogical Attempt Nuance
- **Where:** `backend/src/db.ts` (`AnswerSubmission` interface)
- **What:** Student work was recorded purely as static answer submissions (`submittedAnswer: string`, `isCorrect: boolean`). There was no data model to record how the answer was reached: whether the student worked unprompted, needed verbal hints, used visual manipulatives, or required direct teacher guidance.
- **Why it matters:** In foundational learning, two students who both arrive at the answer "12" have completely different mastery levels if Student A solved it mentally in 5 seconds while Student B required 4 physical counting blocks and 2 teacher prompts. Treating them as identical binary "passes" distorts diagnostic accuracy.

### Gap 2: Teacher Overrides Desynchronized from Misconception Fingerprints & Root Causes
- **Where:** `backend/src/routes/evaluation.ts` (lines ~1340–1390) and `backend/src/routes/students.ts`
- **What:** When a teacher used `PATCH /api/evaluation/:reportId/override` to correct an OCR misread or grading error, the handler updated the numerical score (`score: newScore`) but never recomputed `rootCauses`. Furthermore, it never invalidated the student's cached misconception fingerprint or recomputed their archetype cluster.
- **Why it matters:** If a child was erroneously marked wrong for writing "7", the system permanently flagged them with a misconception and assigned them to a remedial archetype, even after the teacher corrected the score to 100%.

### Gap 3: Human Educator Diagnoses Lost in Overrides & Choice Error Tags Disconnected
- **Where:** `backend/src/routes/evaluation.ts` and `backend/src/rootCauseAnalysis.ts`
- **What:** The root cause calculation relied solely on automated classification (`classifyErrorType`), which defaults to `"unclassified"` for any non-trivial error. When teachers performed manual reviews and identified the exact pedagogical reason for an error (e.g., conceptual misunderstanding), there was no schema or parameter to capture and persist the teacher's diagnosis. Additionally, `readPipelineDetail` called `classifyErrorType` without passing the question object (`q`), dropping rich MCQ `choiceErrorTags` (e.g. `'under-inclusion'`).
- **Why it matters:** The system discarded the highest-fidelity diagnostic signal available: the live classroom teacher's expert judgment and question-author misconception tags.

### Gap 4: Static Curriculum Graph Unable to Evolve with Classroom Realities
- **Where:** `backend/src/config/curriculumMap.ts` and `backend/src/db.ts`
- **What:** The curriculum was locked into a static 93-node competency graph. There was no structured mechanism, database schema, or REST API for discovering emerging micro-skills from learner error patterns, persisting them with attempt evidence, or facilitating human-in-the-loop validation by curriculum experts.
- **Why it matters:** Real foundational teaching regularly uncovers unmapped micro-competencies (e.g., regrouping across tens boundaries, place-value digit reversal). Without a dynamic evolution loop, the curriculum remains rigid and cannot adapt to empirical field data.

---

## 5. Ideas for the Project

### Idea 1: Multi-Modal Scaffolding & Hint Analytics Dashboard
- **What:** Build a dedicated teacher and administrator visualization showing student progression through scaffolding independence.
- **Why:** Solves the visibility gap around student autonomy. Tracks how often students need level-3/level-4 assistance over time, highlighting true conceptual independence rather than just test scores.
- **How:** Create an aggregation endpoint `GET /api/students/:id/scaffolding-trends` querying the newly introduced `AttemptRecord` collection, and render a simple sparkline/badge indicator on the student profile panel.

### Idea 2: Expert Curriculum Evolution & Candidate Skill Review Panel
- **What:** Develop an administrative management view for curriculum experts to review and graduate proposed candidate skills.
- **Why:** Operationalizes the backend D1.6 Skill Evolution API (`POST /api/skills/candidates/:id/validate`) so curriculum leads can review evidence and promote emergent skills into the live curriculum without direct database manipulation.
- **How:** A panel component under the Admin / Curriculum navigation that fetches `GET /api/skills/candidates?status=PENDING`, displays supporting evidence and classroom observations, and provides "ACCEPT", "REJECT", "MERGE", "SPLIT", and "REDEFINE" actions.

### Idea 3: Unified Cross-Service Answer Normalization Specification
- **What:** Create a centralized, language-agnostic test suite and normalization spec shared between the TypeScript backend (`answerMatching.ts`) and Python OCR service (`1_compare_answers.py`).
- **Why:** Prevents discrepancy where an answer is marked correct by the backend's OCR-tolerant comparator but rejected by the Python script's strict comparison.
- **How:** Define a shared JSON specification file (`shared/answer-normalization-fixtures.json`) with edge cases (leading zeros, punctuation, spacing) and execute it in both Node.js (`npm run test:answer-matching`) and Python pytest suites.

---

## 6. Your Contribution

As part of my onboarding, I have actively worked on and contributed to **multiple core areas** across diagnostic evaluation, scaffolding schemas, curriculum evolution, and onboarding documentation:

### 1. PR #654 (Issue #479): Granular AttemptRecord Evidence Schema [MERGED]
- **Data Model:** Authored and integrated the `AttemptRecord` interface in `backend/src/db.ts`, implementing the 0–4 scaffolding scale (`0 = unprompted`, `1 = verbal hint`, `2 = visual manipulative`, `3 = guided steps`, `4 = full direct instruction`), representation styles, and error classifications.
- **Database Methods:** Added `addAttemptRecord()` and indexed read method `getAttemptRecordsForStudent()`, complete with MongoDB index registration (`studentId: 1`) and file-store fallback support.
- **Test Suite:** Built comprehensive regression tests in `backend/tests/attempt-records.test.ts` (`npm run test:attempts`) proving isolation across students, correct scaffolding persistence, and error type preservation.
- **Status:** **Merged into upstream main.**

### 2. PR #673 (Issue #402): Real-Time Root Cause & Archetype Synchronization on Teacher Override [MERGED]
- **Refactoring & Modularity:** Extracted the root cause calculation engine out of `backend/src/routes/students.ts` into a dedicated, clean service module: `backend/src/rootCauseAnalysis.ts`.
- **Pipeline & Tags Integration:** Preserved `choiceErrorTags` lookup across overrides (`classifyErrorType(submitted, expected, q)`), ensuring questions tagged with pedagogical error markers (e.g. `under-inclusion`) reflect accurate diagnostic codes.
- **Override Logic:** Updated `PATCH /api/evaluation/:reportId/override` to recompute `rootCauses` only for questions that remain wrong after teacher correction, resetting `rootCauses` to an empty array `[]` when all answers are corrected.
- **Archetype Invalidation:** Wired `invalidateFingerprintCache()` and `assignStudentToArchetype()` so that a teacher's grade correction immediately updates the student's misconception cluster and fingerprint.
- **Testing:** Implemented `backend/tests/evaluation-override.test.ts` (`npm run test:evaluation-override`) covering HTTP endpoint behaviors, partial corrections, full corrections, and `choiceErrorTags`.
- **Status:** **Merged into upstream main.**

### 3. PR #701 (Issue #481): D1.6 Skill Evolution & Expert Validation Framework [UNDER REVIEW]
- **Ontology & Schemas:** Defined `CandidateSkill` and `Skill` interfaces in `backend/src/db.ts` with lifecycle statuses (`PENDING`, `ACCEPTED`, `REJECTED`, `MERGED`, `SPLIT`, `REDEFINED`) and `source_type: 'DISCOVERED_DATA'`.
- **REST Endpoints:** Created `backend/src/routes/skillEvolution.ts` providing 5 endpoints:
  - `GET /api/skills/candidates`: Filter candidates by status and parent skill.
  - `GET /api/skills/candidates/:id`: Retrieve single candidate record with evidence.
  - `POST /api/skills/candidates`: Submit discovered candidate with duplicate ID guard (HTTP 409).
  - `POST /api/skills/candidates/:id/validate`: Superadmin human-in-the-loop validation with `ACTION_TO_STATUS` mapping.
  - `GET /api/skills`: Retrieve active skills including discovered data.
- **Dual-Storage Persistence:** Updated `addCandidateSkill`, `updateCandidateSkill`, and `addSkill` in `backend/src/db.ts` to ensure `await this.save()` executes on file-store mutations when running without MongoDB.
- **Testing:** Implemented unit tests (`npm run test:skill-evolution`) and end-to-end HTTP route tests (`npm run test:skill-evolution-routes`).
- **Status:** Review feedback from maintainer fully addressed and pushed.

### 4. PR #726: Contributor Onboarding Documentation [MERGED]
- **Documentation:** Authored the comprehensive onboarding guide at `Ideas/ONBOARDING-swasti.md` following repository requirements, detailing system context, data models, observed codebase gaps, strategic project proposals, and contribution milestones.
- **Status:** **Merged into upstream main.**

### 5. Issue #459: Teacher-in-the-Loop ErrorType Override [NEW PR]
- **Targeted Endpoint:** Updated `PATCH /api/evaluation/:reportId/override` to accept an optional `errorType` per question in `corrections[]`.
- **Whitelist Validation:** Implemented strict HTTP 400 validation checking against approved values (deterministic classifier types: `unanswered`, `digit_reversal`, `decimal_place_shift`, `off_by_one`, `unclassified`; plus pedagogical diagnostic labels: `conceptual`, `careless`, `prerequisite`).
- **Precedence Logic:** Overlaid teacher-supplied diagnostic labels onto still-wrong questions in `rootCauses`, allowing human pedagogical insights to supersede automated classifier fallbacks.
- **Testing:** Added Case 5 (400 validation) and Case 6 (teacher errorType override) in `backend/tests/evaluation-override.test.ts`.
- **Status:** Implemented in branch `fix/teacher-error-type-override-459`, tested, and pushed for PR creation.
