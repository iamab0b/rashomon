import { useEffect, useRef, useState } from "react";
import { browserVoiceDeps } from "./browser";
import { VoiceSession } from "./session";
import { IDLE, isActive, type VoiceState } from "./state";

export function useVoiceInterview() {
  const [state, setState] = useState<VoiceState>(IDLE);
  const session = useRef<VoiceSession | null>(null);
  useEffect(() => () => session.current?.stop(), []);
  const toggle = () => {
    const current = session.current ?? (session.current = new VoiceSession(browserVoiceDeps(), setState));
    if (isActive(current.current.status)) current.stop();
    else void current.start();
  };
  return { status: state.status, error: state.error, active: isActive(state.status), toggle };
}
