import { chapters } from "@/data/chapters";

export function ChapterNavigation() {
  return (
    <nav aria-label="Investigation chapters" className="chapter-list">
      {chapters.map((chapter) => (
        <div className="chapter-row" key={chapter.id} aria-disabled="true">
          <span className="chapter-number">{chapter.number}</span>
          <span className="chapter-name"><strong>{chapter.title}</strong><small>{chapter.focus}</small></span>
          <span className="chapter-lock" aria-label="Coming in Phase 1">LOCKED</span>
        </div>
      ))}
    </nav>
  );
}
