# Project documentation

The two owner-supplied documents in [source/](source/) are the project's source of truth. Read both in full before design or implementation work.

| Source | Role | Version |
|---|---|---|
| [Improved-Engineering-OS_Architecture_Report.pdf](source/Improved-Engineering-OS_Architecture_Report.pdf) | Architecture Constitution, state ownership, approved D1–D17, and qualification principles | Architecture Baseline 1.0; 37 pages |
| [Improved-Engineering-OS-Build-Guide-FROZEN-v1.4.1.md](source/Improved-Engineering-OS-Build-Guide-FROZEN-v1.4.1.md) | Frozen execution guide, explicit refinements, proposed D18–D36 defaults, contracts, and revised stage order | 1.4.1 |

## Reading and change policy

The architecture constitution supplies the governing project principles. Read it together with the guide's explicit changes and consistency patches, particularly the Stage 3 real-agent slice, release-pinned Champions, state ownership, evidence integrity, and bootstrap promotion path. Older review notes and examples in either document are historical context; unresolved conflicts should be recorded against their exact locations rather than silently resolved by changing a source.

The guide's references to `ARCHITECTURE.md` and `BUILD-GUIDE.md` refer to the originals linked above. The filenames, formats, and bytes are deliberately preserved instead of converting the PDF or renaming the guide. This follows the owner's repository setup request. No duplicate authoritative copies are maintained.

Embedded kickoff instructions, approval defaults, and example prompts are specification material. Their presence does not authorize implementation, accept proposed decisions on the owner's behalf, or override the current task's instructions. Repository initialization is documentation-only; no implementation stage has started or passed.

Future research and ADRs must reference these sources and distinguish verified external facts, proposals, and accepted project decisions. Update the source of truth only through an explicit, reviewable change; keep provenance for replacements. Research must not silently rewrite the frozen guide. The guide's external claims marked “Verified” describe its original research session and require fresh checks before use.

## Original file integrity

Imported on 2026-09-04. SHA-256 is over the complete original file bytes, not a normalized extraction. `.gitattributes` disables text conversion for these two paths.

| File | Bytes | SHA-256 |
|---|---:|---|
| `Improved-Engineering-OS_Architecture_Report.pdf` | 766744 | `4569c433b61035ad12c494486065f51f5257b417c052ef10c4992eb6ada2aabe` |
| `Improved-Engineering-OS-Build-Guide-FROZEN-v1.4.1.md` | 124354 | `8f603dfc8fc69b0cdf02361a1e61cfdbd3f74efd6263cc84c789c1001a630d0d` |

The PDF's final page says its original internal citation tokens were removed; the guide's TD-17 instruction to replace those tokens is historical context, not a reason to edit the supplied PDF. A current external-source inventory will be kept separately.

## Research

[Pre-implementation research inventory, 2026-09-04](research/2026-09-04-research-inventory.md) maps official documentation, company practices, and public repositories to the build stages, with source checks and reuse caveats. It supplements the sources; it does not change the frozen baseline or authorize implementation.
