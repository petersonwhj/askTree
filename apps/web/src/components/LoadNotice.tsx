interface Props {
  message: string;
  onClose: () => void;
}

/** Shared notice for a document that could not be opened (web file opens and extension clips). */
export function LoadNotice({ message, onClose }: Props) {
  return (
    <div className="settings-modal-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()} style={{ width: 420 }}>
        <h2 style={{ marginBottom: 12 }}>Could not open this document</h2>
        <p style={{ fontSize: 13, color: "#8b949e", marginBottom: 20, lineHeight: 1.6 }}>{message}</p>
        <div className="btn-row">
          <button onClick={onClose}>OK</button>
        </div>
      </div>
    </div>
  );
}
