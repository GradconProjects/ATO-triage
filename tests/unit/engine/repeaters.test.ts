import { describe, expect, it } from 'vitest';
import type { Question, RepeaterSpec } from '@/src/engine/types';
import { childQuestions, itemLabel, repeaterQuestionForGroup, repeaterSpecs } from '@/src/engine/repeaters';
import { item, q, rec, view } from './fixtures';

const employerSpec: RepeaterSpec = { groupId: 'employer', itemLabel: 'Employer or payer', addLabel: 'Add another employer', minItems: 1, labelFrom: 'emp.employer.name' };
const toolSpec: RepeaterSpec = { groupId: 'tool_item', itemLabel: 'Tool', addLabel: 'Add another tool', minItems: 0 };

const bank: Question[] = [
  q({ id: 'emp.employer', type: 'repeater', repeater: employerSpec }),
  q({ id: 'emp.employer.name', type: 'text', repeaterGroup: 'employer' }),
  q({ id: 'emp.employer.gross', repeaterGroup: 'employer' }),
  q({ id: 'ded.tool', type: 'repeater', repeater: toolSpec }),
  q({ id: 'ded.tool.cost', repeaterGroup: 'tool_item' }),
  q({ id: 'ded.other' }),
];

describe('repeaters', () => {
  it('lists specs and children', () => {
    expect(repeaterSpecs(bank)).toEqual([employerSpec, toolSpec]);
    expect(childQuestions(bank, 'employer').map((x) => x.id)).toEqual(['emp.employer.name', 'emp.employer.gross']);
    expect(childQuestions(bank, 'nope')).toEqual([]);
    expect(repeaterQuestionForGroup(bank, 'tool_item')?.id).toBe('ded.tool');
    expect(repeaterQuestionForGroup(bank, 'nope')).toBeUndefined();
  });

  it('labels items from labelFrom, then the stored label, then a numbered fallback', () => {
    const items = [item('e1', 'employer', 0), item('e2', 'employer', 1, 'Stored'), item('e3', 'employer', 2)];
    const a = view([rec('emp.employer.name', 'Acme Pty Ltd', { item: 'e1' }), rec('emp.employer.name', '  ', { item: 'e3' })], items);
    expect(itemLabel(employerSpec, a, items[0]!)).toBe('Acme Pty Ltd');
    expect(itemLabel(employerSpec, a, items[1]!)).toBe('Stored');
    expect(itemLabel(employerSpec, a, items[2]!)).toBe('Employer or payer 3');
    // no labelFrom on the spec -> numbered by position in the group
    const tools = [item('t1', 'tool_item', 4), item('t2', 'tool_item', 9)];
    const b = view([], tools);
    expect(itemLabel(toolSpec, b, tools[1]!)).toBe('Tool 2');
    // unknown item falls back to sortOrder + 1
    expect(itemLabel(toolSpec, view(), item('zz', 'tool_item', 0))).toBe('Tool 1');
  });
});
