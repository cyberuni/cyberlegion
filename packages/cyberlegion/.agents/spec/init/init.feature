@frozen
Feature: init — the onboarding front door
  One command resolves this session's harness and makes sure the surfacing hook will fire with the
  CLI the session was installed with, then points the human at binding a durable owner inbox. For a
  harness whose plugin ships the hook (claude, codex) init writes no project hook and removes one an
  earlier init wrote; for cursor it registers a PATH-first project hook with an npx fallback. init
  owns hook installation directly (the old admin install folded in here); the hook payload lives in
  mail/surface; minting the owner inbox lives in unit/registry and binding the read-pane in attach.

  # ── init resolves the harness and registers the surfacing hook ──

  Scenario: init auto-detects claude and leaves the surfacing hook to the plugin
    Given a fresh project directory and a session whose harness is detectable as claude
    When it runs init with no --agent
    Then claude's config carries no cyberlegion mail hook entry
    And each hook result reports "provided by plugin"
    And the result reports the resolved harness as claude

  Scenario: init for codex leaves the surfacing hook to the plugin
    Given a fresh project directory
    When init --agent codex registers
    Then codex's config carries no cyberlegion mail hook entry
    And the SessionStart result reports "provided by plugin"
    And no PostToolUse result is reported

  Scenario: init for cursor registers a PATH-first SessionStart hook
    Given a fresh project directory
    When init --agent cursor registers
    Then cursor's config registers under sessionStart a command that runs "cyberlegion mail hook --event SessionStart" when cyberlegion is on PATH and "npx -y cyberlegion mail hook --event SessionStart" otherwise

  Scenario: a failing PATH run of the cursor hook does not also run the npx fallback
    Given a project where init --agent cursor has registered the hook
    And a cyberlegion on PATH that exits non-zero
    When the registered sessionStart command runs in a shell
    Then npx is not run

  Scenario: init registers no PostToolUse hook for cursor, which has no such event
    Given a fresh project directory
    When init --agent cursor registers
    Then cursor's config has no PostToolUse entry

  # ── the pinned form: --pin fixes the version the npx fallback fetches ──

  Scenario: init --pin pins only the npx fallback of the cursor hook
    Given a fresh project directory
    When it runs init --agent cursor --pin 0.2.0
    Then cursor's sessionStart command falls back to "npx -y cyberlegion@0.2.0 mail hook --event SessionStart"
    And the PATH branch runs "cyberlegion mail hook --event SessionStart" with no version pin

  Scenario: init without --pin leaves the cursor fallback unpinned
    Given a fresh project directory
    When it runs init --agent cursor with no --pin
    Then cursor's sessionStart command falls back to "npx -y cyberlegion mail hook --event SessionStart" with no "@" version pin

  Scenario: a malformed --pin is rejected before any hook is registered
    Given a fresh project directory
    When it runs init --agent cursor --pin with an empty, whitespace, range, or shell-metacharacter value
    Then the command is rejected naming --pin as invalid
    And no hook is registered into cursor's config

  Scenario: a --pin that is a version or dist-tag token is accepted
    Given a fresh project directory
    When it runs init --agent cursor --pin with a semver, prerelease, or plain dist-tag value
    Then the pinned PATH-first hook is registered without error

  # ── auto-detect vs explicit --agent ──

  Scenario: init installs into the directory named by --dir
    Given a target project directory other than the current directory
    When it runs init --agent cursor --dir that directory
    Then the hook is registered into that directory's cursor config, not the current directory's

  Scenario: an explicit --agent overrides detection
    Given a session whose environment would detect claude
    When it runs init --agent cursor
    Then the hook is registered into cursor's config regardless of the env signal
    And no claude config is written

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
    When init completes successfully
    Then it emits a next-step toward binding the durable owner inbox

  Scenario: init emits no bind-owner next-step when a standing owner already exists
    Given a hub with a standing owner record already present
    When init completes successfully
    Then it emits no bind-owner next-step

  Scenario: init never mints an owner or binds a pane itself
    Given a hub with no standing owner record
    When init runs successfully
    Then no standing owner record is created
    And no main pane is bound

  # ── init is idempotent and upgrades older hook generations ──

  Scenario: re-running init does not duplicate the hook entry
    Given a project where init has already installed the hook for cursor
    When init runs again and resolves cursor
    Then each hook reports "already present" rather than registering a second entry
    And cursor's hook list for sessionStart still has exactly one entry

  Scenario: re-running init over an older cursor hook generation rewrites it in place
    Given a project whose cursor config carries an older "npx cyberlegion@0.1.0 mail hook --event SessionStart" entry
    When init runs again and resolves cursor
    Then the entry is rewritten to the PATH-first form in place
    And cursor's hook list for sessionStart still has exactly one entry

  Scenario: re-running init with a different --pin re-pins the cursor hook in place
    Given a project where init --agent cursor --pin 0.1.0 has registered the hook
    When init --agent cursor --pin 0.2.0 runs
    Then the sessionStart entry falls back to "npx -y cyberlegion@0.2.0 mail hook --event SessionStart"
    And cursor's hook list for sessionStart still has exactly one entry

  Scenario: re-running init over a legacy bare cursor entry rewrites it in place
    Given a project whose cursor config carries a legacy bare "cyberlegion mail hook --event SessionStart" entry
    When init runs again and resolves cursor
    Then the entry is rewritten to the PATH-first form in place
    And cursor's hook list for sessionStart still has exactly one entry

  Scenario: init leaves a cursor hook that is not cyberlegion's untouched
    Given a project whose cursor config carries an unrelated sessionStart hook
    When init --agent cursor registers
    Then the unrelated hook is kept unchanged beside the cyberlegion entry

  Scenario: init removes a project hook an earlier init wrote for a harness whose plugin ships the hook
    Given a project whose claude config carries an earlier "npx cyberlegion@0.2.0 mail hook --event SessionStart" entry beside an unrelated hook
    When init runs again and resolves claude
    Then the cyberlegion mail hook entry is removed so the plugin's hook does not fire twice
    And the unrelated hook is kept
    And the SessionStart result reports "removed project hook"

  Scenario: init removes a project hook an earlier init wrote for codex
    Given a project whose codex config carries an earlier "npx cyberlegion mail hook --event SessionStart" entry
    When init runs again and resolves codex
    Then that entry is removed
    And the SessionStart result reports "removed project hook"

  Scenario Outline: init removes a retired PostToolUse project hook an earlier init wrote
    Given a project whose <harness> config carries an earlier "npx cyberlegion mail hook --event PostToolUse" entry beside an unrelated PostToolUse hook
    When init runs again and resolves <harness>
    Then the cyberlegion mail hook entry is removed
    And the unrelated PostToolUse hook is kept
    And a PostToolUse result reports "removed project hook"

    Examples:
      | harness |
      | claude  |
      | codex   |

  Scenario: init leaves a user's own PostToolUse hook that calls cyberlegion untouched
    Given a project whose claude config carries a PostToolUse hook "my-wrapper && cyberlegion mail hook --event PostToolUse"
    When init runs again and resolves claude
    Then that hook is kept unchanged
    And no PostToolUse result is reported

  Scenario: init writes no config file for a plugin-hook harness that has none
    Given a fresh project directory
    When init --agent claude registers
    Then no .claude/settings.json is created
