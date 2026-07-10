@frozen
Feature: agent — resolve reusable agent definitions
  Resolve a universal `.md` agent def (YAML frontmatter + Markdown body, as used under
  `.agents/agents/*.md` and `plugins/*/agents/*.md`) into a machine payload or a CHANNEL launch
  command. Reads a file only — no knowledge of plugin namespacing, SDD, or the def's author. The
  gateway/Legate routing brain that decides warm-peer vs run-inline vs subagent lives in the future
  `legion-gateway-legate` (CR-5); this node only resolves + realizes the channel launch. A caller
  composing a cold Task subagent builds that instruction itself from the resolved payload.

  # ── Resolve by name under the project convention ──

  Scenario: resolving by name finds <name>.md under .agents/agents/
    Given a def file at .agents/agents/reviewer.md
    When resolveAgentDef runs with name "reviewer"
    Then it reads that file and returns an AgentDef for it

  Scenario: the Markdown body after the frontmatter block becomes instructions verbatim
    Given a def file whose frontmatter block is followed by a Markdown body
    When the def is resolved
    Then instructions equals the body text with no frontmatter markers in it

  Scenario: an unresolvable name errors with a clear message
    Given no file named ghost.md exists under .agents/agents/
    When resolveAgentDef runs with name "ghost"
    Then it throws an error naming "ghost" rather than returning an empty/default def

  # ── Resolve an exact file, bypassing name search entirely ──

  Scenario: --agent-file reads that exact path directly
    Given a def file living outside .agents/agents/ (e.g. plugins/sdd/agents/sdd-impl-judge.md)
    When resolveAgentDef runs with file "<path>"
    Then it reads that path directly without searching .agents/agents/ at all

  Scenario: a nonexistent --agent-file errors with a clear message
    Given a file path that does not exist
    When resolveAgentDef runs with that file
    Then it throws an error saying the file does not exist

  Scenario: neither name nor file given errors rather than guessing
    Given a resolve call with no name and no file
    When resolveAgentDef runs
    Then it throws an error asking for --agent or --agent-file

  # ── Frontmatter tags parse into typed fields ──

  Scenario Outline: a scalar frontmatter tag parses into its typed field
    Given a def file with "<tag>: <value>" in its frontmatter
    When the def is resolved
    Then its <tag> field equals <parsed>

    Examples:
      | tag         | value  | parsed        |
      | model       | sonnet | "sonnet"      |
      | effort      | high   | "high"        |
      | harness     | claude | "claude"      |
      | warm        | true   | true          |
      | interactive | false  | false         |

  Scenario: a folded > block-scalar description spanning multiple lines parses into one string
    Given a def file whose description uses a folded `>` block scalar across several indented lines
    When the def is resolved
    Then description is the joined, single-line text of those lines

  Scenario: a tag the def omits resolves to undefined rather than a guessed default
    Given a def file with no harness/warm/interactive tags at all
    When the def is resolved
    Then harness, warm, and interactive are all undefined on the result

  # ── A def missing model is not an error ──

  Scenario: a def with no model tag still resolves successfully
    Given a def file whose frontmatter has no model key
    When the def is resolved
    Then resolution succeeds and model is undefined on the result

  # ── realizeLaunch applies model + instructions per harness ──

  Scenario Outline: realizeLaunch maps a harness tag to its own launch binary
    Given a resolved def with harness "<harness>"
    When realizeLaunch runs
    Then the command starts with the "<harness>" launch binary

    Examples:
      | harness | binary       |
      | claude  | claude       |
      | cursor  | cursor-agent |
      | codex   | codex        |

  Scenario: realizeLaunch defaults to claude when neither the def nor an override sets a harness
    Given a resolved def with no harness tag and no harness override
    When realizeLaunch runs
    Then the launch harness is claude

  Scenario: realizeLaunch applies the def's own model and instructions
    Given a resolved def with model "sonnet" and instructions "review the diff"
    When realizeLaunch runs with no overrides
    Then the command carries model "sonnet" and the instructions text, safely quoted

  Scenario: an explicit model/harness override wins over the def's own tags
    Given a resolved def with model "sonnet" and harness "claude"
    When realizeLaunch runs with an override model "opus" and harness "codex"
    Then the resulting command uses model "opus" and the codex launch binary

  Scenario: instructions containing shell-special characters are safely quoted
    Given a resolved def whose instructions contain a single quote, double quotes, and a $() sequence
    When realizeLaunch runs
    Then the command escapes the instructions so they are inert as shell syntax

  # ── agent list / show / resolve / path ──

  Scenario: agent list reports a definitive empty state when no defs exist
    Given a project with no .agents/agents/ directory or an empty one
    When it runs agent list
    Then it reports 0 agent definitions rather than omitting the aggregate line

  Scenario: agent list rows show name, model, and harness for every resolvable def
    Given two def files under .agents/agents/
    When it runs agent list
    Then each row shows that def's name, model, and harness

  Scenario: agent show prints the resolved routing fields and a truncated instructions body
    Given a def with a long instructions body
    When it runs agent show <name>
    Then it prints model, effort, harness, warm, and interactive
    And the instructions are truncated with a note to pass --full for the rest

  Scenario: agent show --full prints the entire instructions body
    Given the same def with a long instructions body
    When it runs agent show <name> --full
    Then the full instructions text is printed, not truncated

  Scenario: agent show reflects a missing model as the harness-default note, not an error
    Given a def with no model tag
    When it runs agent show <name>
    Then it exits 0 and shows a harness-default placeholder rather than failing

  Scenario: agent resolve --format json emits the full AgentDef payload
    Given a resolvable def
    When it runs agent resolve <name> --format json
    Then the JSON payload matches the def's name, model, and instructions

  Scenario: agent resolve --file resolves an exact path, bypassing name search
    Given a def file living outside .agents/agents/
    When it runs agent resolve --agent-file <path>
    Then it resolves that exact file rather than searching the project convention

  Scenario: agent path prints only the resolved def file's path
    Given a resolvable def
    When it runs agent path <name>
    Then the output is that def's resolved file path

  Scenario: a bad name/file fails loud rather than falling back to a default
    Given a name with no matching def file
    When it runs any agent verb with that name
    Then the command exits non-zero with a structured stderr error naming what was not found