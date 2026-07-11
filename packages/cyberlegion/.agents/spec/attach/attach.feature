@frozen
Feature: attach — the human's read-pane (an attention pointer)
  Records and reports the hub's single main pane: the pane the standing owner's live presence binds
  to, where owner mail surfaces. Minting the standing owner inbox lives in unit/registry; owner-mail
  surfacing itself lives in mail/surface.

  # One verb, one flag family: bare `attach` binds this pane (was `bind-main`); `--clear` unbinds
  # (was `bind-main --clear`); `--show` reads the bound pane (was `main`); `--follow` (deferred, CR-4)
  # auto-moves it via tmux focus-events. Bare `attach` always binds — no ambiguity.

  # ── The main pane (the standing owner's live presence) ──

  Scenario: attach records the caller's current pane as the hub main pane
    Given a session inside a tmux pane
    When it runs attach
    Then the hub's main pane resolves to that pane

  Scenario: attach throws when the caller is in no multiplexer pane
    Given a session in no multiplexer pane
    When it runs attach
    Then the command throws that there is no pane to bind
    And no main pane is recorded

  Scenario: binding from a different pane moves the main pane
    Given a hub whose main pane is already bound to one pane
    When a session in a different pane runs attach
    Then the hub's main pane resolves to the second pane
    And there is still exactly one bound main pane

  Scenario: attach --clear removes the binding
    Given a hub with a bound main pane
    When a session runs attach --clear
    Then the hub has no bound main pane

  Scenario: attach --clear is a no-op when nothing is bound
    Given a hub with no bound main pane
    When a session runs attach --clear
    Then it does not throw
    And the hub still has no bound main pane

  Scenario: attach --show prints the bound pane
    Given a hub whose main pane is bound
    When a session runs attach --show
    Then it prints the bound pane id

  Scenario: attach --show reports a definitive none when unbound
    Given a hub with no bound main pane
    When a session runs attach --show
    Then it reports "none" rather than erroring

  Scenario: binding a main pane neither creates nor requires a standing owner
    Given a hub with no standing owner record
    When a session in a pane runs attach
    Then the main pane is bound
    And no standing owner record is created
