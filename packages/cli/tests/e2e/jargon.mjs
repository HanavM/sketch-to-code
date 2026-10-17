// Shared by the walkthrough e2e and the undo-label unit test (s2c-046).
/**
 * What a non-coder cannot be expected to read. Deliberately narrow: words like
 * "component" are judged in the doc by a person, this only catches the
 * mechanical leaks.
 */
export const JARGON = [
  [/\bsrc\/|\.jsx?\b|\.tsx?\b/, 'a file path'],
  [/\b[a-z]+\.[a-z]+:\d+:\d+/, 'a source location'],
  [/\bError:|TypeError|ReferenceError|\bat \w+ \(/, 'an exception'],
  [/\be\d{1,3}\b|\baction \d+\b|\bs\d+\b/, 'an internal id'],
  [/\bgit\b|\bstash\b|\bcommit\b|\bcheckpoint\b/, 'git'],
  [/\bHMR\b|\bAST\b|\bcodemod\b|\bDOM\b|\bsrcLoc\b|\bprops?\b/, 'internals'],
  // s2c-030: the shapes the old progress lines took
  [/^(safety|intent|rule|codemod|codegen|finish|candidate|verify|repair|done):/, 'a pipeline stage'],
  [/\b(POST|GET|PUT)\b|\/api\/|\.json\b/, 'an HTTP route or data file'],
  [/\bround \d|\(s\)|\bsnapshot/, 'developer narration'],
]
export const jargonIn = (line) => JARGON.filter(([re]) => re.test(line)).map(([, what]) => what)
