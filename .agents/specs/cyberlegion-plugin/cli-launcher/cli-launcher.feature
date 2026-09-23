@frozen
Feature: cli-launcher — skills run the CLI they ship with
  Every plugin skill that runs a cyberlegion command runs the CLI its own plugin ships, through a
  launcher at skills/<skill>/scripts/cyberlegion.mjs that resolves the package root from its own file
  location and hands every argument to bin/cyberlegion.mjs. Each skill also names one pinned
  npx -y cyberlegion@<version> fallback, and the release version flow rewrites those pins and the
  plugin's .plugin/pins.json map from packages/cyberlegion/package.json, with the test suite failing on
  any stale pin. init-cyberlegion's pins.json-driven fallback is the init node's frozen suite. Which
  command a skill runs is each skill's own node; the CLI's commands are the sibling CLI project.

  # ── Running a CLI command from a skill ──

  Scenario: every skill that runs the CLI ships a launcher
    Given a plugin skill whose SKILL.md names a cyberlegion command
    When the skill directory is inspected
    Then it contains scripts/cyberlegion.mjs

  Scenario: a skill body runs every CLI command through its launcher
    Given a plugin skill whose SKILL.md names a cyberlegion command
    When its command invocations are read
    Then every invocation is node scripts/cyberlegion.mjs except the one pinned npx fallback line

  Scenario: the launcher finds the CLI from its own location, not the working directory
    Given a skill's launcher and a working directory with no cyberlegion package in it
    When node runs the launcher by path from that working directory
    Then it runs the CLI of the package that contains the launcher

  Scenario: a skill's launcher runs the shipped CLI from an installed-shape plugin directory
    Given an installed-shape plugin directory holding the skills, bin, dist/cli.mjs, and package.json but no node_modules
    When node runs a skill's scripts/cyberlegion.mjs with --version
    Then it prints the package.json version and exits zero

  Scenario: arguments, output, and the exit code pass through the launcher unchanged
    Given an installed-shape plugin directory
    When node runs a skill's launcher with a command the CLI rejects
    Then its stdout, stderr, and exit code equal those of bin/cyberlegion.mjs run with the same arguments

  Scenario: a launcher at a checkout without the built CLI names it and the pinned fallback
    Given an installed-shape plugin directory without dist/cli.mjs
    When node runs a skill's launcher
    Then it exits non-zero naming the missing dist/cli.mjs and npx -y cyberlegion@<package version>, with no raw module-not-found error

  # ── Falling back when the launcher cannot be resolved ──

  Scenario: each skill names one pinned npx fallback of the shipped version
    Given a plugin skill whose SKILL.md names a cyberlegion command, other than init-cyberlegion
    When its npx invocations of cyberlegion are read
    Then there is exactly one, of the form npx -y cyberlegion@<version>, and its version equals package.json

  # ── Cutting a release ──

  Scenario: the version flow rewrites every skill's fallback pin
    Given skills whose fallback pins name an older version than package.json
    When the version sync runs
    Then every skill's fallback pin names the package.json version

  Scenario: the version flow rewrites the plugin's pins map
    Given a .plugin/pins.json whose cyberlegion entry names an older version than package.json
    When the version sync runs
    Then its cyberlegion entry names the package.json version

  # ── Catching a stale pin ──

  Scenario: a pin that disagrees with the package version fails the test suite
    Given a skill fallback pin or the pins map's cyberlegion entry that differs from package.json
    When the test suite runs
    Then it fails naming the stale pin

  Scenario: pins that match the package version pass the test suite
    Given every skill fallback pin and the pins map's cyberlegion entry equal to package.json
    When the test suite runs
    Then the pin check passes
