/**
 * The one-line result of the last action (?ok= / ?error=), where the person is
 * looking after a form redirected back. Three section frames and a handful of
 * pages each wrote these two paragraphs out by hand; this is the one copy.
 */
export default function ActionNotice({ ok, error }: { ok?: string; error?: string }) {
  return (
    <>
      {ok && (
        <p
          role="status"
          className="mb-6 flex items-start gap-2 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm"
        >
          <span aria-hidden className="font-black text-primary">✓</span>
          <span>{ok}</span>
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="mb-6 flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm"
        >
          <span aria-hidden className="font-black text-danger">!</span>
          <span>{error}</span>
        </p>
      )}
    </>
  );
}
