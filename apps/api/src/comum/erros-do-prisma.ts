/**
 * Violacao de indice unico (`P2002`).
 *
 * Usada onde a verificacao previa existe para dar mensagem boa no caso comum,
 * mas nao e garantia: duas requisicoes simultaneas passam pela verificacao e
 * colidem no indice. So o banco decide quem chegou primeiro, e e esta checagem
 * que transforma a colisao em resposta tratada em vez de erro 500.
 */
export function ehViolacaoDeUnicidade(erro: unknown): boolean {
  return (
    typeof erro === 'object' &&
    erro !== null &&
    'code' in erro &&
    (erro as { code?: string }).code === 'P2002'
  );
}
