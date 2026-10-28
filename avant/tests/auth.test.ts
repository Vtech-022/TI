import { describe, expect, it } from 'vitest';
import { hashPassword, nameKey, validatePassword, verifyPassword } from '../src/shared/auth';

describe('senha', () => {
  it('aceita até 7 caracteres com letra, número e caractere especial', () => {
    expect(validatePassword('Av@2026')).toBeNull();
    expect(validatePassword('a1#b')).toBeNull();
  });
  it('recusa senhas fora da regra', () => {
    expect(validatePassword('Av@20261')).toMatch(/de 4 a 7/);
    expect(validatePassword('abc')).toMatch(/de 4 a 7/);
    expect(validatePassword('abcd12')).toMatch(/especial/);
    expect(validatePassword('abc@de')).toMatch(/número/);
    expect(validatePassword('123@45')).toMatch(/letra/);
    expect(validatePassword('a1 @')).toMatch(/espaços/);
  });
  it('guarda só o resumo e confere a senha', async () => {
    const h = await hashPassword('Av@2026');
    expect(h.hash).not.toContain('Av@2026');
    expect(await verifyPassword('Av@2026', h)).toBe(true);
    expect(await verifyPassword('av@2026', h)).toBe(false);
  });
  it('nomes iguais com acento ou maiúscula são a mesma conta', () => {
    expect(nameKey('  João  Silva ')).toBe(nameKey('joao silva'));
  });
});
