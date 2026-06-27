import type { ComponentType } from "react";
import type { LucideProps } from "lucide-react";
import {
  AudioLines,
  Check,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Download,
  File,
  Folder,
  FolderInput,
  Home,
  Image,
  LayoutGrid,
  List,
  Lock,
  LockOpen,
  LogOut,
  Menu,
  Moon,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Star,
  Sun,
  Tag,
  Trash2,
  Upload,
  User,
  Video,
  X,
} from "lucide-react";

type IconProps = LucideProps & { size?: number };

function wrap(Icon: ComponentType<LucideProps>) {
  return function Wrapped({ size = 20, strokeWidth = 1.8, ...props }: IconProps) {
    return <Icon size={size} strokeWidth={strokeWidth} aria-hidden {...props} />;
  };
}

export const Icon = {
  Folder: wrap(Folder),
  Image: wrap(Image),
  Video: wrap(Video),
  Audio: wrap(AudioLines),
  File: wrap(File),
  Lock: wrap(Lock),
  Unlock: wrap(LockOpen),
  Search: wrap(Search),
  Upload: wrap(Upload),
  Plus: wrap(Plus),
  Grid: wrap(LayoutGrid),
  List: wrap(List),
  Sun: wrap(Sun),
  Moon: wrap(Moon),
  Star: wrap(Star),
  StarFill: ({ size = 20, className, ...props }: IconProps) => (
    <Star size={size} fill="currentColor" strokeWidth={0} className={className} aria-hidden {...props} />
  ),
  Trash: wrap(Trash2),
  Download: wrap(Download),
  Move: wrap(FolderInput),
  ChevronRight: wrap(ChevronRight),
  ChevronLeft: wrap(ChevronLeft),
  X: wrap(X),
  Sparkles: wrap(Sparkles),
  Send: wrap(Send),
  Logout: wrap(LogOut),
  Dots: wrap(MoreHorizontal),
  Play: ({ size = 20, className, ...props }: IconProps) => (
    <Play size={size} fill="currentColor" strokeWidth={0} className={className} aria-hidden {...props} />
  ),
  Refresh: wrap(RefreshCw),
  Check: wrap(Check),
  Home: wrap(Home),
  Cloud: wrap(Cloud),
  User: wrap(User),
  Edit: wrap(Pencil),
  Tag: wrap(Tag),
  Menu: wrap(Menu),
};
