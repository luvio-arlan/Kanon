"use client";

import { useCallback, useEffect, useState } from "react";
import { apiLoadInbox } from "./inbox-ledger-api";

/** Unread research-inbox count with an explicit refresh after the inbox sheet closes. */
export function useInboxUnread() {
  const [unreadCount, setUnreadCount] = useState(0);
  const refreshUnread = useCallback(() => {
    void apiLoadInbox().then((d) => setUnreadCount(d.items.filter((i) => !i.readAt).length));
  }, []);
  useEffect(() => {
    refreshUnread();
  }, [refreshUnread]);
  return { unreadCount, refreshUnread };
}
