import { toast as sonner } from "sonner";

export type ToastKind = "success" | "error" | "info";

export function toast(message: string, kind: ToastKind = "info") {
  switch (kind) {
    case "success":
      sonner.success(message);
      break;
    case "error":
      sonner.error(message);
      break;
    default:
      sonner.info(message);
  }
}
