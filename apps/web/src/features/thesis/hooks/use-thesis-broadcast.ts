"use client";

import type { ThesisDetail, ThesisRevision } from "@kanon/core";
import { useEffect, useRef } from "react";

const SYNC_CHANNEL_NAME = "kanon-thesis-sync";
const TAB_SYNC_ID =
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `tab-${Math.random().toString(36).slice(2)}`;

export function broadcastThesisSync(thesis: ThesisDetail, revisions?: ThesisRevision[]) {
  if (typeof BroadcastChannel === "undefined") return;
  try {
    const ch = new BroadcastChannel(SYNC_CHANNEL_NAME);
    ch.postMessage({ senderId: TAB_SYNC_ID, thesis, revisions });
    ch.close();
  } catch (err) {
    void err;
  }
}

function shouldAdoptBroadcast(
  data: { senderId?: string; thesis?: ThesisDetail } | null | undefined,
  thesisId: string,
  currentUpdatedAt: string,
): data is { thesis: ThesisDetail; revisions?: ThesisRevision[] } {
  if (!data?.thesis || data.senderId === TAB_SYNC_ID) return false;
  return data.thesis.id === thesisId && data.thesis.updatedAt !== currentUpdatedAt;
}

export function useThesisBroadcastSync(
  thesisId: string,
  updatedAt: string,
  setThesis: React.Dispatch<React.SetStateAction<ThesisDetail>>,
  setRevisions: React.Dispatch<React.SetStateAction<ThesisRevision[]>>,
) {
  const updatedAtRef = useRef(updatedAt);
  updatedAtRef.current = updatedAt;

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(SYNC_CHANNEL_NAME);
    ch.onmessage = (
      evt: MessageEvent<{ senderId?: string; thesis?: ThesisDetail; revisions?: ThesisRevision[] }>,
    ) => {
      if (!shouldAdoptBroadcast(evt.data, thesisId, updatedAtRef.current)) return;
      updatedAtRef.current = evt.data.thesis.updatedAt;
      setThesis(evt.data.thesis);
      if (evt.data.revisions) setRevisions(evt.data.revisions);
    };
    return () => ch.close();
  }, [thesisId, setThesis, setRevisions]);
}
