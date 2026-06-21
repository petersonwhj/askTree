interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({ title, message, confirmLabel = "Confirm", onConfirm, onCancel }: Props) {
  return (
    <div className="settings-modal-overlay" onClick={onCancel}>
      <div
        className="settings-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 400 }}
      >
        <h2 style={{ marginBottom: 12 }}>{title}</h2>
        <p style={{ fontSize: 13, color: "#8b949e", marginBottom: 20, lineHeight: 1.6 }}>{message}</p>
        <div className="btn-row">
          <button onClick={onCancel}>Cancel</button>
          <button
            onClick={onConfirm}
            style={{ background: "#da3633", borderColor: "#da3633", color: "#fff" }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
