import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Sandbox } from "@/components/sandbox/Sandbox";
import { useSandbox } from "@/map/store";
import "@/styles.css";

function Home() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    void Promise.resolve(useSandbox.persist.rehydrate()).then(() => {
      if (live) setReady(true);
    });
    return () => {
      live = false;
    };
  }, []);
  return ready ? (
    <Sandbox />
  ) : (
    <main className="boot">
      <p className="brand">
        <strong>Project Tulip</strong>
        <span>战术沙盘</span>
      </p>
      <p>正在展开干净底图</p>
    </main>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("缺少根节点");
createRoot(root).render(<Home />);
