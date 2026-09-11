# Collapse runs of spaces

## Goal

`collapseSpaces` is a stub. It should collapse runs of two or more spaces to a
single space, leaving single spaces alone.

## Approach

One regular expression over the whole string. No line splitting: the requirement is
about runs of spaces, not about lines.

## DoD

- [x] `collapseSpaces` collapses runs of two or more spaces to one
- [x] single spaces are unchanged
- [x] a test covers both cases
- [x] the existing tests still pass

## Live External Gates Before Merge

The items here are deliberately **not** checklist items. Each is decided after the
commit that should cause it, so ticking one before it has happened would be a claim
rather than a record — and the policy that blocks a commit while any DoD item is
unchecked would make such an item unsatisfiable. They are verified against the pull
request itself, not by marking this file.

- CI is green on the pull request's head commit
- the pull request has been reviewed and approved
