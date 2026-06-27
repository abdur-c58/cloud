import type { ItemScope } from "./dnd";

export type ClipboardItem = {
  key: string;
  name: string;
  type: string;
  scope: ItemScope;
  shareId?: string;
};
