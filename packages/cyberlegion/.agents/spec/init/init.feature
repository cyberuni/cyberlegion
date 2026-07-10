@frozen
Feature: init — the onboarding front door
  One command resolves this session's harness and registers the SessionStart surfacing hook, then
  points the human at binding a durable owner inbox. init owns hook installation directly (the old
  admin install folded in here); the hook payload lives in mail/surface; minting the owner inbox
  lives in unit/registry and binding the read-pane in attach.

  # ── init resolves the harness and registers the surfacing hook ──

  Scenario: init auto-detects the harness and registers the SessionStart hook
    Given a fresh project directory and a session whose harness is detectable as claude
    When it runs init with no --agent
    Then claude's config registers "cyberlegion mail hook --event SessionStart" under its own event key
    And the result reports the resolved harness as claude

  Scenario: init registers PostToolUse only where the resolved harness supports it
    Given a fresh project directory
    When init resolves claude and registers
    Then claude's config also registers a PostToolUse hook
    When init resolves cursor and registers
    Then cursor's config has no PostToolUse entry

  Scenario: init registers PostToolUse for codex, which supports it
    Given a fresh project directory
    When init resolves codex and registers
    Then codex's config also registers a PostToolUse hook

  Scenario: init registers the SessionStart hook for cursor and codex too
    Given a fresh project directory
    When init --agent cursor and init --agent codex each register
    Then each harness's config registers "cyberlegion mail hook --event SessionStart" under its own event key

  # ── auto-detect vs explicit --agent ──

  Scenario: init installs into the directory named by --dir
    Given a target project directory other than the current directory
    When it runs init --agent claude --dir that directory
    Then the hook is registered into that directory's claude config, not the current directory's

  Scenario: an explicit --agent overrides detection
    Given a session whose environment would detect claude
    When it runs init --agent cursor
    Then the hook is registered into cursor's config regardless of the env signal

  Scenario: an unrecognized --agent is rejected
    Given a session running init --agent grok
    When the harness is resolved
    Then it throws naming the allowed values claude, cursor, codex

  Scenario: an undetectable harness with no --agent throws rather than guessing
    Given a session with no --agent and no detectable harness signal at all
    When it runs init
    Then the command throws asking for --agent
    And no harness config is written

  # ── init points at owner binding when none is bound ──

  Scenario: init emits a bind-owner next-step when no standing owner exists
    Given a hub with no standing owner record
    When init registers the hook successfully
    Then it emits a next-step toward binding the durable owner inbox

  Scenario: init emits no bind-owner next-step when a standing owner already exists
    Given a hub with a standing owner record already present
    When init registers the hook successfully
    Then it emits no bind-owner next-step

  Scenario: init never mints an owner or binds a pane itself
    Given a hub with no standing owner record
    When init runs successfully
    Then no standing owner record is created
    And no main pane is bound

  # ── init is idempotent ──

  Scenario: re-running init does not duplicate the hook entry
    Given a project where init has already installed the hook for claude
    When init runs again and resolves claude
    Then each hook reports "already present" rather than registering a second entry
    And claude's hook list for SessionStart still has exactly one entry
