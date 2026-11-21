import {
  Briefcase,
  Brush,
  Calculator,
  ClipboardList,
  Code,
  GraduationCap,
  HandHeart,
  HardHat,
  Headset,
  Landmark,
  Megaphone,
  Package,
  Palette,
  Pill,
  Plane,
  Scale,
  Shapes,
  ShieldCheck,
  Sprout,
  Stethoscope,
  Truck,
  Users,
  UtensilsCrossed,
  Wrench,
  type LucideIcon,
} from "lucide-react";

/**
 * Icons for job categories (taxonomy function ids). The UI uses these, never
 * the taxonomy's emoji field: no emoji in the app's interface (see CLAUDE.md).
 */
const ICONS: Record<string, LucideIcon> = {
  accounting_finance: Calculator,
  banking_insurance: Landmark,
  sales_marketing: Megaphone,
  software_it: Code,
  engineering: HardHat,
  technicians_trades: Wrench,
  health: Stethoscope,
  pharmacy: Pill,
  admin_secretarial: ClipboardList,
  human_resources: Users,
  procurement_supply: Package,
  logistics_driving: Truck,
  aviation: Plane,
  education: GraduationCap,
  ngo_development: HandHeart,
  management: Briefcase,
  customer_service: Headset,
  hospitality: UtensilsCrossed,
  legal: Scale,
  agriculture: Sprout,
  media_creative: Palette,
  security: ShieldCheck,
  general_labor: Brush,
  other: Shapes,
};

export function CategoryIcon({ id, className }: { id: string; className?: string }) {
  const Icon = ICONS[id] ?? Shapes;
  return <Icon className={className} aria-hidden />;
}
