import assert from 'node:assert/strict';
import test from 'node:test';
import { UNCODED, groupBySubject, subjectCode, subjectName } from '../lib/subject';

test('the subject is the leading letters of the course code', () => {
  assert.equal(subjectCode('CS-101'), 'CS');
  assert.equal(subjectCode('CSE-4101'), 'CSE');
  assert.equal(subjectCode('EEE-201'), 'EEE');
  assert.equal(subjectCode('ARCH-121'), 'ARCH');
  assert.equal(subjectCode('  arch-121  '), 'ARCH', 'case and padding are tolerated');
});

test('codes with no letters group under UNCODED rather than vanishing', () => {
  // MIT-style catalogues use bare numbers; they still have to appear somewhere.
  assert.equal(subjectCode('18-06'), UNCODED);
  assert.equal(subjectCode('5-111'), UNCODED);
  assert.equal(subjectCode(''), UNCODED);
  assert.equal(subjectCode(null), UNCODED);
  assert.equal(subjectCode(undefined), UNCODED);
});

test('known prefixes get long names and unknown ones are shown unchanged', () => {
  assert.equal(subjectName('CSE'), 'Computer Science & Engineering');
  assert.equal(subjectName('EEE'), 'Electrical & Electronic Engineering');
  assert.equal(subjectName('ZZZ'), 'ZZZ', 'never invent a name for an unknown prefix');
});

test('grouping buckets every course and keeps uncoded last', () => {
  const courses = [
    { code: 'EE-224' },
    { code: '18-06' },
    { code: 'CS-101' },
    { code: 'CS-229' },
    { code: 'ARCH-121' },
  ];
  const groups = groupBySubject(courses, (course) => course.code);

  assert.deepEqual(
    groups.map((group) => group.code),
    ['ARCH', 'CS', 'EE', UNCODED],
    'sorted by subject name, uncoded last',
  );
  assert.equal(groups.find((group) => group.code === 'CS')?.items.length, 2);
  assert.equal(
    groups.reduce((sum, group) => sum + group.items.length, 0),
    courses.length,
    'no course may be dropped',
  );
});

test('grouping an empty list yields no groups', () => {
  assert.deepEqual(groupBySubject([], () => 'CS-101'), []);
});
