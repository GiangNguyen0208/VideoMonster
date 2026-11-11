# 02 — Users, Use Cases, UX Principles

Studio must make sense to someone who has never heard of a "pipeline", a "gate" or a "render runtime". This document defines who the users are, what they come to do, and the rules every screen follows.

## 1. Personas

| Persona | Setup | Wants | Main fear |
|---|---|---|---|
| **First-timer** | Fresh clone, zero API keys | See something real in minutes | Breaking something; surprise costs |
| **Creator** | 1–2 keys (e.g. `FAL_KEY`) | Short vertical videos, fast | Generic-looking output |
| **Educator / Dev advocate** | Zero-key or Starter | Explainers, screen demos, data stories | Wrong facts; time sink |
| **Marketer** | Standard / Full | Product teaser, launch reel | Off-brand look; budget overrun |
| **Footage owner** (podcaster, speaker) | Any | Turn existing footage into clips, dubs, polished cuts | Uploading and losing control of their media |

## 2. Setup tiers (from `skills/meta/onboarding.md`)

Studio shows the user's tier as a badge and explains what the next tier unlocks.

| Tier | What's configured | Video types it unlocks |
|---|---|---|
| Zero-key | Piper TTS, stock footage, Remotion / HyperFrames, FFmpeg | Explainer (data, history, dev topics), demos |
| Starter | + 1 image-generation provider | + Animation |
| Standard | + image, TTS, music | + Screen demo, Hybrid |
| Full | + video generation, premium TTS | + Cinematic, Avatar, Talking head |
| Full + GPU | + local video models | Free local fallbacks |

Cost guide from onboarding: $0 at zero-key, about $0.30–1.50 with one paid provider, and about $1–3 for a full setup. Production takes about 5–40 minutes.

## 3. Goal-first video types

Newcomers pick a **goal**, not a pipeline. Each card shows:
- a one-line promise
- whether the user needs their own footage
- whether it is beta
- whether it is unlocked on this machine (or "needs X — unlock")
- the typical cost

| Goal card (Studio wording) | Pipeline | Needs your footage | Stability |
|---|---|---|---|
| Explain a topic | `animated-explainer` | No | production |
| Animated / anime-style video | `animation` | No | production |
| Trailer or teaser | `cinematic` | No | production |
| Cartoon character story | `character-animation` | No | beta |
| Show my app or terminal | `screen-demo` | Optional (real capture or synthetic) | production |
| My footage + extra visuals | `hybrid` | Yes | production |
| AI presenter / spokesperson | `avatar-spokesperson` | No (avatar provider) | production |
| Polish my talking video | `talking-head` | Yes | beta |
| Long video → short clips | `clip-factory` | Yes | beta |
| Podcast highlights | `podcast-repurpose` | Yes | beta |
| Translate or dub a video | `localization-dub` | Yes | beta |
| Montage from real footage | `documentary-montage` | No (stock/archive) | beta |

`framework-smoke` is a test pipeline and is never shown.

A cross-cutting entry, **"Make something like this"**, is offered next to the goal cards. The user pastes a link or drops a video, and the agent's reference-analysis flow (`skills/meta/video-reference-analyst.md`) chooses the pipeline.

The engine side of this mapping lives in one config file (`studio/src/content/goals.ts`; see Phase 3). Copy can then change without touching pipeline YAML.

## 4. Core use cases

Each use case lists its trigger, steps, success condition, screens and phase.

### UC1 — First run: "What can I do here?"
- **Trigger:** the user opens Studio for the first time.
- **Steps:**
  1. Studio runs a capability check (`provider_menu_summary`).
  2. It shows a tier badge, a list of what works now, and a few unlock cards (one env var each).
  3. Runtime warnings are shown verbatim.
- **Success:** within 30 s the user knows what they can make now and which single key would unlock more.
- **Screens:** Setup center. **Phase:** 2.

### UC2 — Try a demo (zero keys)
- **Trigger:** "Show me what this makes."
- **Steps:** pick a demo card (`render_demo.py --list`) → Render → watch progress → play the video.
- **Success:** an MP4 plays in the browser and no keys were needed.
- **Screens:** Home → Demos. **Phase:** 3.

