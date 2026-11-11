import { calculateLexorank } from '../src/utils/lexorank';

describe('Algoritmo de Posicionamento Alfanumérico Lexorank', () => {
  test('Deve retornar "m" como ponto de partida neutro quando prev e next são nulos', () => {
    const result = calculateLexorank(null, null);
    expect(result).toBe('m');
  });

  test('Deve calcular corretamente uma posição intermediária entre "a" e "c"', () => {
    const result = calculateLexorank('a', 'c');
    expect(result).toBe('b');
  });

  test('Deve calcular uma posição intermediária estendendo níveis se houver colisão de vizinhos imediatos (ex: "a" e "b")', () => {
    const result = calculateLexorank('a', 'b');
    // Esperado gerar algo intermediário como "am" ou estender de forma lexográfica
    expect(result.startsWith('a')).toBe(true);
    expect(result.length).toBeGreaterThan(1);
  });

  test('Deve calcular corretamente uma posição no início da lista (antes de "g")', () => {
    const result = calculateLexorank(null, 'g');
    expect(result.localeCompare('g')).toBeLessThan(0);
    expect(result.length).toBeGreaterThan(0);
  });

  test('Deve calcular corretamente uma posição no final da lista (após "t")', () => {
    const result = calculateLexorank('t', null);
    expect(result.localeCompare('t')).toBeGreaterThan(0);
  });

  test('Assegurar ordenação consecutiva de mútiplas inserções dinâmicas', () => {
    let pos1 = calculateLexorank(null, null); // "m"
    let pos2 = calculateLexorank(pos1, null); // posterior a "m"
    let posBetween = calculateLexorank(pos1, pos2); // entre pos1 e pos2

    expect(pos1.localeCompare(pos2)).toBeLessThan(0);
    expect(pos1.localeCompare(posBetween)).toBeLessThan(0);
    expect(posBetween.localeCompare(pos2)).toBeLessThan(0);
  });
});
