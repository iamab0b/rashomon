import { useEffect, useRef } from "react";
import { Icon } from "./Icon";
import { NotConnected } from "./shared";
import { sourceLabel, speakerLabel, type Utterance } from "./transcript";

export function TranscriptDrawer({
  transcript,
  activeId,
  onClose,
}: {
  transcript: readonly Utterance[] | null;
  activeId: string;
  onClose: () => void;
}) {
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-utterance="${CSS.escape(activeId)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  return (
    <section className="transcript-drawer" aria-label="Transcript">
      <header>
        <span className="eyebrow">Transcript</span>
        <button type="button" className="close" onClick={onClose} aria-label="Close transcript">
          <Icon name="x" size={16} />
        </button>
      </header>
      {transcript ? (
        <ol ref={listRef}>
          {transcript.map((utterance) => (
            <li
              key={utterance.id}
              data-utterance={utterance.id}
              className={utterance.id === activeId ? "active" : undefined}
              aria-current={utterance.id === activeId || undefined}
            >
              <span className="utterance-speaker">
                {speakerLabel(utterance.speaker)} · {sourceLabel(utterance.id)}
              </span>
              <q>{utterance.text}</q>
              <small className="mono">{utterance.id}</small>
            </li>
          ))}
        </ol>
      ) : (
        <NotConnected>
          The live transcript for <code>{activeId}</code> isn't connected yet. Switch to Fixture to read the demo
          statements.
        </NotConnected>
      )}
    </section>
  );
}
