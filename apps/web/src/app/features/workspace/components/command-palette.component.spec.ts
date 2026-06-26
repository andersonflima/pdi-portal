import { describe, expect, it } from 'vitest';
import { filterCommands, type CommandItem } from './command-palette.component';

const COMMANDS: CommandItem[] = [
  { id: 'open-board', label: 'Open Board', description: 'Canvas colaborativo' },
  { id: 'open-report', label: 'Open Report', description: 'Progresso e evolucao' },
  { id: 'open-users', label: 'Open Users', description: 'Gestao de pessoas' }
];

describe('filterCommands', () => {
  it('returns all commands when the query is empty or whitespace', () => {
    expect(filterCommands(COMMANDS, '')).toHaveLength(3);
    expect(filterCommands(COMMANDS, '   ')).toHaveLength(3);
  });

  it('matches against the label case-insensitively', () => {
    const result = filterCommands(COMMANDS, 'BOARD');
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('open-board');
  });

  it('matches against the description too', () => {
    const result = filterCommands(COMMANDS, 'pessoas');
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('open-users');
  });

  it('returns an empty list when nothing matches', () => {
    expect(filterCommands(COMMANDS, 'nonexistent')).toEqual([]);
  });

  it('does not mutate or alias the source array', () => {
    const result = filterCommands(COMMANDS, '');
    expect(result).not.toBe(COMMANDS);
  });
});
