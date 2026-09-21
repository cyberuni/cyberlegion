@frozen
Feature: metaphor-free — the vocabulary-boundary guard
  cyberlegion is chartered metaphor-free: no fleet-persona or place vocabulary from its consumer,
  cyberfleet, in either of its layers. The guard fails when a banned persona name appears, in its
  capitalized proper-noun form and unsanctioned, in an in-scope file — so the boundary is enforced by a
  script rather than a judge's manual grep, and the ban reaches exactly as far as the guard. Matching is case-sensitive on the capitalized form (a whole word or a capitalized compound
  segment), so it catches a persona name hidden in an identifier without colliding with lowercase
  generic English. Scope covers the CLI's src and spec doc tree, the plugin layer's skills and agents,
  and the plugin's project spec, with two whole-file exclusions: the ledgers (provenance, which record
  past leaks verbatim, excluded by position at each spec tree's root) and the guard's own definition files (the
  allow-list and this node's own README and .feature); a small allow-list carries the legitimate
  boundary references.

  # ── check:metaphor-free — the vocabulary-boundary guard ──

  Scenario: a persona name in a source identifier fails the guard
    Given an in-scope source file under the package's src defines a symbol whose name embeds a cyberfleet persona in camelCase
    And that occurrence is not on the sanctioned allow-list
    When check:metaphor-free runs over the package
    Then the guard exits non-zero
    And it reports the file, line, and term as a metaphor-leak violation

  Scenario: a persona name in a spec document fails the guard
    Given an in-scope spec document — one the scope filter admits, so neither the ledger nor a guard-definition file — carries a capitalized cyberfleet persona name in its prose
    And that occurrence is not on the sanctioned allow-list
    When check:metaphor-free runs over the package
    Then the guard exits non-zero
    And it reports the file, line, and term as a metaphor-leak violation

  Scenario: a persona name in a plugin skill fails the guard
    Given a skill document under the plugin layer's skills tree carries a capitalized cyberfleet persona name in its prose
    And that occurrence is not on the sanctioned allow-list
    When check:metaphor-free runs over its roots
    Then the guard exits non-zero
    And it reports that skill document's file, line, and term as a metaphor-leak violation

  Scenario: a persona name in a plugin subagent definition fails the guard
    Given a subagent definition under the plugin layer's agents tree carries a capitalized cyberfleet persona name in its prose
    And that occurrence is not on the sanctioned allow-list
    When check:metaphor-free runs over its roots
    Then the guard exits non-zero
    And it reports that subagent definition's file, line, and term as a metaphor-leak violation

  Scenario: a persona name in the plugin's project spec fails the guard
    Given a spec document in the plugin's project spec tree, outside its ledger, carries a capitalized cyberfleet persona name in its prose
    And that occurrence is not on the sanctioned allow-list
    When check:metaphor-free runs over its roots
    Then the guard exits non-zero
    And it reports that spec document's file, line, and term as a metaphor-leak violation

  Scenario: a lowercase generic word passes the guard
    Given a tracked source file uses a lowercase common word that shares its letters with a banned term but is not the persona name
    When check:metaphor-free runs over the package
    Then the guard exits zero
    And it reports no violation for that word

  Scenario: a word that merely contains a banned term passes the guard
    Given a tracked file uses a longer word that contains a banned term only as a substring, not as a whole word or a compound segment
    When check:metaphor-free runs over the package
    Then the guard exits zero
    And it reports no violation for that word

  Scenario: a sanctioned boundary reference passes the guard
    Given a tracked document names a cyberfleet persona to hand it to the plugin layer, and that occurrence is listed on the guard's sanctioned allow-list
    When check:metaphor-free runs over the package
    Then the guard exits zero
    And it reports no violation for that occurrence

  Scenario: a banned term recorded in provenance passes the guard
    Given a ledger entry under the package quotes a banned persona name while recording a past leak
    When check:metaphor-free runs over the package
    Then the guard exits zero
    And it reports no violation for that ledger entry

  Scenario: a banned term recorded in the plugin spec's provenance passes the guard
    Given a ledger entry in the plugin's project spec tree quotes a banned persona name while recording a past decision
    When check:metaphor-free runs over its roots
    Then the guard exits zero
    And it reports no violation for that ledger entry

  Scenario: a banned term recorded in another project spec's provenance passes the guard
    Given a second project spec sits beside the plugin's project spec in the plural project-spec tree
    And a ledger entry in the ledger directly under that second project's folder quotes a banned persona name while recording a past decision
    When check:metaphor-free runs over its roots
    Then the guard exits zero
    And it reports no violation for that ledger entry

  Scenario: a persona name under a nested ledger-named folder fails the guard
    Given a spec document in a folder named ledger that sits inside a node of a project spec, below the project folder rather than directly under it, carries a capitalized cyberfleet persona name in its prose
    And that occurrence is not on the sanctioned allow-list
    When check:metaphor-free runs over its roots
    Then the guard exits non-zero
    And it reports that spec document's file, line, and term as a metaphor-leak violation

  Scenario: the guard's own defining document passes the guard
    Given the metaphor-free node's own README names the banned persona terms in order to define the guard
    When check:metaphor-free runs over the package
    Then the guard exits zero
    And it reports no violation for that document

  Scenario: a clean multi-file package passes the guard
    Given several in-scope files under the package, where every capitalized persona-form occurrence among them is listed on the sanctioned allow-list
    When check:metaphor-free runs over the package
    Then the guard exits zero
    And it reports no violations
