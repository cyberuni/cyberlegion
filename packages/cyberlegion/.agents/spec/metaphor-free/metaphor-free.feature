@frozen
Feature: metaphor-free — the vocabulary-boundary guard
  cyberlegion (the package) is chartered metaphor-free: no fleet-persona or place vocabulary. The guard
  fails when a banned persona name appears, in its capitalized proper-noun form and unsanctioned, in an
  in-scope file under the package — so the boundary is enforced by a script rather than a judge's manual
  grep. Matching is case-sensitive on the capitalized form (a whole word or a capitalized compound
  segment), so it catches a persona name hidden in an identifier without colliding with lowercase
  generic English. Scope covers the package src and the spec doc tree, with two whole-file exclusions:
  the ledger (provenance, which records past leaks verbatim) and the guard's own definition files (the
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
