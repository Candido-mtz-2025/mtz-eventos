// GERADO da funcao real de Tipos, sem I/O.
export const sha256='20769543378a5c1a127eb3fa9812b00617a59702730e7d73f14b48ec1b7ade14';
export function normalizarNomeTipo(valor) {
    return String(valor || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
}
