/**
 * Algoritmo Lexorank (Posicionamento Fracionário em Base Alfanumérica)
 * Permite inserções constantes O(1) de cards entre duas strings arbitrárias de ordenação,
 * sem a necessidade de reordenar ou atualizar as posições das demais tarefas no banco.
 *
 * Utiliza o conjunto de caracteres de 'a' a 'z'.
 */

const CHARS = 'abcdefghijklmnopqrstuvwxyz';
const MIN_CHAR = CHARS[0]; // 'a'
const MAX_CHAR = CHARS[CHARS.length - 1]; // 'z'

/**
 * Retorna o caractere na metade entre charA e charB.
 */
function getMiddleChar(charA: string, charB: string): string {
  const codeA = charA.charCodeAt(0);
  const codeB = charB.charCodeAt(0);
  const middle = Math.round((codeA + codeB) / 2);
  return String.fromCharCode(middle);
}

/**
 * Calcula uma nova string de posicionamento entre as duas chaves fornecidas.
 * Se prevRank for nulo, indica que o item está sendo inserido no início da lista.
 * Se nextRank for nulo, indica que o item está sendo inserido no final da lista.
 */
export function calculateLexorank(prevRank: string | null | undefined, nextRank: string | null | undefined): string {
  let prev = prevRank || '';
  let next = nextRank || '';

  // Se ambos forem vazios/nulos, inicializa com uma posição média neutra
  if (!prev && !next) {
    return 'm';
  }

  // Caso seja inserção antes do primeiro item (prev é vazio)
  if (!prev) {
    // Busca a metade entre o caractere mínimo 'a' e o primeiro caractere de 'next'
    const nextFirst = next[0] || MIN_CHAR;
    if (nextFirst > MIN_CHAR) {
      return getMiddleChar(MIN_CHAR, nextFirst) + next.slice(1);
    } else {
      // Se já era 'a', descemos um nível adicionando caracteres na frente (ex: 'am')
      return MIN_CHAR + calculateLexorank('', next.slice(1));
    }
  }

  // Caso seja inserção após o último item (next é vazio)
  if (!next) {
    const prevFirst = prev[0] || MAX_CHAR;
    if (prevFirst < MAX_CHAR) {
      return getMiddleChar(prevFirst, MAX_CHAR) + prev.slice(1);
    } else {
      // Se já era 'z', estendemos no final para criar um rank posterior
      return prev + 'm';
    }
  }

  // Caso comum: Inserção entre 'prev' e 'next'
  let i = 0;
  let result = '';

  while (true) {
    const pChar = prev[i] || MIN_CHAR;
    const nChar = next[i] || MAX_CHAR;

    if (pChar === nChar) {
      result += pChar;
      i++;
      continue;
    }

    const diff = nChar.charCodeAt(0) - pChar.charCodeAt(0);

    if (diff > 1) {
      // Existe espaço entre os dois caracteres na posição atual
      const middleChar = getMiddleChar(pChar, nChar);
      result += middleChar;
      break;
    } else {
      // A diferença é de apenas 1 caractere (ex: 'a' e 'b') ou negativa.
      // Precisamos descer um nível concatenando o caractere de prev e gerando o restante
      result += pChar;
      const restPrev = prev.slice(i + 1);
      const restNext = pChar === prev[i] ? '' : next.slice(i + 1);
      result += calculateLexorank(restPrev, restNext);
      break;
    }
  }

  return result;
}
