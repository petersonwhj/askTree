interface Props {
  src: string;
  alt?: string;
  onClose: () => void;
}

/** Full-screen preview of an attached image, closed by the ✕ or the backdrop. */
export function ImageLightbox({ src, alt = "attached", onClose }: Props) {
  return (
    <div
      className="image-lightbox-overlay"
      role="dialog"
      aria-label="Image preview"
      onClick={onClose}
    >
      <button
        type="button"
        className="image-lightbox-close"
        aria-label="Close preview"
        title="Close"
        onClick={onClose}
      >
        ✕
      </button>
      <img src={src} alt={alt} onClick={(e) => e.stopPropagation()} />
    </div>
  );
}
