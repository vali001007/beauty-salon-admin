import { useEffect, useRef } from "react";
import { toast } from "sonner";

function NetworkStatus() {
  const wasOffline = useRef(false);

  useEffect(() => {
    function handleOffline() {
      wasOffline.current = true;
      toast.warning("网络连接已断开，部分功能可能不可用", {
        id: "network-status",
        duration: Infinity,
      });
    }

    function handleOnline() {
      if (wasOffline.current) {
        wasOffline.current = false;
        toast.dismiss("network-status");
        toast.success("网络已恢复", { duration: 3000 });
      }
    }

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    // Check initial state
    if (!navigator.onLine) {
      handleOffline();
    }

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  return null;
}

export { NetworkStatus };