### UC3 — Make a video from an idea
- **Trigger:** "New video."
- **Steps:**
  1. Pick a goal card.
  2. Fill the brief: topic, audience, platform/aspect, duration, tone; optionally a style.
  3. Set a budget cap.
  4. Review the summary → Create.
  5. Studio creates the project and shows a one-line command to start the agent (copy button).
  6. The project page goes live as soon as the agent starts.
- **Success:** the project exists with a complete brief, and the agent starts it without asking questions the wizard already answered.
- **Screens:** Wizard → Kickoff → Project page. **Phase:** 3.

### UC4 — Make something like this reference
- **Trigger:** "Make something like this [link]."
- **Steps:** paste a link or upload a file → add a short note on what to keep or change → create → kickoff. The agent runs reference analysis and proposes a pipeline at the first review point.
- **Success:** the reference is stored with the project, and the first review point explains what was learned from it.
- **Phases:** 3 (link), 5 (upload).

### UC5 — Repurpose my footage
- **Trigger:** "I have a video or podcast."
- **Steps:** pick a footage goal → upload (with progress, size limits, format check) → brief → create → kickoff.
- **Success:** the files are inside `projects/<id>/inputs/` and the agent picks them up.
- **Phase:** 5.

### UC6 — Review and approve a step
- **Trigger:** the agent reaches a review point. The project card shows **"Waiting for you"**, and the browser can show a notification.
- **Steps:**
  1. Open the review panel. It shows the step's content (script text, storyboard, assets filmstrip, proposal concepts), the agent's self-review, and the cost so far.
  2. Choose **Approve**, **Request changes** (with notes), or **Stop project**.
  3. At the proposal step, also pick:
     - a concept
     - a budget
     - a look (Standard/Custom)
     - a rendering engine — both shown when both are available
  4. Studio records the decision.
  5. The agent applies it (see the architecture doc); the step turns green or the agent revises.
- **Success:** no review point needs a typed chat reply, and the agent's turn-ending gate protocol is still respected.
- **Phase:** 4.

### UC7 — Track progress and cost
- **Steps:** the project page shows:
  - the step timeline (done / working / waiting for you / failed)
  - a live activity feed
  - "generating…" states
  - spent, reserved and remaining budget
- **Success:** the user always knows the current step, what the agent is doing, and what it has cost.
- **Phases:** 1 (progress), 6 (cost detail).

### UC8 — Find, watch, download
- **Steps:** Library (search, series, status filter) → project → final video player → download MP4 / export bundle.
- **Success:** the result is reachable in 2 clicks from Home.
- **Phases:** 1 (library), 6 (download/export).

## 5. UX principles (apply to every phase)

1. **Plain words.** Use "video type", "step", "review point", "style" and "rendering engine". Engine terms appear only in an *Advanced* drawer or a tooltip.
2. **One next action.** Every screen has one primary call to action. A project page that needs the user leads with a banner such as "Waiting for you: review the script".
3. **Three choices max** in the main flow. Everything else goes behind *Advanced*: runtime, composition mode, provider/model, checkpoint policy.
4. **Cost before spend.** Show an estimate whenever a choice can cost money. Show "$0 — runs locally" when free. Budget caps are visible on the project page.
5. **No raw JSON.** Render artifacts as documents: a script as a screenplay, a scene plan as a storyboard. A "View source" link is allowed under *Advanced*.
6. **Honest locks.** Disabled options say why ("Needs an image provider key") and link to the unlock card. Never hide a video type silently.
7. **Never surprise the agent.** Studio only writes intents. It never edits checkpoints or artifacts the agent owns (see `03-architecture.md`).
8. **Recoverable.** Every write action can be undone or re-decided until the agent consumes it (for example, editing a pending decision).
9. **Live, not polled.** Use SSE for every project and library view, reusing Backlot's change hub.
10. **Accessible.** Keyboard reachable, visible focus, WCAG AA contrast in light and dark themes, and status shown by text as well as colour.

## 6. Information architecture

```
Studio
├── Home            next actions ("waiting for you"), recent projects, New video, Demos
├── New video       goal → brief → style & budget → review → kickoff
├── Library         all projects, series, filters
├── Project         timeline · review panel · storyboard · decisions · activity · result · cost
├── Setup           tier, works-now, unlock cards, keys, runtimes, warnings
└── Settings        budget defaults, checkpoint policy, output format (config.yaml)
```
