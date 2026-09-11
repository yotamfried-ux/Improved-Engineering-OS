# Collapse runs of spaces

## Goal

`collapseSpaces` is a stub. It should collapse runs of two or more spaces to a
single space, leaving single spaces alone.

## Approach

One regular expression over the whole string.

## DoD

- [x] `collapseSpaces` collapses runs of two or more spaces to one
- [x] single spaces are unchanged
- [x] a test covers both cases
- [x] the existing tests still pass
- [ ] CI is green on the pull request
- [ ] the pull request is approved and merged
