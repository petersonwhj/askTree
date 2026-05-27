interface Props { text: string; top: number; left: number; onAsk: () => void; }

export function FloatingAskButton({ text, top, left, onAsk }: Props) {
  const displayText = text.length > 25 ? text.slice(0, 25) + "..." : text;

  return (
    <div
      className="floating-ask"
      style={{ top: `${top}px`, left: `${left}px` }}
      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onAsk(); }}
    >
      🔍 Ask about "{displayText}"
    </div>
  );
}
