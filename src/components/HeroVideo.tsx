/**
 * فيديو الواجهة: مزارعٌ في حقل ذرةٍ على النيل (أرسله المالك، 25 سبتمبر).
 *
 * Eight seconds, looped, muted, playing inline — the only way a browser lets
 * a video start by itself, and the clip has no sound worth hearing anyway. It
 * was re-encoded from the 5 MB original to 960 px at about 0.9 MB with the
 * audio dropped and the index moved to the front (`faststart`), so it begins
 * before it has finished downloading on a slow connection.
 *
 * The poster frame shows until the first frame plays. A reader who has asked
 * their device for less motion gets the still alone: a loop that never stops
 * is exactly what that setting exists to prevent.
 */
export default function HeroVideo() {
  return (
    <figure className="relative overflow-hidden rounded-2xl shadow-raised">
      <video
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        poster="/video/sudan-farmer.jpg"
        className="aspect-video w-full object-cover motion-reduce:hidden"
        aria-label="مزارعٌ سودانيّ بعمامته وجلابيته في حقل ذرةٍ ناضجة، والنيل خلفه"
      >
        <source src="/video/sudan-farmer.mp4" type="video/mp4" />
      </video>
      {/* eslint-disable-next-line @next/next/no-img-element -- the poster of the video, shown in its place */}
      <img
        src="/video/sudan-farmer.jpg"
        alt="مزارعٌ سودانيّ بعمامته وجلابيته في حقل ذرةٍ ناضجة، والنيل خلفه"
        className="hidden aspect-video w-full object-cover motion-reduce:block"
      />
      <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 pb-3 pt-10 text-sm font-medium text-white">
        من حقول السودان — ذرةٌ ناضجة على ضفّة النيل
      </figcaption>
    </figure>
  );
}
