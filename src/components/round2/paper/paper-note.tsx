/** "On your answer sheet" reminder shared by every inject. */
export function PaperNote({ items, title = "On your answer sheet" }: { items: string[]; title?: string }) {
  return <aside className="ij-paper" aria-label={title}><b><span aria-hidden="true">✎</span> {title}</b><ol>{items.map(x => <li key={x}>{x}</li>)}</ol></aside>;
}
