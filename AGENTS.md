<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- Content below this line is maintained by hand and is outside the generated block above. -->

# اقرأ لوح التنسيق قبل أن تبدأ

قبل أي عمل على هذا المستودع، اقرأ **[`docs/coordination.md`](docs/coordination.md)**
وسجّل فيه ما ستعمل عليه.

المشروع يتحرك بسرعة، وأكثر من طرف يعمل عليه. مراجعة أمنية كاملة ضاعت في 19 أغسطس 2026
لأنها بُنيت على نسخة عمرها أسبوع، وكانت كل الثغرات التي عالجتها قد عولجت بالفعل.

**تحقق من تأخّر فرعك قبل أن تكتب سطراً:**

```bash
git fetch origin main && git rev-list --count HEAD..origin/main
# 0 = محدَّث · رقم كبير = توقّف وأعد بناء فرعك على main أولاً
```
