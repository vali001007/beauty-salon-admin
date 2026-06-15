import React, { ReactNode, useEffect, useRef } from "react";
import type { Message } from "../types";

export function BusinessMessageCard({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="mx-auto mb-6 w-full max-w-[900px] rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
      {children}
    </div>
  );
}

export function MessagePanel({
  messages,
  children,
}: {
  messages: Message[];
  children?: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lastMessage = messages[messages.length - 1];

  useEffect(() => {
    const container = containerRef.current;
    const content = container?.firstElementChild;
    const messageList = content?.lastElementChild as HTMLElement | null;
    const latestMessage = messageList?.lastElementChild as HTMLElement | null;
    if (!container || !content || !messageList || !latestMessage) return;

    container.scrollTop = Math.max(0, latestMessage.offsetTop - (content as HTMLElement).offsetTop - 8);
  }, [messages.length, lastMessage?.id, lastMessage?.title, lastMessage?.type]);

  return (
    <main
      ref={containerRef}
      className="flex-1 overflow-y-auto bg-[#F7F5F2] px-4 pb-32 pt-6 sm:px-6"
      style={{ scrollBehavior: "smooth" }}
    >
      <div className="mx-auto flex w-full max-w-[900px] flex-col gap-4">{children}</div>
    </main>
  );
}
