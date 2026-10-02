@frozen
Feature: mail-hook — the plugin ships the mail-surfacing hook
  The plugin's hooks/hooks.json registers SessionStart only, running the spawner's CLI named in
  $CYBERLEGION_CLI in a spawned unit, else the installed plugin copy's own CLI through
  ${CLAUDE_PLUGIN_ROOT}, so the hook never resolves a CLI by name from PATH or the registry. What
  mail hook emits is the CLI's mail/surface node; what init writes into a project is the CLI's init
  node.

  # ── the hook file ──

  Scenario: the plugin's hook file registers SessionStart only
    Given the plugin's hooks/hooks.json
    When its events are read
    Then SessionStart is the only event it registers

  Scenario: the plugin hook command prefers CYBERLEGION_CLI, else the plugin's own CLI, never npx
    Given the plugin's hooks/hooks.json
    When the SessionStart hook command is read
    Then it runs "$CYBERLEGION_CLI" mail hook --event SessionStart when that names an executable, else node "${CLAUDE_PLUGIN_ROOT}/bin/cyberlegion.mjs" mail hook --event SessionStart, with no npx

  # ── which CLI the hook runs ──
  # A spawned unit's launch names the spawner's CLI shim in CYBERLEGION_CLI (the CLI's unit/lifecycle).

  Scenario: the plugin hook runs the CLI named in CYBERLEGION_CLI
    Given CYBERLEGION_CLI naming an executable stand-in for the spawner's CLI
    When the SessionStart hook command runs in a shell with CLAUDE_PLUGIN_ROOT set
    Then the stand-in runs with mail hook --event SessionStart and the plugin's CLI does not

  Scenario: the plugin hook ignores a cyberlegion on PATH when CYBERLEGION_CLI is unset
    Given no CYBERLEGION_CLI and a different cyberlegion first on PATH
    When the SessionStart hook command runs in a shell with CLAUDE_PLUGIN_ROOT set
    Then the plugin's own CLI runs with mail hook --event SessionStart

  Scenario: the plugin hook falls back when CYBERLEGION_CLI names no executable
    Given CYBERLEGION_CLI naming a path where no file exists
    When the SessionStart hook command runs in a shell with CLAUDE_PLUGIN_ROOT set
    Then the plugin's own CLI runs with mail hook --event SessionStart

  # ── the installed copy ──

  Scenario: the plugin hook runs from an installed-shape plugin directory
    Given an installed-shape plugin directory holding bin, dist/cli.mjs, hooks, and package.json but no node_modules
    And a hub where the caller has one unread message
    When the SessionStart hook command runs in a shell with CLAUDE_PLUGIN_ROOT set to that directory
    Then it exits zero and prints the hook payload naming SessionStart and carrying that message

  # ── the vendor manifests ──

  Scenario: every vendor manifest names the plugin's hook file
    Given the canonical plugin.json and each vendor manifest it builds
    When their hooks fields are read
    Then each names ./hooks/hooks.json
