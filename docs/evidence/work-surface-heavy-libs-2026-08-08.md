# Work Surface heavy libraries (ticket 05 spike)

| Family | Library / approach | Version (package) | Notes |
| --- | --- | --- | --- |
| image | Browser `Blob` + `<img>` | n/a | SVG via img (no script). Size cap 15MB. |
| pdf | Blob URL + sandboxed iframe | n/a | No pdfjs in critical path; lazy by object URL only. |
| docx | **mammoth** (dynamic `import()`) | workspace lock | `.doc` → unsupported. Read-only HTML. |
| xlsx | **xlsx** (SheetJS community, dynamic `import()`) | workspace lock | Read-only `sheet_to_json`; row/col caps; **no write API** in Surface. |

Dynamic entry: `surfaces/document/renderers/heavy-lazy.ts` — Task-only bundles must not static-import mammoth/xlsx.
