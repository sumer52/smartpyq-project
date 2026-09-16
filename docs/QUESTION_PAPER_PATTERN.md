# SmartPYQ — Question Paper Pattern

All subjects follow the standard university question-paper pattern:

## Standard pattern

```
PART A — Answer ALL questions. 8 × 4  = 32 marks   (short answers)
PART B — Answer ALL questions. 4 × 12 = 48 marks   (long answers)
                                TOTAL = 80 marks
```

> **Note on marks:** individual questions may legitimately carry **4, 8 or 12 marks**
> depending on the subject and year. The pattern defines the *structure* (two parts,
> short + long answers, 80-mark total); Part A questions are typically 4 marks
> (sometimes 8), Part B typically 12. The analysis engine reads whatever scheme
> each paper declares in its part headers.

## How the platform handles it

| Surface | Behavior |
| --- | --- |
| **Document analyzer** (`app/services/document_analyzer.py`) | Parses part headers like `PART A — 8 x 4 = 32 marks` via `detect_part_scheme()`. Assigns `Part A` / `Part B` sections from header positions, infers per-question marks from the declared scheme when the question text omits them (explicit marks always win), and derives total marks from part totals (e.g. 32 + 48 = 80). Detected pattern is surfaced as `metadata.part_pattern` (e.g. `Part A 8x4=32, Part B 4x12=48`). |
| **Upload wizard** (`UploadStepper.jsx`) | "Apply standard pattern (8×4 + 4×12)" button fills missing sections/marks by position — questions 1–8 default to Part A / 4 marks, 9–12 to Part B / 12 marks. Never overwrites explicit values, so papers with 8- or 12-mark Part A questions keep their real marks. |
| **Demo papers** (`app/scripts/seed_demo_papers.py`) | Seeded with the exact pattern: 12 questions per paper (8 + 4), 80 max marks, part headers rendered in the generated PDFs. |
| **Landing page** | The hero artifact mirrors the real pattern (PART A 8×4=32 / PART B 4×12=48, Max marks: 80). |

## Adding a new subject

Nothing subject-specific is required — the pattern applies to all subjects.
Demo seed data currently covers Computer Science (B.Sc MSCS, Semester V) across
2023–2025; run the seed scripts in the README to reproduce it.
