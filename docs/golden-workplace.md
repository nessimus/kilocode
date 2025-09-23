# Golden Workplace Autonomy Notes

_Last updated: September 17, 2025_

## Purpose

Capture the current shared understanding of how Golden Workplace should orchestrate agents, SOPs, and customizable action items so future contributors have the same product context.

## Terminology Alignment

- **SOP (Standard Operating Procedure)**: User-authored instructions. We support two authoring modes:
    - **Document SOP**: Rich text (and embedded media) in a linear, human-readable format.
    - **Workflow SOP**: Node/graph-based editor for visual flows. Both variants compile into the same executable payload behind the scenes.
- **Runbook (internal term)**: The compiled, executable representation of an SOP that agents follow. Not user-facing; generated automatically from SOPs.
- **Job**: A single executable unit created from a runbook + inputs. Jobs track status, assignees, dependencies, and results.
- **Action Items Table**: The user-visible board/list that stores every job. It behaves like a customizable database similar to Notion.
- **Executive Manager**: The default supervisory agent instantiated per company. Owns goals, spawns jobs, delegates work, and communicates with the user.
- **Supervisor Service / Operations Engine**: Back-end orchestration layer that enforces job dependencies, dispatches to agents/tools, records logs, and supports hand-off to other orchestrators (e.g., a Project Manager agent).
- **Skills**: Post-job evaluation and grading artifacts. Users (or automated evaluators) score outcomes, and agents accrue skill points that inform staffing/marketplace decisions.

## SOP Authoring & Execution Pipeline

1. User writes an SOP (document or workflow).
2. System validates the SOP schema and compiles it into a runbook script (JSON/TypeScript representation).
3. Executive Manager (or delegated orchestrator) enqueues jobs using the runbook, providing context (company, team, deliverable, due dates, etc.).
4. Jobs execute via agents/tools; results and logs are stored, and optional follow-up jobs are created based on outputs.
5. Skill grading runbooks trigger after successful delivery, updating agent profiles.

## Action Items Table Requirements

- **Customizable Columns**: Users can add arbitrary fields (text, number, select, status, URL, relation, etc.) per table. Core fields (ID, status, dependencies) remain but everything else is extensible.
- **Dependency Graph**: Each job supports prerequisites and co-requisites. The supervisor service schedules jobs when prerequisite conditions resolve and allows unrelated jobs to run in parallel.
- **Multiple Views**: Board, list, calendar, or timeline views should be supported later, driven by the same underlying schema.
- **Ownership & Delegation**: Jobs record the owning agent (Executive Manager by default) and can be reassigned to specialized agents (e.g., Project Manager, Department Lead).
- **Deliverable Tracking**: Custom columns enable linking artifacts (URLs, file references) and marking reviewer/approval status per job.

## Delegation & Supervisory Flow

- Executive Manager remains the primary user-facing contact.
- Supervisor service exposes an API so other agents can manage subsets of jobs (e.g., a Project Manager agent can enqueue, pause, or reprioritize jobs within a project).
- When delegation happens, the Executive Manager still receives status updates but can step back from direct queue management.

## Skills & Evaluation

- After a job is marked complete and the user confirms satisfaction, trigger a grading SOP that records scores, qualitative feedback, and updated skill levels.
- Skill records live alongside employee profiles and inform automatic staffing recommendations and external “secondhand employee” listings.

## Logging & Audit

- Persist job lifecycle events and tool calls as JSONL under `~/.goldenworkplace/logs/` (fields: timestamp, jobId, company/team context, agent, tool, hashed args, outcome).
- Tie logs back to customizable columns (e.g., link log file path). Respect dry-run mode by simulating tool outputs without side effects.

## Next Steps

1. **Schema Draft**: Define TypeScript interfaces for companies, teams, employees, SOPs, jobs, skills, and table columns (including custom field descriptors).
2. **Storage Plan**: Outline JSON adapter structure, schema versioning, and migration stubs for future Postgres deployment.
3. **Supervisor Service Design**: Detail how dependency resolution, parallel execution, and delegation APIs will work.
4. **SOP Editor Specs**: Document required UI/UX for both text and node-based editors and how they map to runbook execution.
5. **Skills Pipeline**: Specify grading flows, scoring rubrics, and how skill levels influence marketplace exposure.
6. **Open Questions**: Confirm naming for the supervisor service (“Operations Engine”?), decide default column templates, and determine how user-defined column types map to execution-time validation.

## UI & Panels Roadmap

- **Company Creator Tab**: Dedicated webview for spinning up companies, capturing mission/vision, and seeding the initial Executive Manager. Includes quick links into workforce editing once the company exists.
- **Workforce Hub**: Tree/grid view of company → department → team → employee. Supports inline edits, bulk actions, skill summaries, and customizable columns. Acts as the control center for delegating ownership.
- **SOP Studio**: Split-mode editor (rich text + node workflow). Users can toggle between formats while sharing underlying data. Studio handles versioning, validation, and publishes compiled runbooks.
- **Action Items Board**: Kanban/list hybrid leveraging the customizable column schema. Shows job dependencies, assignees, deliverable links, and live status chips (Queued / Running / Done / Failed / Blocked).
- **Skills & Evaluations Panel**: Historical view of completed jobs, grading outcomes, and skill trajectories per employee. Supports filtering by department or deliverable.
- **Navigation**: “Golden Workplace” sidebar groups these experiences; each panel opens in its own tab so users can multitask across SOP editing, workforce management, and execution monitoring.
- **Shared Components**: Standardize detail drawers, rich text editor, node canvas, and dependency visualizations so UX stays consistent across panels.

## Phase 1 Focus: Workforce + Persona-Aware Chat

1. **Company & Workforce Management**
    - Expand WorkplaceService to support editing employee fields (name, role, description, personality traits, avatar).
    - Provide dedicated Company Creator + Workforce Hub panels for creating/renaming companies, departments, teams, and employees.
    - Ensure custom column system can capture extra metadata required for personas (tool permissions, availability windows, etc.).
2. **Persona Selection in Chat**
    - Introduce agent picker in ChatView, populated from the active company’s workforce (Executive Manager default + other employees).
    - Allow switching mid-conversation and reflect persona attributes in the system prompt.
    - Persist preferred agent per task/session and expose quick “speak to” actions in the Workforce Hub.
3. **Attribute Editing**
    - UI affordances to edit name, job title, description, personality, avatar, skills, and tool access directly from Workforce Hub.
    - Validation + live preview so changes update the chat persona immediately.
4. **Link Back to SOPs & Jobs**
    - From Workforce Hub, allow enqueuing SOP-driven jobs for a selected agent; from chat, surface the agent’s active jobs and skills.

These steps give us a compelling user-facing loop before deeper automation features land.

### Implementation Notes (September 17, 2025)

- Welcome flow now embeds the Golden Workplace company/employee setup panel directly—no more Kilo auth screen—and provides a quick link into the Workforce Hub.
- Workforce Hub remains the control center for editing personas and choosing the active chat agent; styling upgrades are still pending.
