# Session Tree Navigation

The `/tree` command provides tree-based navigation of the session history.

## Overview

Sessions are stored as trees where each entry has an `id` and `parentId`. The "leaf" pointer tracks the current position. `/tree` lets you navigate to any point and optionally summarize the branch you're leaving.

### Comparison with `/fork`

| Feature | `/fork`                                | `/tree`                                |
|---------|----------------------------------------|----------------------------------------|
| View    | Flat list of user messages             | Full tree structure                    |
| Action  | Extracts path to **new session file**  | Changes leaf in **same session**       |
| Summary | Never                                  | Optional (user prompted)               |
| Events  | `session_before_fork` / `session_fork` | `session_before_tree` / `session_tree` |

## Tree UI

```
├─ user: "Hello, can you help..."
│  └─ assistant: "Of course! I can..."
│     ├─ user: "Let's try approach A..."
│     │  └─ assistant: "For approach A..."
│     │     └─ user: "That worked..."  ← active
│     └─ user: "Actually, approach B..."
│        └─ assistant: "For approach B..."
```

### Controls

| Key                          | Action                                            |
|------------------------------|---------------------------------------------------|
| ↑/↓                          | Navigate (depth-first order)                      |
| ←/→                          | Page up/down                                      |
| Ctrl+←/Ctrl+→ or Alt+←/Alt+→ | Fold/unfold and jump between branch segments      |
| Enter                        | Select node                                       |
| Escape/Ctrl+C                | Cancel                                            |
| Ctrl+U                       | Toggle: user messages only                        |
| Ctrl+O                       | Toggle: show all (including custom/label entries) |

`Ctrl+←` or `Alt+←` folds the current node if it is foldable. Foldable nodes are roots and branch segment starts that have visible children. If the current node is not foldable, or is already folded, the selection jumps up to the previous visible branch segment start.

`Ctrl+→` or `Alt+→` unfolds the current node if it is folded. Otherwise, the selection jumps down to the next visible branch segment start, or to the branch end when there is no further branch point.

### Display

- Height: half terminal height
- Current leaf marked with `← active`
- Labels shown inline: `[label-name]`
- Foldable branch starts show `⊟` in the connector. Folded branches show `⊞`
- Active path marker `•` appears after the fold indicator when applicable
- Search and filter changes reset all folds
- Default filter hides `label` and `custom` entries (shown in Ctrl+O mode)
- Children sorted by timestamp (oldest first)

## Selection Behavior

### User Message or Custom Message

1. Leaf set to **parent** of selected node (or `null` if root)
2. Message text placed in **editor** for re-submission
3. User edits and submits, creating a new branch

### Non-User Message (assistant, etc.)

1. Leaf set to **selected node**
2. Editor stays empty
3. User continues from that point

### Selecting Root User Message

If user selects the very first message (has no parent):

1. Leaf reset to `null` (empty conversation)
2. Message text placed in editor
3. User effectively restarts from scratch

## Implementation

### AgentSession.navigateTree()

```typescript
async navigateTree(
  targetId: string,
  options?: { label?: string }
): Promise<{ editorText?: string; cancelled: boolean }>
```

Options:

- `label`: Label to attach to the target entry

Flow:

1. Validate target, check no-op (target === current leaf)
2. Fire `session_before_tree` event (hook can cancel or override the label)
3. Switch leaf via `resetLeaf()` or `branch()`
4. Update agent: `agent.replaceMessages(sessionManager.buildSessionContext().messages)`
5. Fire `session_tree` event
6. Return result with `editorText` if user message was selected

### SessionManager

- `getLeafUuid(): string | null` - Current leaf (null if empty)
- `resetLeaf(): void` - Set leaf to null (for root user message navigation)
- `getTree(): SessionTreeNode[]` - Full tree with children sorted by timestamp
- `branch(id)` - Change leaf pointer

### InteractiveMode

`/tree` command shows `TreeSelectorComponent`, then:

1. Call `session.navigateTree()`
2. Clear and re-render chat
3. Set editor text if applicable

## Hook Events

### `session_before_tree`

```typescript
interface TreePreparation {
  targetId: string;
  oldLeafId: string | null;
  label?: string;
}

interface SessionBeforeTreeEvent {
  type: "session_before_tree";
  preparation: TreePreparation;
}

interface SessionBeforeTreeResult {
  cancel?: boolean;
  label?: string;  // Override label
}
```

Extensions can override `label` by returning it from the `session_before_tree` handler.

### `session_tree`

```typescript
interface SessionTreeEvent {
  type: "session_tree";
  newLeafId: string | null;
  oldLeafId: string | null;
}
```

## Error Handling

- Hook returns `cancel: true`: cancels navigation silently
