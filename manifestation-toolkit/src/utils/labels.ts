import { colors } from '../theme';
import type { ReportType, Role } from '../types';

export const ROLES: { id: Role; label: string; icon: string }[] = [
  { id: 'user', label: 'Manifestant·e', icon: '✊' },
  { id: 'medic', label: 'Street medic', icon: '⛑️' },
  { id: 'supply', label: 'Ravitaillement', icon: '💧' },
  { id: 'protection', label: 'Protection', icon: '🛡️' },
];

export const roleLabel = (r: Role) => ROLES.find((x) => x.id === r)?.label ?? r;
export const roleIcon = (r: Role) => ROLES.find((x) => x.id === r)?.icon ?? '';

export const REPORT_TYPES: {
  id: ReportType;
  label: string;
  icon: string;
  color: string;
}[] = [
  { id: 'danger', label: 'Danger', icon: '⚠️', color: colors.danger },
  { id: 'kettle', label: 'Nasse', icon: '⭕', color: colors.warning },
  { id: 'medic', label: 'Soins', icon: '⛑️', color: colors.success },
  { id: 'supply', label: 'Ravitaillement', icon: '💧', color: colors.info },
];

export const reportMeta = (t: ReportType) =>
  REPORT_TYPES.find((x) => x.id === t) ?? REPORT_TYPES[0];

/** Messages pré-écrits : un seul tap, zéro saisie sous stress. */
export const QUICK_MESSAGES = [
  'Besoin de soins ici',
  'Nasse en cours',
  'Gaz lacrymo',
  'Eau / ravito dispo',
  'Sortie possible par ici',
  'RAS, tout va bien',
];

export function timeAgo(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return "à l'instant";
  const m = Math.round(s / 60);
  if (m < 60) return `il y a ${m} min`;
  return `il y a ${Math.round(m / 60)} h`;
}
