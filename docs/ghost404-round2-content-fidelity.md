# Round 2 content fidelity (Injects 1, 3 and 4)

Commit `294bba4`. Source: the owner's case document "OPERATION GHOST_404 - Round 2 Part A: Injects 1, 3 and 4" (15 pages, kept outside the repository: it contains the answer keys). Inject 2 (Kill Switch) is separate and unchanged.

## What was wrong
The participant text had been paraphrased throughout (options, claims, CEO calls, statements, chat, mail, records, status panel). Paraphrase also created a length cue: the correct Inject 1 option was 129 characters against 76-89 for the others.

## Method
Text was extracted from the PDF (`pdftotext`, raw and table modes) and compared with the application content character by character after removing only whitespace and unifying quote glyphs. The PDF uses typographic quotes (`'` `"` `"`), which the content now keeps. The checker was proven not to be vacuous: it fails on the old paraphrases. Result: **27 of 27 checks exact** on 2026-11-24.

| Inject | Content | PDF match | Notes |
|---|---|---|---|
| 1 | Response options A-E | Exact | specific IP kept in C; D not shortened |
| 1 | Evidence tables (13 processes, 5 logins, 8 network rows, mail) | Exact | mail is the document's 4-column table |
| 1 | Chat transcript | Exact | speakers Ravi / Responder / IT Desk |
| 1 | Alert, paper instructions | Exact | |
| 3 | Claims 1-8 | Exact | |
| 3 | Confidence badges | Exact | claim + badge adjacency verified |
| 3 | Records R-1 to R-12 | Exact | stored as the document's own sentences; R-9 stays "(all times UTC)" |
| 3 | Night timeline (10 entries) | Exact | "all times IST" heading kept |
| 4 | Calls 1-3 (CEO line + 4 options each) | Exact | |
| 4 | Six public statements | Exact | order kept, no classification shown |
| 4 | Status panel | Exact | the five original facts |

## UI additions removed because the document does not contain them
The "UTC + 5:30" conversion hint, per-record IST/UTC badges, "scores are not evidence" commentary, "compare the records with what Ravi says", and the paper-instruction item that named the record with the planted line. R-6's planted header line is shown as evidence text only.

## Answer-length balance
Spread of option lengths (max-min as % of mean): Inject 1 14%, Call 1 10%, Call 2 11%, Call 3 17%. No set is dominated by one option. The tests guard that spread stays under 20%. Whether length correlates with the key is analysed privately (not recorded here). No wording was changed to equalise length; any such change needs the owner's approval of a revised source document.

## Pinned by tests
`tests/fixtures/round2-pdf-canon.json` (participant-visible text only, no key) and `tests/round2-fidelity.test.ts` (9). Update them only from a newer approved document.

## Not independently compared
Layout, headings and the "Idea"/organizer notes of the PDF (organizer-only, not displayed). Inject 2 text was not re-compared in this pass.
