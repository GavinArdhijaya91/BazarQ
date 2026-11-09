## Match detail to document scope

Do not include lower-level implementation detail merely because it was available during the task.

Architecture documents describe architecture.

Package documentation describes package contracts.

API references describe APIs.

Tutorials describe the path needed to complete the tutorial.

Decision records explain durable decisions and trade-offs.

Postmortems contain incident chronology.

Do not mix these forms without a specific reason.

## Prefer contracts over narration

Documentation should answer things such as:

- What does this component do?
- What inputs does it accept?
- What does it return?
- What state does it own?
- What assumptions does it make?
- What can fail?
- What guarantees does it provide?
- What are its limitations?
- How does another component interact with it?

Do not spend words describing how the author learned those facts.

## Be concise without deleting contracts

Remove:

- throat-clearing introductions;
- repeated summaries;
- obvious restatements of headings;
- motivational filler;
- unnecessary adjectives;
- duplicated rationale;
- commentary about the writing process.

Keep:

- constraints;
- failure behavior;
- ownership;
- side effects;
- timing guarantees;
- exceptions;
- invariants;
- non-obvious limitations.

Conciseness must not remove behaviorally important information.

## Paragraph discipline

Each paragraph should communicate one main idea.

If a paragraph contains multiple unrelated rules, split it.

Prefer short declarative sentences with explicit actors.

Avoid nested parentheticals and long chains of qualifiers.

## Avoid meta-documentation

Do not tell the reader what the document is trying to prove.

Avoid:

> This section demonstrates that the architecture is modular.

Write the actual architecture:

> Domain services depend on ports. Infrastructure adapters implement those ports and are composed at the application boundary.

Do not say a design is "clean", "correct", "robust", or "well structured". Describe the properties that allow the reader to reach that conclusion.

## Final editing pass

Before finishing documentation, delete any sentence that primarily answers one of these questions:

- What did the agent do?
- What did the prompt ask for?
- What files did the agent inspect?
- What did the agent think while solving it?
- How can the agent prove that it completed the task?
- What obvious fact was already demonstrated by the resulting code?

Keep the sentence only if it helps a future reader understand the system independently of the task that created the document.

## Default voice

Use direct, neutral, technical prose.

Write as if the document had always existed in its current form.

Do not address the original requester.

Do not reference the conversation, ticket, task, agent, or implementation session unless the document type explicitly requires historical context.