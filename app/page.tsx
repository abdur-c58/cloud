import { Suspense } from "react";
import { CloudApp } from "@/components/CloudApp";

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center">
          <span className="spinner h-8 w-8" />
        </div>
      }
    >
      <CloudApp />
    </Suspense>
  );
}
