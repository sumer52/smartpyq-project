import { FlaskConical, Banknote, Code2, Briefcase, GraduationCap } from 'lucide-react';

/**
 * Best-fit icon per course stream, kept in one place so the PYQ wizard and the
 * home "Browse by Course" grid always show the same symbol.
 *   B.Sc  -> lab flask (science)
 *   B.Com -> banknote (commerce)
 *   BCA   -> code brackets (computer applications)
 *   BBA   -> briefcase (business administration)
 */
export const STREAM_ICONS = {
  bsc: FlaskConical,
  bcom: Banknote,
  bca: Code2,
  bba: Briefcase,
};

export const getStreamIcon = (key) => STREAM_ICONS[key] || GraduationCap;
