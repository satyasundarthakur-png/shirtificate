<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Batch certificates run in the browser using a snapshot of the current template and explicit CSV-to-field mappings; this keeps recipient data private and avoids altering the original editor state.
- Parse recipient CSVs with Papa Parse and prepare ZIPs before offering a download; quoted data stays intact and downloads retain browser user activation.
