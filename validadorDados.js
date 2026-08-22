/**
 * VALIDADOR DE INTEGRIDADE DOS DADOS OFICIAIS
 */

const DICIONARIO = require('../config/dicionarioIndicadores');

class ValidadorDados {
    /**
     * Valida uma linha/registro de indicador
     * @param {Object} registro Registro bruto
     * @returns {{ valido: boolean, erros: string[] }}
     */
    validarRegistro(registro) {
        const erros = [];

        if (!registro.ibge_id || isNaN(Number(registro.ibge_id))) {
            erros.push("Código IBGE inválido ou ausente.");
        }

        if (!registro.cidade || typeof registro.cidade !== 'string' || registro.cidade.trim() === '') {
            erros.push("Nome da cidade ausente ou inválido.");
        }

        if (!registro.ano || isNaN(Number(registro.ano)) || Number(registro.ano) < 2000) {
            erros.push("Ano de referência inválido ou ausente.");
        }

        if (!registro.indicador || !DICIONARIO[registro.indicador]) {
            erros.push(`Indicador '${registro.indicador}' não está catalogado no Dicionário Oficial.`);
        }

        if (registro.valor === undefined || registro.valor === null || isNaN(Number(registro.valor))) {
            erros.push("Valor do indicador deve ser numérico.");
        }

        if (!registro.fonte || typeof registro.fonte !== 'string' || registro.fonte.trim() === '') {
            erros.push("Fonte oficial do dado é obrigatória para fins de auditoria.");
        }

        return {
            valido: erros.length === 0,
            erros
        };
    }
}

module.exports = new ValidadorDados();