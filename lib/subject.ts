/**
 * Courses carry no department column, so the subject a course belongs to has to
 * come from its code: CS-101 and CS-229 are both Computer Science, EE-224 is
 * Electrical Engineering. Grouping on the leading letters is what lets the
 * institution screen show courses by subject rather than as one flat list.
 *
 * Some catalogues use purely numeric codes (MIT's 18-06, 5-111). Those have no
 * subject to read, so they collect under UNCODED rather than being dropped.
 */

export const UNCODED = 'UNCODED';

/**
 * Long names for the prefixes this catalogue actually uses, plus the common
 * variants. An unknown prefix is shown as-is rather than guessed at.
 */
const SUBJECT_NAMES: Record<string, string> = {
  ACC: 'Accounting',
  AERO: 'Aerospace Engineering',
  ARCH: 'Architecture',
  BBA: 'Business Administration',
  BIO: 'Biology',
  BUS: 'Business',
  CE: 'Civil Engineering',
  CH: 'Chemistry',
  CHE: 'Chemical Engineering',
  CS: 'Computer Science',
  CSE: 'Computer Science & Engineering',
  ECON: 'Economics',
  EE: 'Electrical Engineering',
  EEE: 'Electrical & Electronic Engineering',
  ENG: 'Engineering',
  FIN: 'Finance',
  HIST: 'History',
  INFK: 'Computer Science',
  LAW: 'Law',
  MATH: 'Mathematics',
  ME: 'Mechanical Engineering',
  MGT: 'Management',
  MKT: 'Marketing',
  PHYS: 'Physics',
  PSY: 'Psychology',
  STAT: 'Statistics',
  [UNCODED]: 'Uncoded courses',
};

/** The subject key for a course code, e.g. "cs-101" -> "CS". */
export function subjectCode(courseCode: string | null | undefined): string {
  if (!courseCode) return UNCODED;
  const leadingLetters = courseCode.trim().toUpperCase().match(/^[A-Z]+/);
  return leadingLetters ? leadingLetters[0] : UNCODED;
}

/** Display label for a subject key; unknown prefixes are shown unchanged. */
export function subjectName(code: string): string {
  return SUBJECT_NAMES[code] ?? code;
}

export type SubjectGroup<T> = {
  code: string;
  name: string;
  items: T[];
};

/**
 * Groups items by the subject of their course code, sorted by subject name with
 * UNCODED last so real subjects lead.
 */
export function groupBySubject<T>(
  items: T[],
  getCode: (item: T) => string | null | undefined,
): Array<SubjectGroup<T>> {
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const code = subjectCode(getCode(item));
    const bucket = buckets.get(code);
    if (bucket) bucket.push(item);
    else buckets.set(code, [item]);
  }

  return Array.from(buckets.entries())
    .map(([code, groupItems]) => ({ code, name: subjectName(code), items: groupItems }))
    .sort((a, b) => {
      if (a.code === UNCODED) return 1;
      if (b.code === UNCODED) return -1;
      return a.name.localeCompare(b.name);
    });
}
