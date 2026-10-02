@frozen
Feature: mail-hook — the plugin ships the mail-surfacing hook
  The plugin's hooks/hooks.json registers SessionStart only, running the installed plugin copy's own
  CLI through ${CLAUDE_PLUGIN_ROOT}, so the hook never resolves a CLI from the
  registry at run time. What mail hook emits is the CLI's mail/surface node; what init writes into a
  project is the CLI's init node.

  Scenario: the plugin's hook file registers SessionStart only
    Given the plugin's hooks/hooks.json
    When its events are read
    Then SessionStart is the only event it registers

  Scenario: the plugin hook command runs the plugin's own CLI, never npx
    Given the plugin's hooks/hooks.json
    When the SessionStart hook command is read
    Then it is node "${CLAUDE_PLUGIN_ROOT}/bin/cyberlegion.mjs" mail hook --event SessionStart, with no npx

  Scenario: the plugin hook runs from an installed-shape plugin directory
    Given an installed-shape plugin directory holding bin, dist/cli.mjs, hooks, and package.json but no node_modules
    And a hub where the caller has one unread message
    When the SessionStart hook command runs in a shell with CLAUDE_PLUGIN_ROOT set to that directory
    Then it exits zero and prints the hook payload naming SessionStart and carrying that message

  Scenario: every vendor manifest names the plugin's hook file
    Given the canonical plugin.json and each vendor manifest it builds
    When their hooks fields are read
    Then each names ./hooks/hooks.json
