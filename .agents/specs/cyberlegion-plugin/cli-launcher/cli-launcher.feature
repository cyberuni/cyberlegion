@frozen
Feature: cli-launcher — skills run the CLI they ship with
  Every plugin skill that runs a cyberlegion command runs it through a forwarder at
  skills/<skill>/scripts/cyberlegion.mjs, which universal-plugin plugin build writes from a forward
  entry in plugin.json. The forwarder finds the cyberlegion package that contains it from its own real
  path and runs that package's bin/cyberlegion.mjs, or, in a standalone skill folder, the published
  npx -y cyberlegion@<version>. Skill bodies name no other runner of the CLI. The release version flow
  syncs plugin.json and .plugin/pins.json from packages/cyberlegion/package.json and rebuilds the
  forwarders, with the test suite failing on any stale pin. init-cyberlegion's pins.json-driven
  init --pin is the init node's frozen suite. Which command a skill runs is each skill's own node; the
  CLI's commands are the sibling CLI project.

  # ── Running a CLI command from a skill ──

  Scenario: every skill that runs the CLI ships a forwarder
    Given a plugin skill whose SKILL.md names a cyberlegion command
    When the skill directory and plugin.json are inspected
    Then the skill contains scripts/cyberlegion.mjs and plugin.json declares it as a forward entry for the cyberlegion bin

  Scenario: a skill body runs every CLI command through its forwarder
    Given a plugin skill whose SKILL.md names a cyberlegion command
    When its command invocations are read
    Then every invocation is node scripts/cyberlegion.mjs and none runs cyberlegion through npx, upx, or pnpm exec

  Scenario: the forwarder finds the CLI from its own location, not the working directory
    Given a skill's forwarder and a working directory with no cyberlegion package in it
    When node runs the forwarder by path from that working directory
    Then it runs the CLI of the package that contains the forwarder

  Scenario: a skill's forwarder runs the shipped CLI from an installed-shape plugin directory
    Given an installed-shape plugin directory holding the skills, bin, dist/cli.mjs, and package.json but no node_modules
    When node runs a skill's scripts/cyberlegion.mjs with --version
    Then it prints the package.json version and exits zero

  Scenario: arguments, output, and the exit code pass through the forwarder unchanged
    Given an installed-shape plugin directory
    When node runs a skill's forwarder with a command the CLI rejects
    Then its stdout, stderr, and exit code equal those of bin/cyberlegion.mjs run with the same arguments

  Scenario: a forwarder in a standalone skill folder runs the pinned published CLI
    Given a skill folder copied on its own, with no cyberlegion package above its forwarder
    When node runs its scripts/cyberlegion.mjs with arguments
    Then it runs npx -y cyberlegion@<package version> with those arguments and exits with that command's exit code

  Scenario: a forwarder at a checkout without the built CLI names it and the pinned fallback
    Given an installed-shape plugin directory without dist/cli.mjs
    When node runs a skill's forwarder
    Then it exits non-zero naming the missing dist/cli.mjs and npx -y cyberlegion@<package version>, with no raw module-not-found error

  # ── Running a bare cyberlegion in a Claude Code session ──

  Scenario: the package ships an executable bin/cyberlegion
    Given the cyberlegion package
    When its bin directory and package.json files are inspected
    Then bin/cyberlegion exists, is executable, and is covered by package.json files

  Scenario: a bare cyberlegion runs the shipped CLI from an unrelated working directory
    Given an installed-shape plugin directory whose bin is on PATH and a working directory outside it
    When cyberlegion --version runs by bare name from that working directory
    Then it prints the package.json version and exits zero

  Scenario: arguments, output, and the exit code pass through the bare command unchanged
    Given an installed-shape plugin directory whose bin is on PATH
    When a bare cyberlegion runs with a command the CLI rejects
    Then its stdout, stderr, and exit code equal those of bin/cyberlegion.mjs run with the same arguments

  # ── Cutting a release ──

  Scenario: the version flow rewrites the plugin manifest's version
    Given a plugin.json whose version is older than package.json
    When the version sync runs
    Then plugin.json's version names the package.json version

  Scenario: every forwarder embeds the plugin manifest's version
    Given the plugin's forwarders as plugin build wrote them
    When each forwarder's embedded version is read
    Then it equals plugin.json's version

  Scenario: the version flow rewrites the plugin's pins map
    Given a .plugin/pins.json whose cyberlegion entry names an older version than package.json
    When the version sync runs
    Then its cyberlegion entry names the package.json version

  # ── Catching a stale pin ──

  Scenario: a pin that disagrees with the package version fails the test suite
    Given a forwarder's embedded version or the pins map's cyberlegion entry that differs from package.json
    When the test suite runs
    Then it fails naming the stale pin

  Scenario: pins that match the package version pass the test suite
    Given every forwarder's embedded version and the pins map's cyberlegion entry equal to package.json
    When the test suite runs
    Then the pin check passes
