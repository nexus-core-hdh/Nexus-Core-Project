import {
  BookOpen,
  Calculator,
  Droplets,
  FileText,
  Images,
  Info,
  Layers,
  type LucideIcon,
  Paperclip,
  Ruler,
  ShoppingCart,
  SlidersHorizontal,
  Tags,
} from "lucide-react";

// Tab icons shared by the Style Card and Sample Card detail screens, which show the same tab set.
export const CARD_TAB_ICONS: Record<string, LucideIcon> = {
  General: Info,
  Explanation: FileText,
  Attributes: Tags,
  "Measurement Chart": Ruler,
  Study: BookOpen,
  BOM: Layers,
  "Wash & Care": Droplets,
  "Order Info": ShoppingCart,
  Cost: Calculator,
  Attachments: Paperclip,
  "Picture Gallery": Images,
  "Customized Fields": SlidersHorizontal,
};
